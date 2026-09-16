import { FocusSession } from '../models/FocusSession.js';
import { Task } from '../models/Task.js';
import { Goal } from '../models/Goal.js';
import { Project } from '../models/Project.js';
import { AppError, notFound } from '../utils/AppError.js';
import { addDays, rangeKeys, serverToday } from '../utils/dates.js';
import { logActivity } from '../services/activity.js';
import { findOwned, toObjectId } from './helpers.js';

const POPULATE = [
  { path: 'task', select: 'title status' },
  { path: 'goal', select: 'title color' },
  { path: 'project', select: 'title color' },
];

async function assertRefs(userId, { task, goal, project }) {
  const checks = [
    task && Task.exists({ _id: task, user: userId }).then((ok) => ok || Promise.reject(new AppError(400, 'Linked task not found'))),
    goal && Goal.exists({ _id: goal, user: userId }).then((ok) => ok || Promise.reject(new AppError(400, 'Linked goal not found'))),
    project && Project.exists({ _id: project, user: userId }).then((ok) => ok || Promise.reject(new AppError(400, 'Linked project not found'))),
  ];
  await Promise.all(checks.filter(Boolean));
}

/** Focused seconds so far, including the currently running stretch. */
function elapsedSeconds(session, now = new Date()) {
  let total = session.focusedSeconds;
  if (session.status === 'running' && session.lastResumedAt) total += Math.max(0, (now - session.lastResumedAt) / 1000);
  return Math.round(total);
}

const present = (session) => ({ ...session.toJSON(), elapsedSeconds: elapsedSeconds(session) });

export async function getActive(req, res) {
  const session = await FocusSession.findOne({ user: req.user.id, status: { $in: ['running', 'paused'] } }).sort({ startedAt: -1 }).populate(POPULATE);
  res.json({ data: session ? present(session) : null });
}

export async function startSession(req, res) {
  const { date, ...body } = req.valid.body;
  await assertRefs(req.user.id, body);
  // Only one live session at a time: abandon anything left running.
  await FocusSession.updateMany(
    { user: req.user.id, status: { $in: ['running', 'paused'] } },
    { $set: { status: 'abandoned', endedAt: new Date() } },
  );
  const now = new Date();
  const session = await FocusSession.create({
    ...body,
    user: req.user.id,
    status: 'running',
    startedAt: now,
    lastResumedAt: now,
    date: date ?? serverToday(),
  });
  await session.populate(POPULATE);
  res.status(201).json({ data: present(session) });
}

export async function pauseSession(req, res) {
  const session = await findOwned(FocusSession, req.valid.params.id, req.user.id, 'Focus session');
  if (session.status !== 'running') throw new AppError(400, 'Session is not running');
  session.focusedSeconds = elapsedSeconds(session);
  session.lastResumedAt = null;
  session.status = 'paused';
  await session.save();
  await session.populate(POPULATE);
  res.json({ data: present(session) });
}

export async function resumeSession(req, res) {
  const session = await findOwned(FocusSession, req.valid.params.id, req.user.id, 'Focus session');
  if (session.status !== 'paused') throw new AppError(400, 'Session is not paused');
  session.status = 'running';
  session.lastResumedAt = new Date();
  await session.save();
  await session.populate(POPULATE);
  res.json({ data: present(session) });
}

async function finish(req, res, status) {
  const session = await findOwned(FocusSession, req.valid.params.id, req.user.id, 'Focus session');
  if (!['running', 'paused'].includes(session.status)) throw new AppError(400, 'Session already ended');
  session.focusedSeconds = Math.min(elapsedSeconds(session), session.plannedMinutes * 60 * 3);
  session.lastResumedAt = null;
  session.endedAt = new Date();
  session.status = status;
  if (req.valid.body.notes !== undefined) session.notes = req.valid.body.notes;
  await session.save();
  await session.populate(POPULATE);
  if (status === 'completed') {
    await logActivity(req.user.id, 'focus_session_completed', {
      entityType: 'focus', entityId: session._id, title: session.label || session.task?.title || 'Focus session',
      date: req.valid.body.date ?? session.date, meta: { minutes: Math.round(session.focusedSeconds / 60) },
    });
  }
  res.json({ data: present(session) });
}

export const completeSession = (req, res) => finish(req, res, 'completed');
export const abandonSession = (req, res) => finish(req, res, 'abandoned');

