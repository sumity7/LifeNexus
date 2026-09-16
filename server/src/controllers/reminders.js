import { Reminder } from '../models/Reminder.js';
import { escapeRegex } from '../validators/common.js';
import { nextOccurrence, serverToday } from '../utils/dates.js';
import { logActivity } from '../services/activity.js';
import { deleteLinksFor } from '../services/links.js';
import { findOwned } from './helpers.js';

export async function listReminders(req, res) {
  const { status = 'active', from, to, q } = req.valid.query;
  const filter = { user: req.user.id };
  if (status !== 'all') filter.completed = status === 'completed';
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: rx }, { notes: rx }];
  }
  const sort = status === 'completed' ? { completedAt: -1 } : { date: 1, time: 1 };
  res.json({ data: await Reminder.find(filter).sort(sort).limit(1000).lean() });
}

export async function createReminder(req, res) {
  const reminder = new Reminder({ ...req.valid.body, user: req.user.id });
  if (reminder.completed) reminder.completedAt = new Date();
  await reminder.save();
  await logActivity(req.user.id, 'reminder_created', { entityType: 'reminder', entityId: reminder._id, title: reminder.title });
  res.status(201).json({ data: reminder });
}

export async function updateReminder(req, res) {
  const reminder = await findOwned(Reminder, req.valid.params.id, req.user.id, 'Reminder');
  const wasCompleted = reminder.completed;
  reminder.set(req.valid.body);
  if (reminder.completed && !wasCompleted) reminder.completedAt = new Date();
  if (!reminder.completed) reminder.completedAt = null;
  await reminder.save();
  res.json({ data: reminder });
}

/** Completing a recurring reminder rolls it forward to its next occurrence instead of closing it. */
export async function completeReminder(req, res) {
  const today = req.valid.body.date ?? serverToday();
  const reminder = await findOwned(Reminder, req.valid.params.id, req.user.id, 'Reminder');
  let advanced = false;

  if (reminder.recurrence !== 'none') {
    let next = nextOccurrence(reminder.date, reminder.recurrence);
    for (let i = 0; next < today && i < 1000; i++) next = nextOccurrence(next, reminder.recurrence);
    reminder.date = next;
    advanced = true;
  } else {
    reminder.completed = true;
    reminder.completedAt = new Date();
  }

  await reminder.save();
  await logActivity(req.user.id, 'reminder_completed', { entityType: 'reminder', entityId: reminder._id, title: reminder.title, date: today });
  res.json({ data: reminder, meta: { advanced } });
}

export async function deleteReminder(req, res) {
  const reminder = await findOwned(Reminder, req.valid.params.id, req.user.id, 'Reminder');
  await Promise.all([reminder.deleteOne(), deleteLinksFor(req.user.id, 'reminder', reminder._id)]);
  res.status(204).end();
}
