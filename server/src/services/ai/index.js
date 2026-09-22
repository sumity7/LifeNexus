import crypto from 'node:crypto';
import { AIConversation, AIMessage } from '../../models/AI.js';
import { getAIProvider } from './providers/index.js';
import { AIError } from './errors.js';
import { DAY_PLAN_INTENT, renderContext, renderFacts, retrieveContext } from './context.js';
import { ACTION_JSON_SCHEMA, inspectAction } from './actions.js';
import { BASE_SYSTEM, DAY_PLAN_INSTRUCTIONS, MODE_HINTS, STRUCTURED_INSTRUCTIONS } from './prompts.js';
import { findUngroundedNumbers } from './facts.js';
import { allowedScopes, scopeList } from './scopes.js';
import { AppError } from '../../utils/AppError.js';
import { getPreferences } from '../../controllers/helpers.js';
import { serverToday } from '../../utils/dates.js';

const MAX_HISTORY = 12;
const MAX_PROPOSALS = 8;
const EPHEMERAL_TTL_MS = 60 * 60_000;

/**
 * Correlated step timing for /ai/chat, so a slow request (Gemini hang, retry storm,
 * a stuck DB query…) is diagnosable straight from server logs without reproducing it.
 * Silent in tests; negligible cost otherwise (a few console.log calls per request).
 */
const aiLog = process.env.NODE_ENV === 'test' ? () => {} : (...args) => console.log(...args);
async function timed(reqId, label, fn) {
  const t0 = Date.now();
  aiLog(`[AI CHAT ${reqId}] ${label} START`);
  try {
    return await fn();
  } finally {
    aiLog(`[AI CHAT ${reqId}] ${label} END ${Date.now() - t0}ms`);
  }
}

export async function loadAIPreferences(userId) {
  const { preferences, name } = await getPreferences(userId, true);
  return { ...preferences, name };
}

/** AI must be enabled by the user and configured on the server. */
export function assertAIReady(preferences, provider = getAIProvider()) {
  if (preferences.ai?.enabled === false) throw new AIError('AI_DISABLED');
  if (!provider.available) throw new AIError('AI_NOT_CONFIGURED');
  return provider;
}

/** Normalises any unexpected provider failure into a friendly AIError. */
async function callProvider(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (process.env.NODE_ENV !== 'test') console.error('AI provider failure:', err?.message);
    throw new AIError('AI_UNAVAILABLE', { cause: err });
  }
}

export function detectMode(message, explicit) {
  if (explicit) return explicit;
  const m = message.toLowerCase().trim();
  if (/^(create|add|schedule|set up|set a|make|log|start|plan|remind me|book|new)\b/.test(m) || /\b(create|add|schedule) (a|an|the|my)?\s*(task|event|reminder|goal|note|plan|habit|project|session|journal)/.test(m)) return 'create';
  if (/\b(reschedule|postpone|push back|move (my|the)|rename|mark .* (as )?(done|complete)|complete (my|the)|change (the|my)|update (the|my)|set .* (priority|deadline|due))\b/.test(m)) return 'act';
  if (/\b(what should i|recommend|suggest|prioriti[sz]e|which .* first|how should i)\b/.test(m)) return 'recommend';
  if (/\b(pattern|analy[sz]e|compare|trend|why (am|do|is)|correlat|insight|summari[sz]e my (week|month))\b/.test(m)) return 'analyze';
  return 'ask';
}

const isStructuredReply = (d) => !!d && typeof d.reply === 'string' && (d.actions === undefined || Array.isArray(d.actions));

