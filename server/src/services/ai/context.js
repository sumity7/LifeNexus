import { Task } from '../../models/Task.js';
import { Project } from '../../models/Project.js';
import { Goal } from '../../models/Goal.js';
import { Event } from '../../models/Event.js';
import { Reminder } from '../../models/Reminder.js';
import { Habit } from '../../models/Habit.js';
import { Note } from '../../models/Note.js';
import { JournalEntry } from '../../models/Journal.js';
import { Document } from '../../models/Document.js';
import { HealthLog, Workout } from '../../models/Health.js';
import { Transaction } from '../../models/Finance.js';
import { FocusSession } from '../../models/FocusSession.js';
import { ActivityLog } from '../../models/ActivityLog.js';
import { withHabitStats } from '../habits.js';
import { withGoalProgress } from '../goals.js';
import { getMonthSummary } from '../finance.js';
import { listRoutines } from '../routines.js';
import { getLinksFor } from '../links.js';
import { withProjectStats } from '../../controllers/projects.js';
import { addDays, serverToday } from '../../utils/dates.js';
import { escapeRegex } from '../../validators/common.js';
import { AI_SCOPES } from '../../constants.js';
import { activityScope, allowedScopes, ENTITY_SCOPE } from './scopes.js';

/**
 * Context engine. Retrieves only what a request needs, only from modules the
 * user allows, as compact text blocks. All stored user content is later
 * wrapped in <user_data> fences and treated as untrusted data by the prompt.
 */

const SCOPE_KEYWORDS = {
  tasks: /\b(tasks?|todos?|to-dos?|overdue|due|priorit\w*|deadlines?|productiv\w*|finish|complete)\b/i,
  projects: /\b(projects?|portfolio|launch|on track|behind)\b/i,
  calendar: /\b(calendar|events?|meetings?|schedule|appointments?|free time|busy|tomorrow|next week|reminders?|remind)\b/i,
  goals: /\b(goals?|milestones?|objectives?|on track|behind)\b/i,
  habits: /\b(habits?|streaks?|consisten\w*|missed)\b/i,
  routines: /\b(routines?|morning|evening|wind-down)\b/i,
  health: /\b(health|sleep|slept|water|hydration|mood|energy|workouts?|exercise|weight|steps|tired|fitness)\b/i,
  finance: /\b(spend|spent|spending|money|budgets?|expenses?|income|sav(e|ing|ings)|costs?|subscriptions?|net worth|financ\w*|salary|bills?|rupees?|dollars?)\b|[₹$€£]/i,
  notes: /\b(notes?|wrote|ideas?)\b/i,
  journal: /\b(journal|reflect\w*|grateful|gratitude|felt|feeling|wins?|lessons?|diary)\b/i,
  documents: /\b(documents?|passport|licen[cs]e|insurance|polic(y|ies)|certificates?|expir\w*|renew\w*|id card|visa|files?)\b/i,
  focus: /\b(focus sessions?|pomodoro|deep work|focused|concentrat\w*|focus time)\b/i,
};

const DAY_INTENT = /\b(what should i|focus on|prioriti[sz]e|plan (my|the) day|my day|today)\b/i;
const WEEK_INTENT = /\b(my week|this week|last week|weekly|week went|review)\b/i;
const DAY_SCOPES = ['tasks', 'projects', 'goals', 'calendar', 'routines', 'habits', 'focus'];

export function selectScopes(message, mode, anchor) {
  const explicit = AI_SCOPES.filter((s) => SCOPE_KEYWORDS[s].test(message));
  const wanted = new Set(explicit);
  if (DAY_INTENT.test(message) || WEEK_INTENT.test(message) || ((mode === 'recommend' || mode === 'analyze') && !explicit.length)) {
    DAY_SCOPES.forEach((s) => wanted.add(s));
  }
  const anchorScope = anchor?.type ? ENTITY_SCOPE[anchor.type] ?? null : null;
  if (anchorScope) wanted.add(anchorScope);
  return { wanted: AI_SCOPES.filter((s) => wanted.has(s)), explicit, anchorScope };
}

const fmtMoney = (n, currency) => `${currency} ${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const line = (s) => `- ${s}`;
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n)}…` : s ?? '');
const ref = (doc) => `[id:${doc._id}]`;

