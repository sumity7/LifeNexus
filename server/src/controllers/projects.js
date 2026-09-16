import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Goal } from '../models/Goal.js';
import { FocusSession } from '../models/FocusSession.js';
import { AppError } from '../utils/AppError.js';
import { logActivity } from '../services/activity.js';
import { deleteLinksFor, getLinksFor } from '../services/links.js';
import { findOwned, toObjectId } from './helpers.js';

const STATUS_ORDER = { active: 0, on_hold: 1, completed: 2, archived: 3 };

async function assertGoal(userId, goalId) {
  if (goalId && !(await Goal.exists({ _id: goalId, user: userId }))) throw new AppError(400, 'Linked goal not found');
}

/** Attaches task counts, progress and focus minutes to projects. */
export async function withProjectStats(userId, projects) {
  if (!projects.length) return [];
  const ids = projects.map((p) => p._id);
  const user = toObjectId(userId);
  const [taskCounts, focus] = await Promise.all([
    Task.aggregate([
      { $match: { user, project: { $in: ids } } },
      { $group: { _id: '$project', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } } } },
    ]),
    FocusSession.aggregate([
      { $match: { user, project: { $in: ids }, status: 'completed' } },
      { $group: { _id: '$project', seconds: { $sum: '$focusedSeconds' } } },
    ]),
  ]);
  const tasksBy = new Map(taskCounts.map((c) => [String(c._id), c]));
  const focusBy = new Map(focus.map((f) => [String(f._id), f.seconds]));
  return projects.map((p) => {
    const plain = typeof p.toJSON === 'function' ? p.toJSON() : p;
    const t = tasksBy.get(String(p._id)) ?? { total: 0, done: 0 };
    return {
      ...plain,
      progress: p.status === 'completed' ? 100 : t.total ? Math.round((t.done / t.total) * 100) : 0,
      stats: { tasks: t.total, tasksDone: t.done, focusMinutes: Math.round((focusBy.get(String(p._id)) ?? 0) / 60) },
    };
  });
}

const sortProjects = (list) =>
  [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

export async function listProjects(req, res) {
  const { status, goal } = req.valid.query;
  const filter = { user: req.user.id };
  if (!status) filter.status = { $ne: 'archived' };
  else if (status !== 'all') filter.status = status;
  if (goal) filter.goal = goal;
  const projects = await Project.find(filter).populate('goal', 'title color');
  res.json({ data: sortProjects(await withProjectStats(req.user.id, projects)) });
}

export async function getProject(req, res) {
  const project = await findOwned(Project, req.valid.params.id, req.user.id, 'Project');
  await project.populate('goal', 'title color status');
  const [[data], tasks, links] = await Promise.all([
    withProjectStats(req.user.id, [project]),
    Task.find({ user: req.user.id, project: project._id }).sort({ status: 1, dueDate: 1, createdAt: 1 }).lean(),
    getLinksFor(req.user.id, 'project', project._id),
  ]);
  res.json({ data: { ...data, tasks, links } });
}

export async function createProject(req, res) {
  await assertGoal(req.user.id, req.valid.body.goal);
  const project = await Project.create({ ...req.valid.body, user: req.user.id });
  await logActivity(req.user.id, 'project_created', { entityType: 'project', entityId: project._id, title: project.title });
  const [data] = await withProjectStats(req.user.id, [project]);
  res.status(201).json({ data });
}

export async function updateProject(req, res) {
  const project = await findOwned(Project, req.valid.params.id, req.user.id, 'Project');
  if ('goal' in req.valid.body) await assertGoal(req.user.id, req.valid.body.goal);
  const wasDone = project.status === 'completed';
  project.set(req.valid.body);
  if (project.status === 'completed' && !wasDone) {
    project.completedAt = new Date();
    await logActivity(req.user.id, 'project_completed', { entityType: 'project', entityId: project._id, title: project.title });
  } else if (project.status !== 'completed') project.completedAt = null;
  await project.save();
  const [data] = await withProjectStats(req.user.id, [project]);
  res.json({ data });
}

export async function deleteProject(req, res) {
  const project = await findOwned(Project, req.valid.params.id, req.user.id, 'Project');
  await Promise.all([
    project.deleteOne(),
    Task.updateMany({ user: req.user.id, project: project._id }, { $set: { project: null } }),
    FocusSession.updateMany({ user: req.user.id, project: project._id }, { $set: { project: null } }),
    deleteLinksFor(req.user.id, 'project', project._id),
  ]);
  res.status(204).end();
}
