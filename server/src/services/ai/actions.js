import { z } from 'zod';
import { Task } from '../../models/Task.js';
import { Goal } from '../../models/Goal.js';
import { Project } from '../../models/Project.js';
import { Event } from '../../models/Event.js';
import { Reminder } from '../../models/Reminder.js';
import { Note } from '../../models/Note.js';
import { Habit } from '../../models/Habit.js';
import { JournalEntry } from '../../models/Journal.js';
import { FocusSession } from '../../models/FocusSession.js';
import { AppError } from '../../utils/AppError.js';
import { sanitizeNoteHtml, htmlToText } from '../../utils/html.js';
import { dateKey, objectId, timeHM } from '../../validators/common.js';
import { logActivity } from '../activity.js';
import { serverToday } from '../../utils/dates.js';
import { saveWithStatus } from '../../controllers/tasks.js';
import { AI_ACTION_TYPES, GOAL_CATEGORIES, GOAL_STATUSES, PRIORITIES, PROJECT_STATUSES, REMINDER_CATEGORIES } from '../../constants.js';
import { ACTION_SCOPE, SCOPE_LABELS } from './scopes.js';

/**
 * AI actions are proposals only. Each is validated (schema, dates, scope
 * permission, ownership of every referenced id) when proposed AND again when
 * the user confirms, then executed through the same models the controllers
 * use. The model's own wording is never shown as the action summary.
 */
const text = (max) => z.string().trim().min(1).max(max);
const aiDate = dateKey.refine((k) => k >= '1970-01-01' && k <= '2199-12-31', 'Date is out of range');
const hasChanges = (o) => Object.keys(o).some((k) => k !== 'id' && o[k] !== undefined);
const CHANGE_REQUIRED = 'Proposal does not change anything';

export const ACTION_SCHEMAS = {
  create_task: z.object({
    title: text(200), notes: z.string().max(5000).optional(), priority: z.enum(PRIORITIES).optional(),
    dueDate: aiDate.nullable().optional(), dueTime: timeHM.nullable().optional(), subtasks: z.array(text(200)).max(20).optional(),
    goal: objectId.nullable().optional(), project: objectId.nullable().optional(),
  }).strict(),
  update_task: z.object({
    id: objectId, title: text(200).optional(), priority: z.enum(PRIORITIES).optional(), dueDate: aiDate.nullable().optional(),
    dueTime: timeHM.nullable().optional(), status: z.enum(['todo', 'in_progress', 'done']).optional(), notes: z.string().max(5000).optional(),
  }).strict().refine(hasChanges, CHANGE_REQUIRED),
  complete_task: z.object({ id: objectId }).strict(),
  create_goal: z.object({
    title: text(200), description: z.string().max(2000).optional(), category: z.enum(GOAL_CATEGORIES).optional(), deadline: aiDate.nullable().optional(),
    milestones: z.array(z.object({ title: text(200), dueDate: aiDate.nullable().optional() }).strict()).max(20).optional(),
  }).strict(),
  update_goal: z.object({
    id: objectId, title: text(200).optional(), description: z.string().max(2000).optional(), deadline: aiDate.nullable().optional(), status: z.enum(GOAL_STATUSES).optional(),
  }).strict().refine(hasChanges, CHANGE_REQUIRED),
  create_project: z.object({ title: text(200), description: z.string().max(2000).optional(), goal: objectId.nullable().optional(), dueDate: aiDate.nullable().optional() }).strict(),
  update_project: z.object({
    id: objectId, title: text(200).optional(), description: z.string().max(2000).optional(), dueDate: aiDate.nullable().optional(), status: z.enum(PROJECT_STATUSES).optional(),
  }).strict().refine(hasChanges, CHANGE_REQUIRED),
  create_event: z.object({
    title: text(200), date: aiDate, startTime: timeHM.nullable().optional(), durationMin: z.number().int().min(5).max(1440).optional(),
    location: z.string().max(200).optional(), description: z.string().max(2000).optional(),
  }).strict(),
  update_event: z.object({
    id: objectId, title: text(200).optional(), date: aiDate.optional(), startTime: timeHM.nullable().optional(),
    durationMin: z.number().int().min(5).max(1440).optional(), location: z.string().max(200).optional(),
  }).strict().refine(hasChanges, CHANGE_REQUIRED),
  create_reminder: z.object({
    title: text(200), date: aiDate, time: timeHM.nullable().optional(), category: z.enum(REMINDER_CATEGORIES).optional(),
    leadDays: z.number().int().min(0).max(60).optional(), important: z.boolean().optional(), notes: z.string().max(2000).optional(),
  }).strict(),
  update_reminder: z.object({
    id: objectId, title: text(200).optional(), date: aiDate.optional(), time: timeHM.nullable().optional(), notes: z.string().max(2000).optional(), important: z.boolean().optional(),
  }).strict().refine(hasChanges, CHANGE_REQUIRED),
  create_note: z.object({ title: text(200), content: z.string().max(50000), tags: z.array(z.string().max(30)).max(10).optional() }).strict(),
  create_journal: z.object({
    date: aiDate.optional(), content: z.string().max(20000).optional(), wins: z.array(text(300)).max(10).optional(),
    challenges: z.array(text(300)).max(10).optional(), gratitude: z.array(text(300)).max(10).optional(), intention: z.string().max(500).optional(),
  }).strict(),
  create_focus_session: z.object({ label: z.string().max(200).optional(), plannedMinutes: z.number().int().min(5).max(180), task: objectId.nullable().optional(), goal: objectId.nullable().optional() }).strict(),
  create_habit: z.object({ name: text(100), icon: z.string().max(16).optional(), frequency: z.enum(['daily', 'weekly']).optional(), timesPerWeek: z.number().int().min(1).max(7).optional() }).strict(),
};

