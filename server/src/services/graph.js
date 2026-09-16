import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { FocusSession } from '../models/FocusSession.js';
import { SavingsGoal } from '../models/Finance.js';
import { Reminder } from '../models/Reminder.js';
import { getLinksFor, resolveEntities } from './links.js';

/**
 * Life Graph: the neighbourhood of an entity, combining explicit foreign keys
 * (goal → project → task, focus → task/goal, savings → goal, document → reminder)
 * with user-made Links. Purely relational; no graph database.
 */
export async function neighborhood(userId, type, id) {
  const refs = [];
  if (type === 'goal') {
    const [projects, tasks, focus, savings] = await Promise.all([
      Project.find({ user: userId, goal: id }).select('_id').lean(),
      Task.find({ user: userId, goal: id }).select('_id').lean(),
      FocusSession.find({ user: userId, goal: id, status: 'completed' }).select('_id').limit(20).lean(),
      SavingsGoal.find({ user: userId, goal: id }).select('_id').lean(),
    ]);
    refs.push(...projects.map((p) => ({ type: 'project', id: p._id })), ...tasks.map((t) => ({ type: 'task', id: t._id })), ...focus.map((f) => ({ type: 'focus', id: f._id })), ...savings.map((s) => ({ type: 'savings_goal', id: s._id })));
  } else if (type === 'project') {
    const project = await Project.findOne({ _id: id, user: userId }).select('goal').lean();
    if (project?.goal) refs.push({ type: 'goal', id: project.goal });
    const [tasks, focus] = await Promise.all([
      Task.find({ user: userId, project: id }).select('_id').lean(),
      FocusSession.find({ user: userId, project: id, status: 'completed' }).select('_id').limit(20).lean(),
    ]);
    refs.push(...tasks.map((t) => ({ type: 'task', id: t._id })), ...focus.map((f) => ({ type: 'focus', id: f._id })));
  } else if (type === 'task') {
    const task = await Task.findOne({ _id: id, user: userId }).select('goal project').lean();
    if (task?.goal) refs.push({ type: 'goal', id: task.goal });
    if (task?.project) refs.push({ type: 'project', id: task.project });
    const focus = await FocusSession.find({ user: userId, task: id, status: 'completed' }).select('_id').limit(20).lean();
    refs.push(...focus.map((f) => ({ type: 'focus', id: f._id })));
  } else if (type === 'document') {
    const reminders = await Reminder.find({ user: userId, 'source.type': 'document', 'source.id': id }).select('_id').lean();
    refs.push(...reminders.map((r) => ({ type: 'reminder', id: r._id })));
  }

  const implicit = await resolveEntities(userId, refs);
  const explicit = await getLinksFor(userId, type, id);
  const seen = new Set(explicit.map((l) => `${l.type}:${l.id}`));
  const nodes = [...explicit.map((l) => ({ ...l, source: 'link' })), ...[...implicit.values()].filter((c) => !seen.has(`${c.type}:${c.id}`)).map((c) => ({ ...c, source: 'structure' }))];
  return nodes;
}