function buildSystem({ mode, today, blocks, denied, preferences, message }) {
  const header = [
    `Today: ${today}. Currency: ${preferences.currency ?? 'USD'}. User's first name: ${String(preferences.name ?? '').split(' ')[0] || 'the user'}.`,
    denied.length ? `Modules NOT accessible for this request (AI access turned off by the user): ${scopeList(denied)}.` : 'All requested modules are accessible.',
    MODE_HINTS[mode],
    DAY_PLAN_INTENT.test(message) ? DAY_PLAN_INSTRUCTIONS : null,
  ].filter(Boolean).join('\n\n');
  return [
    { type: 'text', text: `${BASE_SYSTEM}\n\n${STRUCTURED_INSTRUCTIONS}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `${header}\n\n# CONTEXT\n${renderContext(blocks)}` },
  ];
}

/** Validates every model proposal; returns accepted proposals and why the rest were dropped. */
export async function vetProposals(userId, rawActions, scopes) {
  const accepted = [];
  const rejected = [];
  if (!Array.isArray(rawActions)) return { accepted, rejected };
  for (const action of rawActions.slice(0, MAX_PROPOSALS)) {
    const result = await inspectAction(userId, action?.type, action?.payload, { scopes });
    if (result.ok) accepted.push({ type: result.type, payload: result.payload, summary: result.summary, preview: result.preview, status: 'proposed' });
    else rejected.push({ type: result.type, reason: result.reason, message: result.message });
  }
  return { accepted, rejected };
}

export const permissionReply = (denied) =>
  `I can't use your **${scopeList(denied)}** data because AI access to ${denied.length === 1 ? 'that module' : 'those modules'} is turned off in **Settings → AI assistant**. Turn it back on there if you'd like me to help with this.`;

export async function chat(userId, { conversationId, message, mode: explicitMode, context: anchorInput, date }) {
  const reqId = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();
  aiLog(`[AI CHAT ${reqId}] START mode-hint=${explicitMode ?? 'auto'} conversationId=${conversationId ?? 'new'}`);

  const preferences = await loadAIPreferences(userId);
  const provider = assertAIReady(preferences);
  const today = date ?? serverToday();
  const mode = detectMode(message, explicitMode);
  const remember = preferences.ai?.rememberConversations !== false;

  const { conversation: loadedConversation, history } = await timed(reqId, 'load conversation + history', async () => {
    let conv = null;
    if (conversationId) {
      conv = await AIConversation.findOne({ _id: conversationId, user: userId });
      if (!conv) throw new AppError(404, 'Conversation not found');
    }
    const hist = conv
      ? await AIMessage.find({ conversation: conv._id, user: userId, role: { $in: ['user', 'assistant'] } }).sort({ createdAt: -1 }).limit(MAX_HISTORY).lean()
      : [];
    return { conversation: conv, history: hist };
  });
  let conversation = loadedConversation;
  const anchor = anchorInput ?? (conversation?.context?.type ? { type: conversation.context.type, id: conversation.context.id } : null);
  const messages = [...history.reverse().map((m) => ({ role: m.role, content: m.content || '…' })), { role: 'user', content: message }];

  const { blocks, used, denied, explicit, anchorScope, anchorUsed } = await timed(reqId, 'context retrieval', () =>
    retrieveContext(userId, { message, mode, anchor, preferences, today }),
  );

  const onlyDenied = explicit.length > 0 && explicit.every((s) => denied.includes(s)) && !anchorUsed;
  const anchorBlocked = !!anchorScope && denied.includes(anchorScope);

  let reply;
  let accepted = [];
  let rejected = [];
  let usage;
  let providerName = provider.name;
  let model = provider.model;

  if (onlyDenied || (anchorBlocked && !used.length)) {
    // Deterministic, honest answer: nothing is sent to the model.
    reply = permissionReply([...new Set([...(anchorBlocked ? [anchorScope] : []), ...denied])]);
    providerName = 'lifevexa';
    model = null;
  } else {
    const system = buildSystem({ mode, today, blocks, denied, preferences, message });
    const result = await timed(reqId, `provider call (${provider.name})`, () =>
      callProvider(() => provider.structured({ system, messages, schema: ACTION_JSON_SCHEMA, effort: mode === 'ask' ? 'low' : 'medium', validate: isStructuredReply })),
    );
    if (!isStructuredReply(result?.data)) throw new AIError('AI_BAD_OUTPUT');
    reply = result.data.reply.trim() || 'I don’t have anything to add.';
    ({ accepted, rejected } = await timed(reqId, 'action validation', () => vetProposals(userId, result.data.actions, allowedScopes(preferences))));
    usage = result.usage;
  }

  const assistant = await timed(reqId, 'persistence', async () => {
    if (!conversation) {
      conversation = await AIConversation.create({
        user: userId,
        title: message.replace(/\s+/g, ' ').slice(0, 60),
        context: anchorInput ?? undefined,
        ephemeral: !remember,
        expiresAt: remember ? null : new Date(Date.now() + EPHEMERAL_TTL_MS),
      });
    }
    const expiresAt = conversation.ephemeral ? conversation.expiresAt : null;
    await AIMessage.create({ user: userId, conversation: conversation._id, role: 'user', content: message, mode, expiresAt });
    const assistantMsg = await AIMessage.create({
      user: userId, conversation: conversation._id, role: 'assistant', content: reply, mode, sources: used, denied,
      actions: accepted, rejectedActions: rejected.map(({ type, reason }) => ({ type, reason })), provider: providerName, model, usage, expiresAt,
    });
    conversation.lastMessageAt = new Date();
    await conversation.save();
    return assistantMsg;
  });
  aiLog(`[AI CHAT ${reqId}] RESPONSE ${Date.now() - t0}ms`);

  return {
    conversation: { _id: conversation._id, title: conversation.title, ephemeral: conversation.ephemeral },
    message: assistant.toJSON(),
    mode,
    sources: used,
    denied,
    rejectedActions: rejected,
  };
}

/**
 * Narrative for computed facts (brief / review). The model only phrases the
 * facts; any number not present in them causes one correction attempt, then
 * the narrative is withheld rather than shown with invented statistics.
 */
export async function generateNarrative(provider, { system, facts, instruction, maxTokens = 1200 }) {
  const factsJson = JSON.stringify(facts);
  const base = [{ role: 'user', content: `${instruction}\n\n${renderFacts(facts)}` }];
  let messages = base;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await callProvider(() => provider.generate({ system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages, effort: 'low', maxTokens }));
    if (result.refused) return { text: null, withheld: 'refused' };
    const text = String(result.text ?? '').trim();
    if (!text) return { text: null, withheld: 'empty' };
    const ungrounded = findUngroundedNumbers(text, factsJson);
    if (!ungrounded.length) return { text, usage: result.usage };
    messages = [...base, { role: 'assistant', content: text }, { role: 'user', content: `These numbers are not in the facts: ${ungrounded.join(', ')}. Rewrite using only numbers that appear in the facts.` }];
  }
  return { text: null, withheld: 'ungrounded' };
}