const retrievers = {
  async tasks(userId, { today, allowed }) {
    const tasks = await Task.find({ user: userId, status: { $ne: 'done' } }).sort({ dueDate: 1 }).limit(40).populate('goal', 'title').populate('project', 'title').lean();
    const done = await Task.countDocuments({ user: userId, completedOn: { $gte: addDays(today, -6), $lte: today } });
    const rows = tasks.map((t) => {
      const due = t.dueDate ? (t.dueDate < today ? `OVERDUE (due ${t.dueDate})` : t.dueDate === today ? 'due today' : `due ${t.dueDate}`) : 'no due date';
      const rel = [allowed.has('goals') && t.goal?.title && `goal: ${t.goal.title}`, allowed.has('projects') && t.project?.title && `project: ${t.project.title}`].filter(Boolean).join(', ');
      return line(`${ref(t)} [${t.priority}] ${t.title} — ${due}${t.status === 'in_progress' ? ', in progress' : ''}${rel ? ` (${rel})` : ''}${t.subtasks?.length ? ` · ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length} subtasks` : ''}`);
    });
    return { title: 'Open tasks', text: `${done} tasks completed in the last 7 days.\n${rows.join('\n') || 'No open tasks.'}` };
  },

  async projects(userId, { allowed }) {
    const docs = await Project.find({ user: userId, status: { $in: ['active', 'on_hold'] } }).populate('goal', 'title').limit(20);
    const projects = await withProjectStats(userId, docs);
    const rows = projects.map((p) => line(`${ref(p)} ${p.title} [${p.status}] — ${p.progress}% (${p.stats.tasksDone}/${p.stats.tasks} tasks, ${p.stats.focusMinutes} focus min)${p.dueDate ? `, due ${p.dueDate}` : ''}${allowed.has('goals') && p.goal?.title ? ` → goal "${p.goal.title}"` : ''}`));
    return { title: 'Active projects', text: rows.join('\n') || 'No active projects.' };
  },

  async calendar(userId, { today }) {
    const from = new Date(`${today}T00:00:00`);
    const to = new Date(`${addDays(today, 7)}T23:59:59`);
    const events = await Event.find({ user: userId, start: { $lt: to }, $or: [{ end: { $gt: from } }, { 'recurrence.freq': { $ne: 'none' } }] }).sort({ start: 1 }).limit(40).lean();
    const rows = events.map((e) => {
      const s = new Date(e.start);
      const when = e.allDay ? s.toISOString().slice(0, 10) : s.toISOString().slice(0, 16).replace('T', ' ');
      return line(`${ref(e)} ${e.title} — ${when}${e.allDay ? ' (all day)' : ' UTC'}${e.recurrence?.freq !== 'none' ? ` (repeats ${e.recurrence.freq} since ${s.toISOString().slice(0, 10)})` : ''}${e.location ? ` @ ${e.location}` : ''}`);
    });
    const reminders = await Reminder.find({ user: userId, completed: false, date: { $lte: addDays(today, 30) } }).sort({ date: 1 }).limit(15).lean();
    return {
      title: 'Calendar (next 7 days) and reminders (next 30 days)',
      text: `${rows.join('\n') || 'No events.'}\nReminders:\n${reminders.map((r) => line(`${ref(r)} ${r.title} — ${r.date}${r.time ? ` ${r.time}` : ''}${r.recurrence !== 'none' ? ` (${r.recurrence})` : ''}`)).join('\n') || '- none'}`,
    };
  },

  async goals(userId) {
    const goals = await withGoalProgress(userId, await Goal.find({ user: userId, status: { $in: ['active', 'paused'] } }).limit(20));
    const rows = goals.map((g) => {
      const ms = g.milestones.map((m) => `${m.done ? '✓' : '○'} ${m.title}`).join('; ');
      return line(`${ref(g)} ${g.title} [${g.status}] — ${g.progress}% (${g.stats.milestonesDone}/${g.stats.milestones} milestones, ${g.stats.tasksDone}/${g.stats.tasks} tasks)${g.startDate ? `, started ${g.startDate}` : ''}${g.deadline ? `, deadline ${g.deadline}` : ''}${ms ? `. Milestones: ${ms}` : ''}`);
    });
    return { title: 'Goals', text: rows.join('\n') || 'No active goals.' };
  },

  async habits(userId, { today }) {
    const habits = await withHabitStats(userId, await Habit.find({ user: userId, archived: false }).limit(20), today, { days: 30 });
    const rows = habits.map((h) => line(`${h.name} (${h.frequency === 'weekly' ? `${h.timesPerWeek}×/week` : 'daily'}) — streak ${h.stats.currentStreak} ${h.stats.streakUnit}s, best ${h.stats.bestStreak}, 30-day consistency ${h.stats.completionRate}%, ${h.stats.doneToday ? 'done today' : 'not done today'}`));
    return { title: 'Habits', text: rows.join('\n') || 'No habits.' };
  },

  async routines(userId, { today }) {
    const routines = await listRoutines(userId, today, { active: true });
    const rows = routines.map((r) => line(`${r.name} (${r.type}${r.timeOfDay ? ` at ${r.timeOfDay}` : ''}) — today ${r.today.scheduled ? `${r.today.completed}/${r.today.total} steps` : 'not scheduled'}; last 7 days: ${r.history.map((h) => (h.scheduled ? `${h.pct}%` : '-')).join(' ')}; steps: ${r.steps.map((s) => s.title).join(', ')}`));
    return { title: 'Routines', text: rows.join('\n') || 'No routines.' };
  },

  async health(userId, { today }) {
    const logs = await HealthLog.find({ user: userId, date: { $gte: addDays(today, -13), $lte: today } }).sort({ date: 1 }).lean();
    const workouts = await Workout.find({ user: userId, date: { $gte: addDays(today, -13), $lte: today } }).sort({ date: -1 }).lean();
    const rows = logs.map((l) => line(`${l.date}: sleep ${l.sleepHours ?? '—'}h, water ${l.waterMl ?? 0}ml, mood ${l.mood ?? '—'}/5, energy ${l.energy ?? '—'}/5${l.weightKg ? `, weight ${l.weightKg}kg` : ''}${l.steps ? `, ${l.steps} steps` : ''}`));
    const wrows = workouts.map((w) => line(`Workout ${w.date}: ${w.type} ${w.durationMin}min (${w.intensity})${w.distanceKm ? ` ${w.distanceKm}km` : ''}`));
    return { title: 'Health logs (last 14 days) — tracked data, not medical records', text: [...rows, ...wrows].join('\n') || 'No health data.' };
  },

  async finance(userId, { today, currency }) {
    const month = today.slice(0, 7);
    const s = await getMonthSummary(userId, month, { trendMonths: 3 });
    const recent = await Transaction.find({ user: userId }).sort({ date: -1 }).limit(25).lean();
    const text = [
      `This month (${month}): income ${fmtMoney(s.income, currency)}, expenses ${fmtMoney(s.expense, currency)}, net ${fmtMoney(s.net, currency)}${s.savingsRate !== null ? `, savings rate ${s.savingsRate}%` : ''}.`,
      `Last month: income ${fmtMoney(s.previous.income, currency)}, expenses ${fmtMoney(s.previous.expense, currency)}.`,
      `Spending by category: ${s.expenseByCategory.map((c) => `${c.category} ${fmtMoney(c.total, currency)}`).join(', ') || 'none'}.`,
      `Budgets: ${s.budgets.map((b) => `${b.category} ${fmtMoney(b.spent, currency)}/${fmtMoney(b.limit, currency)} (${b.pct}%)`).join(', ') || 'none'}.`,
      'Recent transactions:',
      ...recent.map((t) => line(`${t.date} ${t.type} ${fmtMoney(t.amount, currency)} ${t.category}${t.description ? ` — ${t.description}` : ''}`)),
    ];
    return { title: 'Finance', text: text.join('\n') };
  },

  async notes(userId, { query }) {
    const filter = { user: userId, archived: false };
    const words = (query ?? '').split(/\W+/).filter((w) => w.length > 3).slice(0, 5);
    if (words.length) filter.$or = [{ title: new RegExp(words.map(escapeRegex).join('|'), 'i') }, { plainText: new RegExp(words.map(escapeRegex).join('|'), 'i') }];
    let notes = await Note.find(filter).sort({ pinned: -1, updatedAt: -1 }).limit(8).lean();
    if (!notes.length) notes = await Note.find({ user: userId, archived: false }).sort({ pinned: -1, updatedAt: -1 }).limit(5).lean();
    return { title: 'Notes (most relevant)', text: notes.map((n) => line(`"${n.title || 'Untitled'}" (${n.updatedAt.toISOString().slice(0, 10)}): ${clip(n.plainText, 400)}`)).join('\n') || 'No notes.' };
  },

  async journal(userId, { today }) {
    const entries = await JournalEntry.find({ user: userId, date: { $gte: addDays(today, -13), $lte: today } }).sort({ date: -1 }).lean();
    const rows = entries.map((e) =>
      line(`${e.date}${e.title ? ` "${e.title}"` : ''}: ${clip(e.content, 300)}${e.wins.length ? ` Wins: ${e.wins.join('; ')}.` : ''}${e.challenges.length ? ` Challenges: ${e.challenges.join('; ')}.` : ''}${e.gratitude.length ? ` Grateful for: ${e.gratitude.join('; ')}.` : ''}${e.intention ? ` Intention: ${e.intention}` : ''}`),
    );
    return { title: 'Journal (last 14 days)', text: rows.join('\n') || 'No journal entries.' };
  },

  async documents(userId, { today }) {
    const docs = await Document.find({ user: userId, archived: false }).sort({ expiryDate: 1, updatedAt: -1 }).limit(15).lean();
    const rows = docs.map((d) => line(`${d.title} [${d.category}]${d.expiryDate ? ` — expires ${d.expiryDate}${d.expiryDate < today ? ' (EXPIRED)' : ''}` : ''}${d.tags.length ? ` tags: ${d.tags.join(', ')}` : ''}${d.extraction?.summary ? ` — ${clip(d.extraction.summary, 200)}` : ''}${d.notes ? ` — ${clip(d.notes, 150)}` : ''}`));
    return { title: 'Documents (metadata only; file contents are not available unless extracted)', text: rows.join('\n') || 'No documents.' };
  },

  async focus(userId, { today, allowed }) {
    const sessions = await FocusSession.find({ user: userId, status: 'completed', date: { $gte: addDays(today, -13), $lte: today } }).sort({ date: -1 }).limit(30).populate('task', 'title').populate('goal', 'title').populate('project', 'title').lean();
    const total = sessions.reduce((s, x) => s + x.focusedSeconds, 0);
    return {
      title: 'Focus sessions (last 14 days)',
      text: `${sessions.length} sessions, ${Math.round(total / 60)} minutes total.\n${sessions.slice(0, 15).map((s) => line(`${s.date}: ${Math.round(s.focusedSeconds / 60)}min${s.label ? ` "${s.label}"` : ''}${allowed.has('tasks') && s.task ? ` → task ${s.task.title}` : ''}${allowed.has('projects') && s.project ? ` → project ${s.project.title}` : ''}${allowed.has('goals') && s.goal ? ` → goal ${s.goal.title}` : ''}`)).join('\n')}`,
    };
  },
};

