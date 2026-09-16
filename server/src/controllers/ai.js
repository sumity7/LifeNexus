import { AIConversation, AIInsight, AIMessage } from '../models/AI.js';
import { Note } from '../models/Note.js';
import { AppError, notFound } from '../utils/AppError.js';
import { addDays, serverToday, startOfWeek } from '../utils/dates.js';
import { chat, loadAIPreferences, generateNarrative, hashFacts, anchoredGeneration } from '../services/ai/index.js';
import { getAIProvider } from '../services/ai/providers/index.js';
import { executeAction } from '../services/ai/actions.js';
import { AIError } from '../services/ai/errors.js';
import { BRIEF_SYSTEM, NOTE_ACTION_PROMPTS, REVIEW_SYSTEM } from '../services/ai/prompts.js';
import { briefFactsForAI, reviewFactsForAI } from '../services/ai/facts.js';
import { allowedScopes } from '../services/ai/scopes.js';
import { buildBrief } from '../services/brief.js';
import { buildWeeklyReview } from '../services/review.js';
import { neighborhood } from '../services/graph.js';
import { logActivity } from '../services/activity.js';

export async function status(req, res) {
  const provider = getAIProvider();
  const preferences = await loadAIPreferences(req.user.id);
  res.json({
    data: {
      configured: provider.available,
      provider: provider.name,
      model: provider.model,
      issue: provider.available ? null : provider.issue ?? 'no_provider',
      enabled: preferences.ai?.enabled !== false,
      scopes: preferences.ai?.scopes ?? {},
    },
  });
}

export async function sendMessage(req, res) {
  const result = await chat(req.user.id, req.valid.body);
  res.json({ data: result });
}

/** Conversations kept only for the session (remember-conversations off) never appear in history. */
export async function listConversations(req, res) {
  const data = await AIConversation.find({ user: req.user.id, ephemeral: { $ne: true } }).sort({ lastMessageAt: -1 }).limit(50).lean();
  res.json({ data });
}

export async function getConversation(req, res) {
  const conversation = await AIConversation.findOne({ _id: req.valid.params.id, user: req.user.id }).lean();
  if (!conversation) throw notFound('Conversation');
  const messages = await AIMessage.find({ conversation: conversation._id, user: req.user.id }).sort({ createdAt: 1 }).limit(req.valid.query.limit ?? 200).lean();
  res.json({ data: { ...conversation, messages } });
}

export async function renameConversation(req, res) {
  const conversation = await AIConversation.findOneAndUpdate({ _id: req.valid.params.id, user: req.user.id }, { $set: { title: req.valid.body.title } }, { new: true });
  if (!conversation) throw notFound('Conversation');
  res.json({ data: conversation });
}

export async function deleteConversation(req, res) {
  const result = await AIConversation.deleteOne({ _id: req.valid.params.id, user: req.user.id });
  if (!result.deletedCount) throw notFound('Conversation');
  await AIMessage.deleteMany({ conversation: req.valid.params.id, user: req.user.id });
  res.status(204).end();
}

export async function clearConversations(req, res) {
  await Promise.all([AIConversation.deleteMany({ user: req.user.id }), AIMessage.deleteMany({ user: req.user.id })]);
  res.status(204).end();
}

/**
 * The confirmation step: executes or rejects a proposal attached to a message.
 * Never trusts the stored payload blindly — executeAction re-validates ownership,
 * scope permissions and the schema before touching the database.
 */
export async function decideAction(req, res) {
  const { messageId, actionId, decision, date } = req.valid.body;
  const message = await AIMessage.findOne({ _id: messageId, user: req.user.id });
  if (!message) throw notFound('Message');
  const action = message.actions.id(actionId);
  if (!action) throw notFound('Action');
  if (action.status !== 'proposed') throw new AppError(409, `This action was already ${action.status}`, { code: 'ACTION_ALREADY_DECIDED' });

  if (decision === 'reject') {
    action.status = 'rejected';
    action.decidedAt = new Date();
    await message.save();
    await logActivity(req.user.id, 'ai_action_rejected', {
      title: action.summary,
      date: date ?? serverToday(),
      meta: { actionType: action.type, messageId: message._id, confirmedBy: 'user' },
    });
    return res.json({ data: { action, result: null } });
  }

  const preferences = await loadAIPreferences(req.user.id);
  try {
    // logActivity for the execution itself happens inside executeAction, tagged
    // { via: 'ai', confirmedBy: 'user', actionType } — this messageId enriches that record.
    const result = await executeAction(req.user.id, action.type, action.payload, {
      scopes: allowedScopes(preferences),
      today: date ?? serverToday(),
      meta: { messageId: message._id },
    });
    action.status = 'executed';
    action.resultId = result.id;
    action.decidedAt = new Date();
    await message.save();
    res.json({ data: { action, result } });
  } catch (err) {
    action.status = 'failed';
    action.error = err instanceof AppError ? err.message : 'Action failed';
    action.decidedAt = new Date();
    await message.save();
    throw err;
  }
}

