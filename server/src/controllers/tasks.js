import { Task } from '../models/Task.js';
import { Goal } from '../models/Goal.js';
import { Project } from '../models/Project.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../validators/common.js';
import { nextOccurrence, serverToday } from '../utils/dates.js';
import { logActivity } from '../services/activity.js';
import { deleteLinksFor } from '../services/links.js';
import { findOwned } from './helpers.js';

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
const GOAL_FIELDS = 'title color';
const POPULATE = [
  { path: 'goal', select: GOAL_FIELDS },
  { path: 'project', select: 'title color' },
];

async function assertProject(userId, projectId) {
  if (projectId && !(await Project.exists({ _id: projectId, user: userId }))) throw new AppError(400, 'Linked project not found');
}

function compareDue(a, b) {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99');
}

const SORTERS = {
  due: (a, b) => compareDue(a, b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt - a.createdAt,
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || compareDue(a, b) || b.createdAt - a.createdAt,
  created: (a, b) => b.createdAt - a.createdAt,
  updated: (a, b) => b.updatedAt - a.updatedAt,
  completed: (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0),
};

async function assertGoalReference(userId, goalId, milestoneId) {
  if (milestoneId && !goalId) throw new AppError(400, 'A milestone requires a goal');
  if (!goalId) return;
  const goal = await Goal.findOne({ _id: goalId, user: userId }).select('milestones');
  if (!goal) throw new AppError(400, 'Linked goal not found');
  if (milestoneId && !goal.milestones.id(milestoneId)) throw new AppError(400, 'Linked milestone not found');
}

function buildNextOccurrence(task, today) {
  const { freq, interval = 1 } = task.recurrence;
  let due = nextOccurrence(task.dueDate ?? today, freq, interval);
  for (let i = 0; due <= today && i < 1000; i++) due = nextOccurrence(due, freq, interval);
  return new Task({
    user: task.user,
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    tags: task.tags,
    subtasks: task.subtasks.map((s) => ({ title: s.title, done: false })),
    recurrence: { freq, interval },
    goal: task.goal,
    milestone: task.milestone,
    project: task.project,
    dueDate: due,
    dueTime: task.dueTime,
  });
}

/** Persists a task, handling completion bookkeeping and recurring-task spawning. */
export async function saveWithStatus(task, wasDone, today) {
  const isDone = task.status === 'done';
  let next = null;

  if (isDone && !wasDone) {
    task.completedAt = new Date();
    task.completedOn = today;
    if (task.recurrence?.freq !== 'none' && !task.spawnedNext) {
      next = buildNextOccurrence(task, today);
      task.spawnedNext = true;
    }
  } else if (!isDone && wasDone) {
    task.completedAt = null;
    task.completedOn = null;
  }

  await task.save();
  if (next) {
    await next.save();
    await next.populate(POPULATE);
  }
  await task.populate(POPULATE);
  if (isDone && !wasDone) {
    await logActivity(task.user, 'task_completed', { entityType: 'task', entityId: task._id, title: task.title, date: today, meta: { priority: task.priority, goal: task.goal?._id ?? null } });
  }
  return next;
}

export async function listTasks(req, res) {
  const { view = 'all', date, from, to, priority, status, tag, goal, project, q, sort, limit = 500 } = req.valid.query;
  const today = date ?? serverToday();
  const filter = { user: req.user.id };
  const due = {};
  const open = { $ne: 'done' };

  switch (view) {
    case 'open':
      filter.status = open;
      break;
    case 'today':
      Object.assign(filter, { status: open });
      Object.assign(due, { $ne: null, $lte: today });
      break;
    case 'upcoming':
      filter.status = open;
      due.$gt = today;
      break;
    case 'overdue':
      filter.status = open;
      Object.assign(due, { $ne: null, $lt: today });
      break;
    case 'completed':
      filter.status = 'done';
      break;
    case 'nodate':
      filter.status = open;
      filter.dueDate = null;
      break;
    default:
      if (status) filter.status = status;
  }

  if (from) due.$gte = from;
  if (to) due.$lte = due.$lte && due.$lte < to ? due.$lte : to;
  if (view !== 'nodate' && Object.keys(due).length) filter.dueDate = due;
  if (priority) filter.priority = priority;
  if (tag) filter.tags = tag;
  if (goal) filter.goal = goal;
  if (project) filter.project = project;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: rx }, { notes: rx }, { tags: rx }];
  }

  const tasks = await Task.find(filter)
    .sort(view === 'completed' ? { completedAt: -1 } : { dueDate: 1, createdAt: -1 })
    .limit(limit)
    .populate(POPULATE)
    .lean();

  tasks.sort(SORTERS[view === 'completed' && !sort ? 'completed' : sort ?? 'due']);
  res.json({ data: tasks });
}

export async function getTask(req, res) {
  const task = await findOwned(Task, req.valid.params.id, req.user.id, 'Task');
  await task.populate(POPULATE);
  res.json({ data: task });
}

export async function createTask(req, res) {
  const { date, ...body } = req.valid.body;
  await Promise.all([assertGoalReference(req.user.id, body.goal, body.milestone), assertProject(req.user.id, body.project)]);
  const task = new Task({ ...body, user: req.user.id });
  const today = date ?? serverToday();
  const next = await saveWithStatus(task, false, today);
  await logActivity(req.user.id, 'task_created', { entityType: 'task', entityId: task._id, title: task.title, date: today });
  res.status(201).json({ data: task, meta: { next } });
}

export async function updateTask(req, res) {
  const { date, ...changes } = req.valid.body;
  const task = await findOwned(Task, req.valid.params.id, req.user.id, 'Task');
  if ('project' in changes) await assertProject(req.user.id, changes.project);

  if ('goal' in changes || 'milestone' in changes) {
    const goalId = 'goal' in changes ? changes.goal : task.goal;
    let milestoneId = 'milestone' in changes ? changes.milestone : task.milestone;
    if (!goalId || ('goal' in changes && String(changes.goal) !== String(task.goal) && !('milestone' in changes))) {
      milestoneId = null;
    }
    await assertGoalReference(req.user.id, goalId, milestoneId);
    changes.goal = goalId ?? null;
    changes.milestone = milestoneId ?? null;
  }

  const wasDone = task.status === 'done';
  task.set(changes);
  const next = await saveWithStatus(task, wasDone, date ?? serverToday());
  res.json({ data: task, meta: { next } });
}

export async function toggleTask(req, res) {
  const task = await findOwned(Task, req.valid.params.id, req.user.id, 'Task');
  const wasDone = task.status === 'done';
  task.status = wasDone ? 'todo' : 'done';
  const next = await saveWithStatus(task, wasDone, req.valid.body.date ?? serverToday());
  res.json({ data: task, meta: { next } });
}

export async function deleteTask(req, res) {
  const task = await findOwned(Task, req.valid.params.id, req.user.id, 'Task');
  await Promise.all([task.deleteOne(), deleteLinksFor(req.user.id, 'task', task._id)]);
  res.status(204).end();
}