/** The single entity a conversation is anchored to (e.g. the note being read). */
async function anchorContext(userId, anchor, allowed) {
  const { type, id } = anchor;
  let text = null;
  if (type === 'note') {
    const n = await Note.findOne({ _id: id, user: userId }).lean();
    if (n) text = `NOTE "${n.title || 'Untitled'}" (tags: ${n.tags.join(', ') || 'none'}):\n${clip(n.plainText, 12000)}`;
  } else if (type === 'document') {
    const d = await Document.findOne({ _id: id, user: userId }).select('+extraction.text').lean();
    if (d) text = `DOCUMENT "${d.title}" [${d.category}] file ${d.originalName} (${d.mimeType}), expiry ${d.expiryDate ?? 'none'}, tags ${d.tags.join(', ') || 'none'}, notes: ${d.notes || 'none'}.\n${d.extraction?.status === 'done' && d.extraction.text ? `Extracted text:\n${clip(d.extraction.text, 12000)}` : 'File contents are NOT available (no text extraction). Answer only from the metadata above and say so if asked about contents.'}`;
  } else if (type === 'goal' || type === 'project') {
    const Model = type === 'goal' ? Goal : Project;
    const doc = await Model.findOne({ _id: id, user: userId }).lean();
    if (doc) {
      const tasks = allowed.has('tasks') ? await Task.find({ user: userId, [type]: id }).lean() : [];
      text = `${type.toUpperCase()} ${ref(doc)} "${doc.title}" [${doc.status}]: ${doc.description || ''}${allowed.has('tasks') ? `\nTasks: ${tasks.map((t) => `${ref(t)} ${t.status === 'done' ? '✓' : '○'} ${t.title}${t.dueDate ? ` (${t.dueDate})` : ''}`).join('; ') || 'none'}` : ''}`;
    }
  } else if (type === 'task') {
    const t = await Task.findOne({ _id: id, user: userId }).lean();
    if (t) text = `TASK ${ref(t)} "${t.title}" [${t.status}, ${t.priority}] due ${t.dueDate ?? 'none'}. Notes: ${t.notes || 'none'}. Subtasks: ${t.subtasks.map((s) => `${s.done ? '✓' : '○'} ${s.title}`).join('; ') || 'none'}`;
  } else if (type === 'journal') {
    const e = await JournalEntry.findOne({ _id: id, user: userId }).lean();
    if (e) text = `JOURNAL ${e.date}: ${e.content}\nWins: ${e.wins.join('; ')}\nChallenges: ${e.challenges.join('; ')}\nGratitude: ${e.gratitude.join('; ')}\nLessons: ${e.lessons}\nIntention: ${e.intention}`;
  }
  if (!text) return null;
  const links = (await getLinksFor(userId, type, id)).filter((l) => allowed.has(ENTITY_SCOPE[l.type]));
  if (links.length) text += `\nConnected items: ${links.map((l) => `${l.type} "${l.label}"`).join(', ')}`;
  return { title: 'Focused item', text };
}

