import { Task } from '../models/Task.js';
import { Habit } from '../models/Habit.js';
import { Goal } from '../models/Goal.js';
import { Reminder } from '../models/Reminder.js';
import { HealthLog, Workout } from '../models/Health.js';
import { Document } from '../models/Document.js';
import { Notification } from '../models/Notification.js';
import { buildFocusSummary } from './focus.js';
import { addDays, diffDays, rangeKeys, serverToday, toKey } from '../utils/dates.js';
import { isScheduledOn, withHabitStats } from '../services/habits.js';
import { sortGoals, withGoalProgress } from '../services/goals.js';
import { getMonthSummary } from '../services/finance.js';
import { listRoutines } from '../services/routines.js';
import { getPreferences, toObjectId } from './helpers.js';

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
const byDueThenPriority = (a, b) =>
  a.dueDate.localeCompare(b.dueDate) ||
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
  (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99');

export async function getDashboard(req, res) {
  const userId = req.user.id;
  const user = toObjectId(userId);
  const today = req.valid.query.date ?? serverToday();
  const weekAgo = addDays(today, -6);

  const [prefs, dueTasks, priorityUndated, completedToday, openCount, habitDocs, goalDocs, reminders, healthLog, workouts, finance, routines, completedByDay, documents, focus, unreadNotifications] =
    await Promise.all([
      getPreferences(userId),
      Task.find({ user, status: { $ne: 'done' }, dueDate: { $ne: null, $lte: addDays(today, 7) } })
        .populate('goal', 'title color')
        .limit(300)
        .lean(),
      Task.find({ user, status: { $ne: 'done' }, dueDate: null, priority: { $in: ['urgent', 'high'] } })
        .populate('goal', 'title color')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Task.countDocuments({ user, completedOn: today }),
      Task.countDocuments({ user, status: { $ne: 'done' } }),
      Habit.find({ user, archived: false }).sort({ order: 1, createdAt: 1 }),
      Goal.find({ user, status: 'active' }),
      Reminder.find({ user, completed: false, date: { $lte: addDays(today, 30) } }).sort({ date: 1, time: 1 }).limit(12).lean(),
      HealthLog.findOne({ user, date: today }).lean(),
      Workout.find({ user, date: { $gte: weekAgo, $lte: today } }).lean(),
      getMonthSummary(userId, today.slice(0, 7), { trendMonths: 2 }),
      listRoutines(userId, today, { active: true }),
      Task.aggregate([
        { $match: { user, completedOn: { $gte: weekAgo, $lte: today } } },
        { $group: { _id: '$completedOn', count: { $sum: 1 } } },
      ]),
      Document.find({ user, archived: false, expiryDate: { $ne: null, $lte: addDays(today, 90) } }).select('title category expiryDate remindDaysBefore').sort({ expiryDate: 1 }).limit(6).lean(),
      buildFocusSummary(userId, today, 7),
      Notification.countDocuments({ user, readAt: null }),
    ]);

  const [habits, goals] = await Promise.all([
    withHabitStats(userId, habitDocs, today, { days: 7, weekStartsOn: prefs.weekStartsOn ?? 1 }),
    withGoalProgress(userId, goalDocs),
  ]);

  dueTasks.sort(byDueThenPriority);
  const completedMap = new Map(completedByDay.map((d) => [d._id, d.count]));
  const logsByHabit = new Map(habits.map((h) => [String(h._id), new Set(h.logs)]));

  const productivity = rangeKeys(weekAgo, today).map((date) => {
    const scheduled = habitDocs.filter(
      (h) => h.frequency === 'daily' && isScheduledOn(h, date) && toKey(h.createdAt) <= date,
    );
    const done = scheduled.filter((h) => logsByHabit.get(String(h._id))?.has(date)).length;
    return {
      date,
      tasksCompleted: completedMap.get(date) ?? 0,
      habitsPct: scheduled.length ? Math.round((done / scheduled.length) * 100) : null,
    };
  });

  res.json({
    data: {
      date: today,
      tasks: {
        overdue: dueTasks.filter((t) => t.dueDate < today),
        today: dueTasks.filter((t) => t.dueDate === today),
        upcoming: dueTasks.filter((t) => t.dueDate > today),
        priority: priorityUndated,
        completedToday,
        openCount,
      },
      habits,
      goals: sortGoals(goals).slice(0, 6),
      reminders: reminders.map((r) => ({ ...r, daysUntil: diffDays(r.date, today) })),
      health: {
        log: healthLog,
        waterGoalMl: prefs.waterGoalMl ?? 2500,
        sleepGoalHours: prefs.sleepGoalHours ?? 8,
        workouts: { count: workouts.length, minutes: workouts.reduce((sum, w) => sum + w.durationMin, 0) },
      },
      finance: {
        month: finance.month,
        income: finance.income,
        expense: finance.expense,
        net: finance.net,
        savingsRate: finance.savingsRate,
        previous: finance.previous,
        budgets: [...finance.budgets].sort((a, b) => b.pct - a.pct).slice(0, 4),
        topCategories: finance.expenseByCategory.slice(0, 4),
      },
      routines: routines.filter((r) => r.today.scheduled),
      productivity,
      documents: documents.map((d) => ({ ...d, daysToExpiry: diffDays(d.expiryDate, today) })),
      focus: { todayMinutes: focus.todayMinutes, weekMinutes: focus.weekMinutes, streak: focus.streak, series: focus.series, targets: focus.targets.slice(0, 3) },
      unreadNotifications,
    },
  });
}