/** Manually log a session that already happened (e.g. offline). */
export async function logSession(req, res) {
  const { focusedMinutes, date, ...body } = req.valid.body;
  await assertRefs(req.user.id, body);
  const day = date ?? serverToday();
  const endedAt = new Date();
  const session = await FocusSession.create({
    ...body,
    user: req.user.id,
    status: 'completed',
    focusedSeconds: focusedMinutes * 60,
    startedAt: new Date(endedAt.getTime() - focusedMinutes * 60_000),
    endedAt,
    date: day,
  });
  await session.populate(POPULATE);
  await logActivity(req.user.id, 'focus_session_completed', { entityType: 'focus', entityId: session._id, title: session.label || 'Focus session', date: day, meta: { minutes: focusedMinutes } });
  res.status(201).json({ data: present(session) });
}

export async function listSessions(req, res) {
  const { from, to, limit = 100 } = req.valid.query;
  const filter = { user: req.user.id, status: { $in: ['completed', 'abandoned'] } };
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const sessions = await FocusSession.find(filter).sort({ startedAt: -1 }).limit(limit).populate(POPULATE);
  res.json({ data: sessions.map(present) });
}

export async function deleteSession(req, res) {
  const result = await FocusSession.deleteOne({ _id: req.valid.params.id, user: req.user.id });
  if (!result.deletedCount) throw notFound('Focus session');
  res.status(204).end();
}

export async function buildFocusSummary(userId, today, days = 30) {
  const start = addDays(today, -(days - 1));
  const user = toObjectId(userId);
  const [byDay, byTarget, streakRows] = await Promise.all([
    FocusSession.aggregate([
      { $match: { user, status: 'completed', date: { $gte: start, $lte: today } } },
      { $group: { _id: '$date', seconds: { $sum: '$focusedSeconds' }, sessions: { $sum: 1 } } },
    ]),
    FocusSession.aggregate([
      { $match: { user, status: 'completed', date: { $gte: start, $lte: today } } },
      { $group: { _id: { $ifNull: ['$goal', { $ifNull: ['$project', '$task'] }] }, seconds: { $sum: '$focusedSeconds' }, goal: { $first: '$goal' }, project: { $first: '$project' }, task: { $first: '$task' } } },
      { $sort: { seconds: -1 } },
      { $limit: 6 },
    ]),
    FocusSession.aggregate([{ $match: { user, status: 'completed' } }, { $group: { _id: '$date' } }]),
  ]);
  const dayMap = new Map(byDay.map((d) => [d._id, d]));
  const series = rangeKeys(start, today).map((date) => ({ date, minutes: Math.round((dayMap.get(date)?.seconds ?? 0) / 60), sessions: dayMap.get(date)?.sessions ?? 0 }));
  const weekStart = addDays(today, -6);
  const sum = (rows) => rows.reduce((s, r) => s + r.minutes, 0);

  const focusDays = new Set(streakRows.map((r) => r._id));
  let streak = 0;
  for (let k = focusDays.has(today) ? today : addDays(today, -1); focusDays.has(k); k = addDays(k, -1)) streak++;

  const targets = await Promise.all(
    byTarget.map(async (row) => {
      const [goal, project, task] = await Promise.all([
        row.goal && Goal.findById(row.goal).select('title color').lean(),
        row.project && Project.findById(row.project).select('title color').lean(),
        row.task && Task.findById(row.task).select('title').lean(),
      ]);
      const target = goal ? { type: 'goal', ...goal } : project ? { type: 'project', ...project } : task ? { type: 'task', ...task } : { type: 'none', title: 'Unlinked' };
      return { ...target, minutes: Math.round(row.seconds / 60) };
    }),
  );

  return {
    todayMinutes: series[series.length - 1].minutes,
    todaySessions: series[series.length - 1].sessions,
    weekMinutes: sum(series.filter((d) => d.date >= weekStart)),
    totalMinutes: sum(series),
    totalSessions: series.reduce((s, d) => s + d.sessions, 0),
    streak,
    series,
    targets,
  };
}

export async function getSummary(req, res) {
  const today = req.valid.query.date ?? serverToday();
  res.json({ data: await buildFocusSummary(req.user.id, today, req.valid.query.days ?? 30) });
}