/** Executes a one-off proposal that isn't attached to a conversation (e.g. from a note action). */
export async function executeProposal(req, res) {
  const { type, payload } = req.valid.body;
  const preferences = await loadAIPreferences(req.user.id);
  const result = await executeAction(req.user.id, type, payload, { scopes: allowedScopes(preferences), today: serverToday() });
  res.status(201).json({ data: result });
}

/* ───── Daily brief ───── */
// The database always computes the facts (buildBrief); the AI only phrases them,
// and only when its output is fully grounded in those facts (see generateNarrative).

export async function dailyBrief(req, res) {
  const today = req.valid.query.date ?? serverToday();
  const refresh = req.valid.query.refresh === 'true';
  const data = await buildBrief(req.user.id, today);
  const provider = getAIProvider();
  const preferences = await loadAIPreferences(req.user.id);
  const scopes = allowedScopes(preferences);
  const aiOn = provider.available && preferences.ai?.enabled !== false && preferences.notifications?.dailyBrief !== false;

  let narrative = null;
  let narrativeWithheld = null;
  if (aiOn) {
    const facts = briefFactsForAI(data.summary, scopes);
    const factsHash = hashFacts(facts);
    const existing = refresh ? null : await AIInsight.findOne({ user: req.user.id, kind: 'daily_brief', period: today, module: null }).lean();
    if (existing && existing.factsHash === factsHash) {
      narrative = existing.content;
    } else {
      try {
        const result = await generateNarrative(provider, { system: BRIEF_SYSTEM, facts, instruction: "Write today's brief from these facts." });
        if (result.text) {
          narrative = result.text;
          await AIInsight.findOneAndUpdate(
            { user: req.user.id, kind: 'daily_brief', period: today, module: null },
            { $set: { content: narrative, factsHash, provider: provider.name, model: provider.model, data: undefined } },
            { upsert: true },
          );
        } else {
          narrativeWithheld = result.withheld;
        }
      } catch (err) {
        if (!(err instanceof AIError)) throw err;
        narrativeWithheld = 'error';
      }
    }
  }
  res.json({ data: { ...data, narrative, narrativeWithheld, ai: { configured: provider.available, enabled: aiOn } } });
}

/* ───── Weekly review ───── */

export async function weeklyReview(req, res) {
  const today = serverToday();
  const preferences = await loadAIPreferences(req.user.id);
  const weekStart = req.valid.query.week ?? startOfWeek(today, preferences.weekStartsOn ?? 1);
  const refresh = req.valid.query.refresh === 'true';
  const data = await buildWeeklyReview(req.user.id, weekStart, today);
  const provider = getAIProvider();
  const scopes = allowedScopes(preferences);
  const aiOn = provider.available && preferences.ai?.enabled !== false;

  let narrative = null;
  let narrativeWithheld = null;
  if (aiOn) {
    const facts = reviewFactsForAI(data, scopes);
    const factsHash = hashFacts(facts);
    const weekOver = addDays(weekStart, 6) < today;
    const existing = refresh ? null : await AIInsight.findOne({ user: req.user.id, kind: 'weekly_review', period: weekStart, module: null }).lean();
    // A finished week's narrative is stable; the current week is re-checked periodically as facts change.
    const fresh = existing && existing.factsHash === factsHash && (weekOver || existing.updatedAt > new Date(Date.now() - 6 * 3600_000));
    if (fresh) {
      narrative = existing.content;
    } else {
      try {
        const result = await generateNarrative(provider, {
          system: REVIEW_SYSTEM,
          facts,
          instruction: `Write the weekly review for ${data.range.from} to ${data.range.to}.`,
          maxTokens: 900,
        });
        if (result.text) {
          narrative = result.text;
          await AIInsight.findOneAndUpdate(
            { user: req.user.id, kind: 'weekly_review', period: weekStart, module: null },
            { $set: { content: narrative, factsHash, provider: provider.name, model: provider.model, data: undefined } },
            { upsert: true },
          );
        } else {
          narrativeWithheld = result.withheld;
        }
      } catch (err) {
        if (!(err instanceof AIError)) throw err;
        narrativeWithheld = 'error';
      }
    }
  }
  res.json({ data: { ...data, narrative, narrativeWithheld, ai: { configured: provider.available, enabled: aiOn } } });
}

/* ───── Note actions ───── */

export async function noteAction(req, res) {
  const note = await Note.findOne({ _id: req.valid.params.id, user: req.user.id }).lean();
  if (!note) throw notFound('Note');
  const { action, question } = req.valid.body;
  const instruction = NOTE_ACTION_PROMPTS[action];
  const prompt = action === 'ask' ? `${instruction}\n\nQuestion: ${question || 'What is this note about?'}` : instruction;
  const anchor = { type: 'note', id: note._id };
  const structured = action === 'extract_tasks' || action === 'extract_dates';

  const result = await anchoredGeneration(req.user.id, { anchor, prompt, structured, maxTokens: action === 'rewrite' ? 3000 : 1200 });
  const actions = (result.actions ?? []).map((a) => ({ ...a, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }));
  res.json({ data: { reply: result.reply, actions, rejectedActions: result.rejectedActions ?? [] } });
}

/* ───── Life graph ───── */

export async function graph(req, res) {
  const { type, id } = req.valid.query;
  res.json({ data: await neighborhood(req.user.id, type, id) });
}
