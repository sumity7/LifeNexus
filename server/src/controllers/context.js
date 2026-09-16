import { Link } from '../models/Link.js';
import { Notification } from '../models/Notification.js';
import { createLink, getLinksFor } from '../services/links.js';
import { listActivity } from '../services/activity.js';
import { syncNotifications } from '../services/notifications.js';
import { notFound } from '../utils/AppError.js';

/* ───── Links ───── */

export async function listLinks(req, res) {
  const { type, id } = req.valid.query;
  res.json({ data: await getLinksFor(req.user.id, type, id) });
}

export async function addLink(req, res) {
  const { from, to, note } = req.valid.body;
  const link = await createLink(req.user.id, from, to, note);
  res.status(201).json({ data: link });
}

export async function removeLink(req, res) {
  const result = await Link.deleteOne({ _id: req.valid.params.id, user: req.user.id });
  if (!result.deletedCount) throw notFound('Link');
  res.status(204).end();
}

/* ───── Activity ───── */

export async function getActivity(req, res) {
  res.json({ data: await listActivity(req.user.id, req.valid.query) });
}

/* ───── Notifications ───── */

export async function listNotifications(req, res) {
  const { unread, limit = 50, date } = req.valid.query;
  await syncNotifications(req.user.id, date);
  const filter = { user: req.user.id, ...(unread === 'true' && { readAt: null }) };
  const [data, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ user: req.user.id, readAt: null }),
  ]);
  res.json({ data, meta: { unread: unreadCount } });
}

export async function markRead(req, res) {
  const result = await Notification.updateOne({ _id: req.valid.params.id, user: req.user.id }, { $set: { readAt: new Date() } });
  if (!result.matchedCount) throw notFound('Notification');
  res.status(204).end();
}

export async function markAllRead(req, res) {
  await Notification.updateMany({ user: req.user.id, readAt: null }, { $set: { readAt: new Date() } });
  res.status(204).end();
}

export async function deleteNotification(req, res) {
  const result = await Notification.deleteOne({ _id: req.valid.params.id, user: req.user.id });
  if (!result.deletedCount) throw notFound('Notification');
  res.status(204).end();
}
