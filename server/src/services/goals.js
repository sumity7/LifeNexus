import { Task } from '../models/Task.js';
import { toObjectId } from '../controllers/helpers.js';

const STATUS_ORDER = { active: 0, paused: 1, completed: 2, archived: 3 };

/**
 * Progress = completed units / total units, where units are milestones plus
 * linked tasks. Completed goals are always 100%.
 */
export async function withGoalProgress(userId, goals) {
  if (!goals.length) return [];
  const counts = await Task.aggregate([
    { $match: { user: toObjectId(userId), goal: { $in: goals.map((g) => g._id) } } },
    {
      $group: {
        _id: '$goal',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
      },
    },
  ]);
  const byGoal = new Map(counts.map((c) => [String(c._id), c]));

  return goals.map((goal) => {
    const plain = typeof goal.toJSON === 'function' ? goal.toJSON() : goal;
    const tasks = byGoal.get(String(goal._id)) ?? { total: 0, done: 0 };
    const milestones = goal.milestones?.length ?? 0;
    const milestonesDone = goal.milestones?.filter((m) => m.done).length ?? 0;
    const total = milestones + tasks.total;
    const done = milestonesDone + tasks.done;
    const progress = goal.status === 'completed' ? 100 : total ? Math.round((done / total) * 100) : 0;
    return {
      ...plain,
      progress,
      stats: { milestones, milestonesDone, tasks: tasks.total, tasksDone: tasks.done },
    };
  });
}

export function sortGoals(goals) {
  return [...goals].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.deadline ?? '9999') .localeCompare(b.deadline ?? '9999') ||
      new Date(b.createdAt) - new Date(a.createdAt),
  );
}
