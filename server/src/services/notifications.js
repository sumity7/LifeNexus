import { Notification } from '../models/Notification.js';
import { Task } from '../models/Task.js';
import { Reminder } from '../models/Reminder.js';
import { Document } from '../models/Document.js';
import { Goal } from '../models/Goal.js';
import { Subscription } from '../models/Finance.js';
import { getMonthSummary } from './finance.js';
import { addDays, diffDays, serverToday } from '../utils/dates.js';
import { getPreferences } from '../controllers/helpers.js';

const PREF_FOR_TYPE = {
  task: 'tasks', goal: 'goals', habit: 'habits', routine: 'routines', calendar: 'calendar', document: 'documents', finance: 'finance', ai: 'ai', system: null,
};

/** Creates a notification once per key. Respects the user's per-type preference. */
export async function notify(userId, { type, key, title, body = '', href = '', entityType = null, entityId = null }, prefs) {
  const preferences = prefs ?? (await getPreferences(userId));
  const prefKey = PREF_FOR_TYPE[type];
  if (prefKey && preferences.notifications?.[prefKey] === false) return null;
  try {
    return await Notification.create({ user: userId, type, key, title, body, href, entityType, entityId });
  } catch (err) {
    if (err?.code === 11000) return null;
    throw err;
  }
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * Derives due notifications from the user's data. Idempotent: keys include the
 * day, so each situation notifies at most once per day. Runs on demand when the
 * notification list is fetched (no scheduler required).
 */
export async function syncNotifications(userId, today = serverToday()) {
  const prefs = await getPreferences(userId);
  const created = [];
  const push = async (n) => {
    const doc = await notify(userId, n, prefs);
    if (doc) created.push(doc);
  };

  const [overdue, dueToday, reminders, documents, goals, subscriptions] = await Promise.all([
    Task.countDocuments({ user: userId, status: { $ne: 'done' }, dueDate: { $ne: null, $lt: today } }),
    Task.countDocuments({ user: userId, status: { $ne: 'done' }, dueDate: today }),
    Reminder.find({ user: userId, completed: false, date: { $lte: addDays(today, 60) } }).lean(),
    Document.find({ user: userId, archived: false, expiryDate: { $ne: null, $lte: addDays(today, 365) } }).lean(),
    Goal.find({ user: userId, status: 'active', deadline: { $ne: null, $lte: addDays(today, 7) } }).lean(),
    Subscription.find({ user: userId, active: true, nextPayment: { $lte: addDays(today, 3) } }).lean(),
  ]);

  if (overdue) {
    await push({ type: 'task', key: `tasks:overdue:${today}`, title: `${plural(overdue, 'overdue task')}`, body: 'Reschedule or complete them to clear your list.', href: '/tasks?view=overdue' });
  }
  if (dueToday) {
    await push({ type: 'task', key: `tasks:today:${today}`, title: `${plural(dueToday, 'task')} due today`, href: '/tasks?view=today' });
  }
  for (const r of reminders) {
    const days = diffDays(r.date, today);
    if (days > r.leadDays) continue;
    await push({
      type: r.category === 'bill' ? 'finance' : 'calendar',
      key: `reminder:${r._id}:${r.date}`,
      title: r.title,
      body: days < 0 ? `Was due ${Math.abs(days)} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'Due today' : `Due in ${plural(days, 'day')}`,
      href: '/reminders',
      entityType: 'reminder',
      entityId: r._id,
    });
  }
  for (const d of documents) {
    const days = diffDays(d.expiryDate, today);
    const lead = d.remindDaysBefore ?? 30;
    if (days > lead) continue;
    await push({
      type: 'document',
      key: `document:${d._id}:expiry:${d.expiryDate}`,
      title: days < 0 ? `${d.title} has expired` : `${d.title} expires ${days === 0 ? 'today' : `in ${plural(days, 'day')}`}`,
      body: 'Open the document to renew or update its expiry date.',
      href: `/documents?doc=${d._id}`,
      entityType: 'document',
      entityId: d._id,
    });
  }
  for (const g of goals) {
    const days = diffDays(g.deadline, today);
    await push({
      type: 'goal',
      key: `goal:${g._id}:deadline:${g.deadline}`,
      title: days < 0 ? `"${g.title}" passed its deadline` : `"${g.title}" is due ${days === 0 ? 'today' : `in ${plural(days, 'day')}`}`,
      href: `/goals/${g._id}`,
      entityType: 'goal',
      entityId: g._id,
    });
  }
  for (const s of subscriptions) {
    await push({
      type: 'finance',
      key: `subscription:${s._id}:${s.nextPayment}`,
      title: `${s.name} renews ${diffDays(s.nextPayment, today) <= 0 ? 'today' : `on ${s.nextPayment}`}`,
      href: '/finance?tab=subscriptions',
      entityType: 'subscription',
      entityId: s._id,
    });
  }

  const finance = await getMonthSummary(userId, today.slice(0, 7), { trendMonths: 1 });
  for (const b of finance.budgets.filter((x) => x.pct > 100)) {
    await push({
      type: 'finance',
      key: `budget:${b._id}:over:${today.slice(0, 7)}`,
      title: `${b.category} budget exceeded`,
      body: `${Math.round(b.pct)}% of the monthly limit used.`,
      href: '/finance',
      entityType: 'budget',
      entityId: b._id,
    });
  }
  return created;
}
