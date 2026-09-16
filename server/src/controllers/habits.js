import { Habit, HabitLog } from '../models/Habit.js';
import { AppError } from '../utils/AppError.js';
import { addDays, serverToday } from '../utils/dates.js';
import { withHabitStats } from '../services/habits.js';
import { logActivity } from '../services/activity.js';
import { deleteLinksFor } from '../services/links.js';
import { findOwned, getPreferences } from './helpers.js';

async function respondWithStats(req, habits, today, options = {}) {
  const { weekStartsOn = 1 } = await getPreferences(req.user.id);
  return withHabitStats(req.user.id, habits, today, { weekStartsOn, ...options });
}

export async function listHabits(req, res) {
  const { date, archived, days } = req.valid.query;
  const habits = await Habit.find({ user: req.user.id, archived: archived === 'true' }).sort({ order: 1, createdAt: 1 });
  res.json({ data: await respondWithStats(req, habits, date ?? serverToday(), { days }) });
}

export async function getHabit(req, res) {
  const habit = await findOwned(Habit, req.valid.params.id, req.user.id, 'Habit');
  const [data] = await respondWithStats(req, [habit], req.valid.query?.date ?? serverToday(), { days: 400 });
  res.json({ data });
}

export async function createHabit(req, res) {
  const count = await Habit.countDocuments({ user: req.user.id });
  const habit = await Habit.create({ order: count, ...req.valid.body, user: req.user.id });
  const [data] = await respondWithStats(req, [habit], serverToday());
  res.status(201).json({ data });
}

export async function updateHabit(req, res) {
  const habit = await findOwned(Habit, req.valid.params.id, req.user.id, 'Habit');
  habit.set(req.valid.body);
  await habit.save();
  const [data] = await respondWithStats(req, [habit], serverToday());
  res.json({ data });
}

export async function reorderHabits(req, res) {
  const { ids } = req.valid.body;
  await Habit.bulkWrite(
    ids.map((id, order) => ({ updateOne: { filter: { _id: id, user: req.user.id }, update: { $set: { order } } } })),
  );
  res.status(204).end();
}

export async function deleteHabit(req, res) {
  const habit = await findOwned(Habit, req.valid.params.id, req.user.id, 'Habit');
  await Promise.all([habit.deleteOne(), HabitLog.deleteMany({ habit: habit._id, user: req.user.id }), deleteLinksFor(req.user.id, 'habit', habit._id)]);
  res.status(204).end();
}

/** Toggles a check-in for a date. Shared with routines (steps linked to habits). */
export async function setHabitCheckin(userId, habit, date, done) {
  if (done) {
    try {
      await HabitLog.create({ user: userId, habit: habit._id, date });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      return false;
    }
    await logActivity(userId, 'habit_completed', { entityType: 'habit', entityId: habit._id, title: habit.name, date });
    return true;
  }
  await HabitLog.deleteOne({ habit: habit._id, user: userId, date });
  return false;
}

export async function toggleHabit(req, res) {
  const { date, today = serverToday() } = req.valid.body;
  // Allow one day of slack for clients ahead of the server's timezone.
  if (date > addDays(serverToday(), 1)) throw new AppError(400, "You can't check in for a future date");

  const habit = await findOwned(Habit, req.valid.params.id, req.user.id, 'Habit');
  const existing = await HabitLog.exists({ habit: habit._id, user: req.user.id, date });
  await setHabitCheckin(req.user.id, habit, date, !existing);

  const [data] = await respondWithStats(req, [habit], today);
  res.json({ data, meta: { done: !existing, date } });
}
