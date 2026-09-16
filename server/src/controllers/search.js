import { Task } from '../models/Task.js';
import { Note } from '../models/Note.js';
import { Goal } from '../models/Goal.js';
import { Project } from '../models/Project.js';
import { Habit } from '../models/Habit.js';
import { Routine } from '../models/Routine.js';
import { Event } from '../models/Event.js';
import { Reminder } from '../models/Reminder.js';
import { Transaction } from '../models/Finance.js';
import { JournalEntry } from '../models/Journal.js';
import { Document } from '../models/Document.js';
import { FocusSession } from '../models/FocusSession.js';
import { HealthLog } from '../models/Health.js';
import { escapeRegex } from '../validators/common.js';
import { toObjectId } from './helpers.js';

function excerptAround(text = '', query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, idx - 60);
  const snippet = text.slice(start, start + 160);
  return `${start > 0 ? '…' : ''}${snippet}${start + 160 < text.length ? '…' : ''}`;
}

/**
 * Each searcher receives the shared filter pieces (regex, date range, tag) and
 * returns compact rows. Adding a module = adding one entry here.
 */
const SEARCHERS = {
  tasks: ({ user, rx, dateRange, tag, limit }) =>
    Task.find({ user, $or: [{ title: rx }, { notes: rx }, { tags: rx }], ...(dateRange && { dueDate: dateRange }), ...(tag && { tags: tag }) }, { title: 1, status: 1, priority: 1, dueDate: 1 })
      .sort({ updatedAt: -1 }).limit(limit).lean(),
  notes: async ({ user, rx, q, tag, limit }) =>
    (await Note.find({ user, archived: false, $or: [{ title: rx }, { plainText: rx }, { tags: rx }], ...(tag && { tags: tag }) }, { title: 1, plainText: 1, pinned: 1, tags: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 }).limit(limit).lean()).map(({ plainText, ...note }) => ({ ...note, excerpt: excerptAround(plainText, q) })),
  goals: ({ user, rx, limit }) =>
    Goal.find({ user, $or: [{ title: rx }, { description: rx }, { 'milestones.title': rx }] }, { title: 1, status: 1, deadline: 1, color: 1 }).sort({ updatedAt: -1 }).limit(limit).lean(),
  projects: ({ user, rx, limit }) =>
    Project.find({ user, $or: [{ title: rx }, { description: rx }] }, { title: 1, status: 1, color: 1, dueDate: 1 }).sort({ updatedAt: -1 }).limit(limit).lean(),
  habits: ({ user, rx, limit }) => Habit.find({ user, $or: [{ name: rx }, { description: rx }] }, { name: 1, icon: 1, color: 1, archived: 1 }).limit(limit).lean(),
  routines: ({ user, rx, limit }) =>
    Routine.find({ user, $or: [{ name: rx }, { description: rx }, { 'steps.title': rx }] }, { name: 1, type: 1, active: 1 }).limit(limit).lean(),
  events: ({ user, rx, dateRange, limit }) =>
    Event.find({
      user, $or: [{ title: rx }, { description: rx }, { location: rx }],
      ...(dateRange && { start: { ...(dateRange.$gte && { $gte: new Date(`${dateRange.$gte}T00:00:00`) }), ...(dateRange.$lte && { $lte: new Date(`${dateRange.$lte}T23:59:59`) }) } }),
    }, { title: 1, start: 1, end: 1, allDay: 1, color: 1, location: 1 }).sort({ start: -1 }).limit(limit).lean(),
  reminders: ({ user, rx, dateRange, limit }) =>
    Reminder.find({ user, $or: [{ title: rx }, { notes: rx }], ...(dateRange && { date: dateRange }) }, { title: 1, date: 1, category: 1, completed: 1 }).sort({ date: 1 }).limit(limit).lean(),
  transactions: ({ user, rx, dateRange, limit }) =>
    Transaction.find({ user, $or: [{ description: rx }, { category: rx }], ...(dateRange && { date: dateRange }) }, { description: 1, category: 1, amount: 1, type: 1, date: 1 }).sort({ date: -1 }).limit(limit).lean(),
  journal: async ({ user, rx, q, dateRange, tag, limit }) =>
    (await JournalEntry.find({ user, $or: [{ title: rx }, { content: rx }, { wins: rx }, { challenges: rx }, { gratitude: rx }, { lessons: rx }, { intention: rx }], ...(dateRange && { date: dateRange }), ...(tag && { tags: tag }) }, { date: 1, title: 1, content: 1 })
      .sort({ date: -1 }).limit(limit).lean()).map(({ content, ...e }) => ({ ...e, excerpt: excerptAround(content, q) })),
  documents: ({ user, rx, tag, limit }) =>
    Document.find({ user, $or: [{ title: rx }, { originalName: rx }, { tags: rx }, { notes: rx }, { category: rx }, { 'extraction.summary': rx }], ...(tag && { tags: tag }) }, { title: 1, category: 1, expiryDate: 1, mimeType: 1, archived: 1, originalName: 1 })
      .sort({ updatedAt: -1 }).limit(limit).lean(),
  focus: ({ user, rx, dateRange, limit }) =>
    FocusSession.find({ user, status: 'completed', $or: [{ label: rx }, { notes: rx }], ...(dateRange && { date: dateRange }) }, { label: 1, date: 1, focusedSeconds: 1, plannedMinutes: 1 }).sort({ date: -1 }).limit(limit).lean(),
  health: ({ user, rx, dateRange, limit }) =>
    HealthLog.find({ user, notes: rx, ...(dateRange && { date: dateRange }) }, { date: 1, notes: 1, mood: 1, sleepHours: 1 }).sort({ date: -1 }).limit(limit).lean(),
};

export const SEARCH_TYPES = Object.keys(SEARCHERS);

export async function search(req, res) {
  const { q, limit = 6, types, from, to, tag } = req.valid.query;
  const user = toObjectId(req.user.id);
  const rx = new RegExp(escapeRegex(q), 'i');
  const dateRange = from || to ? { ...(from && { $gte: from }), ...(to && { $lte: to }) } : null;
  const selected = types?.length ? SEARCH_TYPES.filter((t) => types.includes(t)) : SEARCH_TYPES;
  const ctx = { user, rx, q, dateRange, tag, limit };

  const entries = await Promise.all(selected.map(async (type) => [type, await SEARCHERS[type](ctx)]));
  const results = Object.fromEntries(entries);

  res.json({
    data: { query: q, results, total: Object.values(results).reduce((n, list) => n + list.length, 0), types: SEARCH_TYPES },
  });
}