/** JSON Schema for the provider's structured output. Payloads travel as JSON strings and are validated here. */
export const ACTION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reply: { type: 'string', description: 'Markdown answer for the user' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: AI_ACTION_TYPES },
          summary: { type: 'string' },
          payload: { type: 'string', description: 'The action payload as a JSON-encoded object' },
        },
        required: ['type', 'summary', 'payload'],
      },
    },
  },
  required: ['reply', 'actions'],
};

const TARGET_MODEL = { update_task: Task, complete_task: Task, update_goal: Goal, update_project: Project, update_event: Event, update_reminder: Reminder };
const pad = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export function summarizeAction(type, p, preview) {
  const target = preview?.target?.title ? `"${preview.target.title}"` : '';
  switch (type) {
    case 'create_task': return `Create task "${p.title}"${p.dueDate ? ` due ${p.dueDate}` : ''}`;
    case 'update_task': return `Update task ${target}`.trim();
    case 'complete_task': return `Mark task ${target} as done`.replace('  ', ' ');
    case 'create_goal': return `Create goal "${p.title}"${p.milestones?.length ? ` with ${p.milestones.length} milestones` : ''}`;
    case 'update_goal': return `Update goal ${target}`.trim();
    case 'create_project': return `Create project "${p.title}"`;
    case 'update_project': return `Update project ${target}`.trim();
    case 'create_event': return `Add event "${p.title}" on ${p.date}${p.startTime ? ` at ${p.startTime}` : ''}`;
    case 'update_event': return `Update event ${target}`.trim();
    case 'create_reminder': return `Set reminder "${p.title}" for ${p.date}`;
    case 'update_reminder': return `Update reminder ${target}`.trim();
    case 'create_note': return `Create note "${p.title}"`;
    case 'create_journal': return `Add journal entry for ${p.date ?? 'today'}`;
    case 'create_focus_session': return `Start a ${p.plannedMinutes}-minute focus session`;
    case 'create_habit': return `Create habit "${p.name}"`;
    default: return type;
  }
}

