import { Event } from '../models/Event.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../services/activity.js';
import { deleteLinksFor } from '../services/links.js';
import { findOwned } from './helpers.js';

const MAX_RANGE_MS = 400 * 86_400_000;

function assertChronological(event) {
  if (event.end < event.start) {
    throw new AppError(400, 'End must be after start', { details: [{ path: 'end', message: 'End must be after start' }] });
  }
}

/**
 * Returns every event that could appear in [from, to): one-off events that
 * overlap the range and recurring series that started before its end.
 * Occurrences are expanded on the client in the user's timezone.
 */
export async function listEvents(req, res) {
  const { from, to } = req.valid.query;
  if (to <= from) throw new AppError(400, '`to` must be after `from`');
  if (to - from > MAX_RANGE_MS) throw new AppError(400, 'Date range is too large');

  const events = await Event.find({
    user: req.user.id,
    start: { $lt: to },
    $or: [
      { 'recurrence.freq': 'none', end: { $gt: from } },
      { 'recurrence.freq': { $ne: 'none' }, $or: [{ 'recurrence.until': null }, { 'recurrence.until': { $gte: from } }] },
    ],
  })
    .sort({ start: 1 })
    .limit(2000)
    .lean();

  res.json({ data: events });
}

export async function getEvent(req, res) {
  res.json({ data: await findOwned(Event, req.valid.params.id, req.user.id, 'Event') });
}

export async function createEvent(req, res) {
  const event = new Event({ ...req.valid.body, user: req.user.id });
  assertChronological(event);
  await event.save();
  await logActivity(req.user.id, 'event_created', { entityType: 'event', entityId: event._id, title: event.title });
  res.status(201).json({ data: event });
}

export async function updateEvent(req, res) {
  const event = await findOwned(Event, req.valid.params.id, req.user.id, 'Event');
  event.set(req.valid.body);
  assertChronological(event);
  await event.save();
  res.json({ data: event });
}

export async function deleteEvent(req, res) {
  const event = await findOwned(Event, req.valid.params.id, req.user.id, 'Event');
  await Promise.all([event.deleteOne(), deleteLinksFor(req.user.id, 'event', event._id)]);
  res.status(204).end();
}
