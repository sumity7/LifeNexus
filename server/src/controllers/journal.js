import { JournalEntry } from '../models/Journal.js';
import { HealthLog } from '../models/Health.js';
import { HabitLog } from '../models/Habit.js';
import { escapeRegex } from '../validators/common.js';
import { addDays, serverToday } from '../utils/dates.js';
import { logActivity } from '../services/activity.js';
import { deleteLinksFor } from '../services/links.js';
import { notFound } from '../utils/AppError.js';
import { toObjectId } from './helpers.js';

/** Journal entries carry the day's mood/energy from HealthLog so both modules share one record. */
async function withHealth(userId, entries) {
  if (!entries.length) return [];
  const dates = entries.map((e) => e.date);
  const [logs, habitCounts] = await Promise.all([
    HealthLog.find({ user: userId, date: { $in: dates } }, { date: 1, mood: 1, energy: 1, sleepHours: 1 }).lean(),
    HabitLog.aggregate([{ $match: { user: toObjectId(userId), date: { $in: dates } } }, { $group: { _id: '$date', count: { $sum: 1 } } }]),
  ]);
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const habitsBy = new Map(habitCounts.map((h) => [h._id, h.count]));
  return entries.map((e) => {
    const plain = typeof e.toJSON === 'function' ? e.toJSON() : e;
    const log = byDate.get(e.date);
    return { ...plain, mood: log?.mood ?? null, energy: log?.energy ?? null, sleepHours: log?.sleepHours ?? null, habitsCompleted: habitsBy.get(e.date) ?? 0 };
  });
}

export async function listEntries(req, res) {
  const { from, to, q, tag } = req.valid.query;
  const filter = { user: req.user.id };
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (tag) filter.tags = tag;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: rx }, { content: rx }, { wins: rx }, { challenges: rx }, { gratitude: rx }, { lessons: rx }, { intention: rx }];
  }
  const entries = await JournalEntry.find(filter).sort({ date: -1 }).limit(400).lean();
  res.json({ data: await withHealth(req.user.id, entries) });
}

export async function getEntry(req, res) {
  const { date } = req.valid.params;
  const entry = await JournalEntry.findOne({ user: req.user.id, date });
  const [data] = await withHealth(req.user.id, [entry ?? new JournalEntry({ user: req.user.id, date })]);
  // Yesterday's intention is shown as today's prompt.
  const previous = await JournalEntry.findOne({ user: req.user.id, date: { $lt: date } }).sort({ date: -1 }).select('date intention').lean();
  res.json({ data: { ...data, exists: !!entry, previousIntention: previous?.intention ? { date: previous.date, text: previous.intention } : null } });
}

export async function upsertEntry(req, res) {
  const { date } = req.valid.params;
  const { mood, energy, ...fields } = req.valid.body;
  const existed = await JournalEntry.exists({ user: req.user.id, date });
  const entry = await JournalEntry.findOneAndUpdate(
    { user: req.user.id, date },
    { $set: fields, $setOnInsert: { user: req.user.id, date } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  if (mood !== undefined || energy !== undefined) {
    const set = { ...(mood !== undefined && { mood }), ...(energy !== undefined && { energy }) };
    await HealthLog.findOneAndUpdate({ user: req.user.id, date }, { $set: set, $setOnInsert: { user: req.user.id, date } }, { upsert: true, runValidators: true, setDefaultsOnInsert: true });
  }
  if (!existed) await logActivity(req.user.id, 'journal_created', { entityType: 'journal', entityId: entry._id, title: entry.title || `Journal ${date}`, date });
  const [data] = await withHealth(req.user.id, [entry]);
  res.json({ data: { ...data, exists: true } });
}

export async function deleteEntry(req, res) {
  const { date } = req.valid.params;
  const entry = await JournalEntry.findOneAndDelete({ user: req.user.id, date });
  if (!entry) throw notFound('Journal entry');
  await deleteLinksFor(req.user.id, 'journal', entry._id);
  res.status(204).end();
}

/** Calendar view: which days have entries, with mood, for a date range. */
export async function getCalendar(req, res) {
  const { from, to } = req.valid.query;
  const end = to ?? serverToday();
  const start = from ?? addDays(end, -89);
  const [entries, logs] = await Promise.all([
    JournalEntry.find({ user: req.user.id, date: { $gte: start, $lte: end } }, { date: 1, title: 1 }).lean(),
    HealthLog.find({ user: req.user.id, date: { $gte: start, $lte: end } }, { date: 1, mood: 1 }).lean(),
  ]);
  const moodBy = new Map(logs.map((l) => [l.date, l.mood]));
  res.json({ data: entries.map((e) => ({ date: e.date, title: e.title, mood: moodBy.get(e.date) ?? null })), meta: { from: start, to: end } });
}
