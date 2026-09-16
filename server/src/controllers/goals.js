import { Goal } from '../models/Goal.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { FocusSession } from '../models/FocusSession.js';
import { SavingsGoal } from '../models/Finance.js';
import { notFound } from '../utils/AppError.js';
import { sortGoals, withGoalProgress } from '../services/goals.js';
import { logActivity } from '../services/activity.js';
import { deleteLinksFor, getLinksFor } from '../services/links.js';
import { withProjectStats } from './projects.js';
import { findOwned, toObjectId } from './helpers.js';

async function single(userId, goal) {
  const [data] = await withGoalProgress(userId, [goal]);
  return data;
}

function syncCompletion(doc, wasDone) {
  const isDone = doc.status ? doc.status === 'completed' : doc.done;
  if (isDone && !wasDone) doc.completedAt = new Date();
  if (!isDone && wasDone) doc.completedAt = null;
}

export async function listGoals(req, res) {
  const { status } = req.valid.query;
  const filter = { user: req.user.id };
  if (!status) filter.status = { $ne: 'archived' };
  else if (status !== 'all') filter.status = status;
  const goals = await Goal.find(filter);
  res.json({ data: sortGoals(await withGoalProgress(req.user.id, goals)) });
}

export async function getGoal(req, res) {
  const goal = await findOwned(Goal, req.valid.params.id, req.user.id, 'Goal');
  const [tasks, projectDocs, links, focus, savings] = await Promise.all([
    Task.find({ user: req.user.id, goal: goal._id }).sort({ status: 1, dueDate: 1, createdAt: 1 }).populate('project', 'title color').lean(),
    Project.find({ user: req.user.id, goal: goal._id, status: { $ne: 'archived' } }),
    getLinksFor(req.user.id, 'goal', goal._id),
    FocusSession.aggregate([
      { $match: { user: toObjectId(req.user.id), goal: goal._id, status: 'completed' } },
      { $group: { _id: null, seconds: { $sum: '$focusedSeconds' }, sessions: { $sum: 1 } } },
    ]),
    SavingsGoal.find({ user: req.user.id, goal: goal._id }).lean(),
  ]);
  const projects = await withProjectStats(req.user.id, projectDocs);
  res.json({
    data: {
      ...(await single(req.user.id, goal)),
      tasks,
      projects,
      links,
      focus: { minutes: Math.round((focus[0]?.seconds ?? 0) / 60), sessions: focus[0]?.sessions ?? 0 },
      savingsGoals: savings,
    },
  });
}

export async function createGoal(req, res) {
  const goal = new Goal({ ...req.valid.body, user: req.user.id });
  syncCompletion(goal, false);
  goal.milestones.forEach((m) => syncCompletion(m, false));
  await goal.save();
  await logActivity(req.user.id, 'goal_created', { entityType: 'goal', entityId: goal._id, title: goal.title });
  res.status(201).json({ data: await single(req.user.id, goal) });
}

export async function updateGoal(req, res) {
  const goal = await findOwned(Goal, req.valid.params.id, req.user.id, 'Goal');
  const wasDone = goal.status === 'completed';
  goal.set(req.valid.body);
  syncCompletion(goal, wasDone);
  await goal.save();
  await logActivity(req.user.id, goal.status === 'completed' && !wasDone ? 'goal_completed' : 'goal_updated', { entityType: 'goal', entityId: goal._id, title: goal.title });
  res.json({ data: await single(req.user.id, goal) });
}

export async function deleteGoal(req, res) {
  const goal = await findOwned(Goal, req.valid.params.id, req.user.id, 'Goal');
  await goal.deleteOne();
  await Promise.all([
    Task.updateMany({ user: req.user.id, goal: goal._id }, { $set: { goal: null, milestone: null } }),
    Project.updateMany({ user: req.user.id, goal: goal._id }, { $set: { goal: null } }),
    FocusSession.updateMany({ user: req.user.id, goal: goal._id }, { $set: { goal: null } }),
    SavingsGoal.updateMany({ user: req.user.id, goal: goal._id }, { $set: { goal: null } }),
    deleteLinksFor(req.user.id, 'goal', goal._id),
  ]);
  res.status(204).end();
}

export async function addMilestone(req, res) {
  const goal = await findOwned(Goal, req.valid.params.id, req.user.id, 'Goal');
  goal.milestones.push(req.valid.body);
  syncCompletion(goal.milestones.at(-1), false);
  await goal.save();
  res.status(201).json({ data: await single(req.user.id, goal) });
}

export async function updateMilestone(req, res) {
  const { id, milestoneId } = req.valid.params;
  const goal = await findOwned(Goal, id, req.user.id, 'Goal');
  const milestone = goal.milestones.id(milestoneId);
  if (!milestone) throw notFound('Milestone');
  const wasDone = milestone.done;
  milestone.set(req.valid.body);
  syncCompletion(milestone, wasDone);
  await goal.save();
  if (milestone.done && !wasDone) {
    await logActivity(req.user.id, 'milestone_completed', { entityType: 'goal', entityId: goal._id, title: milestone.title, meta: { goal: goal.title } });
  }
  res.json({ data: await single(req.user.id, goal) });
}

export async function deleteMilestone(req, res) {
  const { id, milestoneId } = req.valid.params;
  const goal = await findOwned(Goal, id, req.user.id, 'Goal');
  const milestone = goal.milestones.id(milestoneId);
  if (!milestone) throw notFound('Milestone');
  milestone.deleteOne();
  await goal.save();
  await Task.updateMany({ user: req.user.id, milestone: milestoneId }, { $set: { milestone: null } });
  res.json({ data: await single(req.user.id, goal) });
}