async function buildPreview(userId, type, data) {
  const Model = TARGET_MODEL[type];
  if (!Model) return null;
  const doc = await Model.findOne({ _id: data.id, user: userId }).lean();
  const target = { id: String(doc._id), title: doc.title };
  if (type === 'complete_task') return { target, changes: [{ field: 'status', before: doc.status, after: 'done' }] };
  const current = { ...doc };
  if (type === 'update_event') {
    current.date = localKey(new Date(doc.start));
    current.startTime = doc.allDay ? null : localTime(new Date(doc.start));
    current.durationMin = Math.round((new Date(doc.end) - new Date(doc.start)) / 60000);
  }
  const changes = Object.entries(data)
    .filter(([k, v]) => k !== 'id' && v !== undefined)
    .map(([field, after]) => ({ field, before: current[field] ?? null, after }));
  return { target, changes };
}

/**
 * Validates a proposed action for this user. Never throws for bad proposals:
 * returns { ok:false, reason } so callers can drop them and report why.
 */
export async function inspectAction(userId, rawType, rawPayload, { scopes }) {
  const type = String(rawType ?? '').trim().toLowerCase();
  const schema = ACTION_SCHEMAS[type];
  if (!schema) return { ok: false, type, reason: 'unknown_type', message: 'Unknown action type' };

  let payload = rawPayload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return { ok: false, type, reason: 'malformed', message: 'Action payload is not valid JSON' };
    }
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, type, reason: 'malformed', message: 'Action payload must be an object' };

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, type, reason: 'invalid', message: parsed.error.issues.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`).join('; ') };
  }
  const data = parsed.data;

  const allowed = new Set(scopes);
  const required = new Set([ACTION_SCOPE[type]]);
  if (data.goal) required.add('goals');
  if (data.project) required.add('projects');
  if (data.task) required.add('tasks');
  const blocked = [...required].filter((s) => !allowed.has(s));
  if (blocked.length) return { ok: false, type, reason: 'scope_disabled', message: `AI access to ${blocked.map((s) => SCOPE_LABELS[s]).join(', ')} is turned off` };

  // Never trust ids from the model: every reference must belong to this user.
  const refs = [];
  if (data.id) refs.push([TARGET_MODEL[type], data.id]);
  if (data.goal) refs.push([Goal, data.goal]);
  if (data.project) refs.push([Project, data.project]);
  if (data.task) refs.push([Task, data.task]);
  for (const [Model, refId] of refs) {
    if (!(await Model.exists({ _id: refId, user: userId }))) return { ok: false, type, reason: 'not_found', message: 'Referenced item was not found' };
  }

  const preview = await buildPreview(userId, type, data);
  return { ok: true, type, payload: data, preview, summary: summarizeAction(type, data, preview) };
}

const REASON_STATUS = { scope_disabled: 403, not_found: 404 };

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const toHtml = (content) => (/<\/?[a-z][\s\S]*>/i.test(content) ? content : content.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join(''));

/**
 * Executes an action the user has confirmed. Re-validates first (permissions
 * or ownership may have changed since the proposal). Returns { id, entityType, title, href }.
 */
export async function executeAction(userId, rawType, rawPayload, { scopes, today = serverToday(), meta = {} }) {
  const check = await inspectAction(userId, rawType, rawPayload, { scopes });
  if (!check.ok) throw new AppError(REASON_STATUS[check.reason] ?? 400, check.message, { code: `ACTION_${check.reason.toUpperCase()}` });
  const { type, payload: p } = check;
  // Every executed action is auditable as AI-created, user-confirmed, with a timestamp (ActivityLog.createdAt).
  const via = { via: 'ai', confirmedBy: 'user', actionType: type, ...meta };

  switch (type) {
    case 'create_task': {
      const task = await Task.create({
        user: userId, title: p.title, notes: p.notes ?? '', priority: p.priority ?? 'medium', dueDate: p.dueDate ?? null,
        dueTime: p.dueDate ? p.dueTime ?? null : null, subtasks: (p.subtasks ?? []).map((t) => ({ title: t })), goal: p.goal ?? null, project: p.project ?? null,
      });
      await logActivity(userId, 'task_created', { entityType: 'task', entityId: task._id, title: task.title, date: today, meta: via });
      return { id: task._id, entityType: 'task', title: task.title, href: `/tasks?task=${task._id}` };
    }
    case 'update_task':
    case 'complete_task': {
      const task = await Task.findOne({ _id: p.id, user: userId });
      if (type === 'complete_task' && task.status === 'done') throw new AppError(409, 'That task is already completed');
      const wasDone = task.status === 'done';
      const { id, ...changes } = type === 'complete_task' ? { id: p.id, status: 'done' } : p;
      task.set(changes);
      await saveWithStatus(task, wasDone, today);
      if (task.status === wasDone ? 'done' : task.status) {
        await logActivity(userId, 'task_updated', { entityType: 'task', entityId: task._id, title: task.title, date: today, meta: { ...via, changes: Object.keys(changes) } });
      }
      return { id: task._id, entityType: 'task', title: task.title, href: `/tasks?task=${task._id}` };
    }
    case 'create_goal': {
      const goal = await Goal.create({
        user: userId, title: p.title, description: p.description ?? '', category: p.category ?? 'personal', deadline: p.deadline ?? null, startDate: today,
        milestones: (p.milestones ?? []).map((m) => ({ title: m.title, dueDate: m.dueDate ?? null })),
      });
      await logActivity(userId, 'goal_created', { entityType: 'goal', entityId: goal._id, title: goal.title, date: today, meta: via });
      return { id: goal._id, entityType: 'goal', title: goal.title, href: `/goals/${goal._id}` };
    }
    case 'update_goal': {
      const goal = await Goal.findOne({ _id: p.id, user: userId });
      const wasDone = goal.status === 'completed';
      const { id, ...changes } = p;
      goal.set(changes);
      if (goal.status === 'completed' && !wasDone) goal.completedAt = new Date();
      if (goal.status !== 'completed') goal.completedAt = null;
      await goal.save();
      await logActivity(userId, goal.status === 'completed' && !wasDone ? 'goal_completed' : 'goal_updated', { entityType: 'goal', entityId: goal._id, title: goal.title, date: today, meta: via });
      return { id: goal._id, entityType: 'goal', title: goal.title, href: `/goals/${goal._id}` };
    }
    case 'create_project': {
      const project = await Project.create({ user: userId, title: p.title, description: p.description ?? '', goal: p.goal ?? null, dueDate: p.dueDate ?? null });
      await logActivity(userId, 'project_created', { entityType: 'project', entityId: project._id, title: project.title, date: today, meta: via });
      return { id: project._id, entityType: 'project', title: project.title, href: `/projects/${project._id}` };
    }
    case 'update_project': {
      const project = await Project.findOne({ _id: p.id, user: userId });
      const wasDone = project.status === 'completed';
      const { id, ...changes } = p;
      project.set(changes);
      if (project.status === 'completed' && !wasDone) {
        project.completedAt = new Date();
        await logActivity(userId, 'project_completed', { entityType: 'project', entityId: project._id, title: project.title, date: today, meta: via });
      }
      if (project.status !== 'completed') project.completedAt = null;
      await project.save();
      return { id: project._id, entityType: 'project', title: project.title, href: `/projects/${project._id}` };
    }
    case 'create_event': {
      const allDay = !p.startTime;
      const start = allDay ? new Date(`${p.date}T00:00:00`) : new Date(`${p.date}T${p.startTime}:00`);
      const end = allDay ? new Date(`${p.date}T23:59:59.999`) : new Date(start.getTime() + (p.durationMin ?? 60) * 60_000);
      const event = await Event.create({ user: userId, title: p.title, start, end, allDay, location: p.location ?? '', description: p.description ?? '' });
      await logActivity(userId, 'event_created', { entityType: 'event', entityId: event._id, title: event.title, date: today, meta: via });
      return { id: event._id, entityType: 'event', title: event.title, href: `/calendar?view=day&date=${p.date}` };
    }
    case 'update_event': {
      const event = await Event.findOne({ _id: p.id, user: userId });
      if (p.title !== undefined) event.title = p.title;
      if (p.location !== undefined) event.location = p.location;
      if (p.date !== undefined || p.startTime !== undefined || p.durationMin !== undefined) {
        const wasAllDay = event.allDay;
        const duration = event.end - event.start;
        const date = p.date ?? localKey(event.start);
        const time = p.startTime === undefined ? (wasAllDay ? null : localTime(event.start)) : p.startTime;
        if (!time) {
          event.allDay = true;
          event.start = new Date(`${date}T00:00:00`);
          event.end = new Date(`${date}T23:59:59.999`);
        } else {
          event.allDay = false;
          event.start = new Date(`${date}T${time}:00`);
          event.end = new Date(event.start.getTime() + (p.durationMin ? p.durationMin * 60_000 : wasAllDay ? 3_600_000 : duration));
        }
      }
      await event.save();
      await logActivity(userId, 'ai_action_executed', { entityType: 'event', entityId: event._id, title: event.title, date: today, meta: via });
      return { id: event._id, entityType: 'event', title: event.title, href: `/calendar?view=day&date=${localKey(event.start)}` };
    }
    case 'create_reminder': {
      const reminder = await Reminder.create({
        user: userId, title: p.title, date: p.date, time: p.time ?? null, category: p.category ?? 'other', leadDays: p.leadDays ?? 3, important: p.important ?? false, notes: p.notes ?? '',
      });
      await logActivity(userId, 'reminder_created', { entityType: 'reminder', entityId: reminder._id, title: reminder.title, date: today, meta: via });
      return { id: reminder._id, entityType: 'reminder', title: reminder.title, href: '/reminders' };
    }
    case 'update_reminder': {
      const reminder = await Reminder.findOne({ _id: p.id, user: userId });
      const { id, ...changes } = p;
      reminder.set(changes);
      await reminder.save();
      await logActivity(userId, 'ai_action_executed', { entityType: 'reminder', entityId: reminder._id, title: reminder.title, date: today, meta: via });
      return { id: reminder._id, entityType: 'reminder', title: reminder.title, href: '/reminders' };
    }
    case 'create_note': {
      const content = sanitizeNoteHtml(toHtml(p.content));
      const note = await Note.create({ user: userId, title: p.title, content, plainText: htmlToText(content), tags: (p.tags ?? []).map((t) => t.toLowerCase()) });
      await logActivity(userId, 'note_created', { entityType: 'note', entityId: note._id, title: note.title, date: today, meta: via });
      return { id: note._id, entityType: 'note', title: note.title, href: `/notes?note=${note._id}` };
    }
    case 'create_journal': {
      const date = p.date ?? today;
      const { date: _d, ...fields } = p;
      const entry = await JournalEntry.findOneAndUpdate({ user: userId, date }, { $set: fields, $setOnInsert: { user: userId, date } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await logActivity(userId, 'journal_created', { entityType: 'journal', entityId: entry._id, title: `Journal ${date}`, date, meta: via });
      return { id: entry._id, entityType: 'journal', title: `Journal ${date}`, href: `/journal?date=${date}` };
    }
    case 'create_focus_session': {
      const now = new Date();
      await FocusSession.updateMany({ user: userId, status: { $in: ['running', 'paused'] } }, { $set: { status: 'abandoned', endedAt: now } });
      const session = await FocusSession.create({ user: userId, label: p.label ?? '', plannedMinutes: p.plannedMinutes, task: p.task ?? null, goal: p.goal ?? null, startedAt: now, lastResumedAt: now, date: today });
      await logActivity(userId, 'ai_action_executed', { entityType: 'focus', entityId: session._id, title: `${p.plannedMinutes}-minute focus session`, date: today, meta: via });
      return { id: session._id, entityType: 'focus', title: `${p.plannedMinutes}-minute focus session`, href: '/focus' };
    }
    case 'create_habit': {
      const count = await Habit.countDocuments({ user: userId });
      const habit = await Habit.create({ user: userId, name: p.name, icon: p.icon ?? '✨', frequency: p.frequency ?? 'daily', timesPerWeek: p.timesPerWeek ?? 3, order: count });
      await logActivity(userId, 'ai_action_executed', { entityType: 'habit', entityId: habit._id, title: habit.name, date: today, meta: via });
      return { id: habit._id, entityType: 'habit', title: habit.name, href: `/habits?habit=${habit._id}` };
    }
    default:
      throw new AppError(400, 'Unknown action type', { code: 'ACTION_UNKNOWN_TYPE' });
  }
}