/** Prevents stored content from closing the data fence and posing as instructions. */
const neutralize = (s) => String(s).replace(/<\s*\/?\s*(user_data|facts)\b[^>]*>/gi, '[removed tag]');

export const renderContext = (blocks) =>
  blocks.length
    ? blocks.map((b) => `<user_data module="${b.module}" title="${b.title}">\n${neutralize(b.text)}\n</user_data>`).join('\n\n')
    : 'No data was retrieved for this request.';

export const renderFacts = (facts) => `<facts>\n${neutralize(JSON.stringify(facts))}\n</facts>`;

/**
 * Builds context for a request. Disabled modules are never queried.
 * Returns { blocks, used, denied, explicit, anchorScope, anchorUsed }.
 */
export async function retrieveContext(userId, { message, mode, anchor, preferences, today = serverToday(), onlyAnchor = false }) {
  const allowed = new Set(allowedScopes(preferences));
  const { wanted, explicit, anchorScope } = selectScopes(onlyAnchor ? '' : message, mode, anchor);
  const used = onlyAnchor ? [] : wanted.filter((s) => allowed.has(s));
  const denied = wanted.filter((s) => !allowed.has(s));
  const opts = { today, currency: preferences.currency ?? 'USD', query: message, allowed };

  const blocks = [];
  for (const scope of used) {
    if (scope === anchorScope && anchor && ['note', 'document'].includes(anchor.type)) continue;
    const block = await retrievers[scope](userId, opts);
    if (block) blocks.push({ ...block, module: scope });
  }

  let anchorUsed = false;
  if (anchor && anchorScope && allowed.has(anchorScope)) {
    const block = await anchorContext(userId, anchor, allowed);
    if (block) {
      blocks.unshift({ ...block, module: anchorScope });
      anchorUsed = true;
    }
  }

  // Recent activity only for modules this request actually uses.
  const usedSet = new Set([...used, ...(anchorUsed ? [anchorScope] : [])]);
  if (usedSet.size) {
    const recent = await ActivityLog.find({ user: userId }).sort({ createdAt: -1 }).limit(40).lean();
    const visible = recent.filter((a) => usedSet.has(activityScope(a))).slice(0, 12);
    if (visible.length) blocks.push({ title: 'Recent activity', module: 'activity', text: visible.map((a) => line(`${a.date} ${a.type.replace(/_/g, ' ')}: ${a.title}`)).join('\n') });
  }

  return { blocks, used: [...usedSet], denied, explicit, anchorScope, anchorUsed };
}