export const hashFacts = (facts) => crypto.createHash('sha1').update(JSON.stringify(facts)).digest('hex');

/** One-shot generation anchored to a single entity (note actions). */
export async function anchoredGeneration(userId, { anchor, prompt, structured = false, maxTokens }) {
  const preferences = await loadAIPreferences(userId);
  const provider = assertAIReady(preferences);
  const { blocks, anchorScope, anchorUsed } = await retrieveContext(userId, { message: prompt, mode: 'ask', anchor, preferences, onlyAnchor: true });
  if (!anchorUsed) {
    if (anchorScope && !allowedScopes(preferences).includes(anchorScope)) throw new AIError('AI_SCOPE_DISABLED');
    throw new AppError(404, 'Item not found');
  }
  const system = [
    { type: 'text', text: `${BASE_SYSTEM}${structured ? `\n\n${STRUCTURED_INSTRUCTIONS}` : ''}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: `Today: ${serverToday()}.\n\n# CONTEXT\n${renderContext(blocks)}` },
  ];
  const messages = [{ role: 'user', content: prompt }];
  if (!structured) {
    const result = await callProvider(() => provider.generate({ system, messages, effort: 'low', maxTokens }));
    return { reply: result.text ?? '', actions: [] };
  }
  const result = await callProvider(() => provider.structured({ system, messages, schema: ACTION_JSON_SCHEMA, effort: 'low', validate: isStructuredReply }));
  if (!isStructuredReply(result?.data)) throw new AIError('AI_BAD_OUTPUT');
  const { accepted, rejected } = await vetProposals(userId, result.data.actions, allowedScopes(preferences));
  return { reply: result.data.reply, actions: accepted, rejectedActions: rejected };
}
