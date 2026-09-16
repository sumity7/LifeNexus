import { Task } from '../models/Task.js';
import { Habit } from '../models/Habit.js';
import { Goal } from '../models/Goal.js';
import { Transaction } from '../models/Finance.js';
import { HealthLog, Workout } from '../models/Health.js';
import { Routine, RoutineLog } from '../models/Routine.js';
import { PRIORITIES } from '../constants.js';
import { addDays, dayOfWeek, diffDays, fromKey, rangeKeys, serverToday, toKey } from '../utils/dates.js';
import { isScheduledOn, withHabitStats } from '../services/habits.js';
import { sortGoals, withGoalProgress } from '../services/goals.js';
import { getMonthSummary } from '../services/finance.js';
import { isRoutineScheduled } from '../services/routines.js';
import { buildHealthSummary } from './health.js';
import { buildFocusSummary } from './focus.js';
import { getPreferences, round2, toObjectId } from './helpers.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const avg = (arr) => {
  const nums = arr.filter((v) => typeof v === 'number');
  return nums.length ? Math.round(sum(nums) / nums.length) : null;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export async function getAnalytics(req, res) {
  const userId = req.user.id;
  const user = toObjectId(userId);
  const today = req.valid.query.date ?? serverToday();
  const days = req.valid.query.days ?? 30;
  const start = addDays(today, -(days - 1));
  const prevStart = addDays(start, -days);
  const prevEnd = addDays(start, -1);
  const keys = rangeKeys(start, today);

  const [prefs, completed, prevCompleted, missed, overdue, created, habitDocs, goalDocs, transactions, healthLogs, workouts, routines, routineLogs] =
    await Promise.all([
      getPreferences(userId),
      Task.find({ user, completedOn: { $gte: start, $lte: today } }, { completedOn: 1, priority: 1 }).lean(),
      Task.countDocuments({ user, completedOn: { $gte: prevStart, $lte: prevEnd } }),
      Task.countDocuments({ user, status: { $ne: 'done' }, dueDate: { $gte: start, $lt: today } }),
      Task.countDocuments({ user, status: { $ne: 'done' }, dueDate: { $lt: today } }),
      Task.countDocuments({ user, createdAt: { $gte: fromKey(start) } }),
      Habit.find({ user, archived: false }).sort({ order: 1, createdAt: 1 }),
      Goal.find({ user, status: { $ne: 'archived' } }),
      Transaction.find({ user, date: { $gte: start, $lte: today } }).lean(),
      HealthLog.find({ user, date: { $gte: start, $lte: today } }).lean(),
      Workout.find({ user, date: { $gte: start, $lte: today } }).lean(),
      Routine.find({ user, active: true }).lean(),
      RoutineLog.find({ user, date: { $gte: start, $lte: today } }).lean(),
    ]);

  /* Tasks */
  const tasksByDay = new Map();
  const weekdayTotals = Array(7).fill(0);
  for (const t of completed) {
    tasksByDay.set(t.completedOn, (tasksByDay.get(t.completedOn) ?? 0) + 1);
    weekdayTotals[dayOfWeek(t.completedOn)]++;
  }
  const tasks = {
    completed: completed.length,
    previousCompleted: prevCompleted,
    created,
    missed,
    overdue,
    completionRate: completed.length + missed ? Math.round((completed.length / (completed.length + missed)) * 100) : null,
    byPriority: PRIORITIES.map((p) => ({ priority: p, count: completed.filter((t) => t.priority === p).length })),
    byWeekday: WEEKDAYS.map((day, i) => ({ day: day.slice(0, 3), count: weekdayTotals[i] })),
  };

  /* Habits */
  const habitsWithStats = await withHabitStats(userId, habitDocs, today, { days, weekStartsOn: prefs.weekStartsOn ?? 1 });
  const logSets = new Map(habitsWithStats.map((h) => [String(h._id), new Set(h.logs)]));
  const habitDaily = keys.map((date) => {
    const scheduled = habitDocs.filter((h) => h.frequency === 'daily' && isScheduledOn(h, date) && toKey(h.createdAt) <= date);
    const done = scheduled.filter((h) => logSets.get(String(h._id)).has(date)).length;
    return scheduled.length ? Math.round((done / scheduled.length) * 100) : null;
  });
  const perHabit = habitsWithStats.map((h) => {
    const set = logSets.get(String(h._id));
    const from = toKey(new Date(h.createdAt)) > start ? toKey(new Date(h.createdAt)) : start;
    let rate = 0;
    if (from <= today) {
      if (h.frequency === 'weekly') {
        const expected = Math.max(1, Math.round((h.timesPerWeek * (diffDays(today, from) + 1)) / 7));
        rate = Math.min(100, Math.round((set.size / expected) * 100));
      } else {
        let scheduled = 0;
        let done = 0;
        for (const date of rangeKeys(from, today)) {
          if (!isScheduledOn(h, date)) continue;
          if (set.has(date)) done++;
          if (set.has(date) || date !== today) scheduled++;
        }
        rate = scheduled ? Math.round((done / scheduled) * 100) : 0;
      }
    }
    return {
      _id: h._id, name: h.name, icon: h.icon, color: h.color, frequency: h.frequency, rate,
      completions: set.size, currentStreak: h.stats.currentStreak, bestStreak: h.stats.bestStreak, streakUnit: h.stats.streakUnit,
    };
  });

  /* Goals */
  const goals = sortGoals(await withGoalProgress(userId, goalDocs));
  const activeGoals = goals.filter((g) => g.status === 'active');
  const rangeStart = fromKey(start);
  const goalSummary = {
    active: activeGoals.length,
    completed: goals.filter((g) => g.status === 'completed').length,
    avgProgress: avg(activeGoals.map((g) => g.progress)),
    milestonesCompleted: sum(goalDocs.map((g) => g.milestones.filter((m) => m.done && m.completedAt >= rangeStart).length)),
    list: goals.slice(0, 8).map((g) => ({ _id: g._id, title: g.title, color: g.color, status: g.status, progress: g.progress, deadline: g.deadline })),
  };

  /* Finance */
  const income = round2(sum(transactions.filter((t) => t.type === 'income').map((t) => t.amount)));
  const expense = round2(sum(transactions.filter((t) => t.type === 'expense').map((t) => t.amount)));
  const categoryTotals = new Map();
  const expenseByDay = new Map();
  for (const t of transactions.filter((tx) => tx.type === 'expense')) {
    categoryTotals.set(t.category, (categoryTotals.get(t.category) ?? 0) + t.amount);
    expenseByDay.set(t.date, (expenseByDay.get(t.date) ?? 0) + t.amount);
  }
  const month = await getMonthSummary(userId, today.slice(0, 7), { trendMonths: 6 });
  const finance = {
    income,
    expense,
    net: round2(income - expense),
    savingsRate: income > 0 ? Math.round(((income - expense) / income) * 100) : null,
    byCategory: [...categoryTotals].map(([category, total]) => ({ category, total: round2(total) })).sort((a, b) => b.total - a.total),
    trend: month.trend,
    budgets: month.budgets,
  };

  /* Health */
  const health = buildHealthSummary({ logs: healthLogs, workouts, prefs, start, today });

  /* Focus */
  const focus = await buildFocusSummary(userId, today, days);

  /* Routines */
  const routineLogMap = new Map(routineLogs.map((l) => [`${l.routine}:${l.date}`, l.completedSteps.map(String)]));
  const routineDaily = keys.map((date) => {
    const scheduled = routines.filter((r) => r.steps.length && isRoutineScheduled(r, date) && toKey(r.createdAt) <= date);
    if (!scheduled.length) return null;
    const ratios = scheduled.map((r) => {
      const ids = new Set(r.steps.map((s) => String(s._id)));
      const done = (routineLogMap.get(`${r._id}:${date}`) ?? []).filter((id) => ids.has(id)).length;
      return done / ids.size;
    });
    return Math.round((sum(ratios) / ratios.length) * 100);
  });

  const daily = keys.map((date, i) => ({
    date,
    tasksCompleted: tasksByDay.get(date) ?? 0,
    habitsPct: habitDaily[i],
    routinesPct: routineDaily[i],
    expense: round2(expenseByDay.get(date) ?? 0),
    sleepHours: health.series[i].sleepHours,
    waterMl: health.series[i].waterMl,
    mood: health.series[i].mood,
    energy: health.series[i].energy,
    workoutMin: health.series[i].workoutMin,
    focusMin: focus.series[i]?.minutes ?? 0,
  }));

  res.json({
    data: {
      range: { from: start, to: today, days },
      summary: {
        tasksCompleted: tasks.completed,
        taskCompletionRate: tasks.completionRate,
        habitConsistency: avg(habitDaily),
        routineConsistency: avg(routineDaily),
        goalsAvgProgress: goalSummary.avgProgress,
        net: finance.net,
        avgSleep: health.averages.sleepHours,
        workoutMinutes: health.workouts.minutes,
        focusMinutes: focus.totalMinutes,
      },
      tasks,
      habits: { daily: habitDaily, perHabit },
      goals: goalSummary,
      finance,
      health: { averages: health.averages, goals: health.goals, workouts: health.workouts },
      focus: { totalMinutes: focus.totalMinutes, sessions: focus.totalSessions, streak: focus.streak, targets: focus.targets },
      daily,
      insights: buildInsights({ days, today, tasks, perHabit, finance, health, activeGoals, weekdayTotals }),
    },
  });
}

function buildInsights({ days, today, tasks, perHabit, finance, health, activeGoals, weekdayTotals }) {
  const insights = [];

  if (tasks.completed || tasks.previousCompleted) {
    if (tasks.previousCompleted) {
      const change = Math.round(((tasks.completed - tasks.previousCompleted) / tasks.previousCompleted) * 100);
      insights.push({
        tone: change >= 0 ? 'positive' : 'warning',
        title: change >= 0 ? `Task output up ${change}%` : `Task output down ${Math.abs(change)}%`,
        detail: `${plural(tasks.completed, 'task')} completed vs ${tasks.previousCompleted} in the previous ${days} days.`,
      });
    } else {
      insights.push({ tone: 'positive', title: `${plural(tasks.completed, 'task')} completed`, detail: `Across the last ${days} days.` });
    }
  }

  if (tasks.completed >= 5) {
    const best = weekdayTotals.indexOf(Math.max(...weekdayTotals));
    insights.push({
      tone: 'info',
      title: `${WEEKDAYS[best]} is your most productive day`,
      detail: `${plural(weekdayTotals[best], 'task')} completed on ${WEEKDAYS[best]}s in this period.`,
    });
  }

  if (tasks.overdue) {
    insights.push({
      tone: 'warning',
      title: `${plural(tasks.overdue, 'overdue task')}`,
      detail: 'Reschedule or break them into smaller steps to keep momentum.',
    });
  }

  if (perHabit.length) {
    const sorted = [...perHabit].sort((a, b) => b.rate - a.rate);
    const top = sorted[0];
    const weakest = sorted[sorted.length - 1];
    if (top.rate >= 60) {
      insights.push({
        tone: 'positive',
        title: `${top.name} is your most consistent habit`,
        detail: `${top.rate}% consistency with a best streak of ${plural(top.bestStreak, top.streakUnit)}.`,
      });
    }
    if (weakest !== top && weakest.rate < 50) {
      insights.push({
        tone: 'warning',
        title: `${weakest.name} needs attention`,
        detail: `${weakest.rate}% consistency — try a smaller, easier version of it.`,
      });
    }
  }

  if (finance.byCategory.length && finance.expense > 0) {
    const top = finance.byCategory[0];
    insights.push({
      tone: 'info',
      title: `Top spending category: ${top.category}`,
      detail: `${Math.round((top.total / finance.expense) * 100)}% of your expenses in this period.`,
    });
  }

  const overBudget = finance.budgets.filter((b) => b.pct > 100);
  if (overBudget.length) {
    insights.push({
      tone: 'warning',
      title: `${plural(overBudget.length, 'budget')} exceeded this month`,
      detail: overBudget.map((b) => b.category).join(', '),
    });
  }

  const sleep = health.averages.sleepHours;
  if (sleep !== null) {
    const goal = health.goals.sleepGoalHours;
    insights.push(
      sleep < goal - 0.5
        ? { tone: 'warning', title: `Averaging ${sleep}h of sleep`, detail: `That's below your ${goal}h goal.` }
        : { tone: 'positive', title: `Averaging ${sleep}h of sleep`, detail: `You're close to your ${goal}h goal.` },
    );
  }

  const atRisk = activeGoals.find((g) => g.deadline && diffDays(g.deadline, today) <= 30 && diffDays(g.deadline, today) >= 0 && g.progress < 50);
  if (atRisk) {
    insights.push({
      tone: 'warning',
      title: `"${atRisk.title}" is due soon`,
      detail: `${atRisk.progress}% complete with ${plural(diffDays(atRisk.deadline, today), 'day')} left.`,
    });
  }

  return insights;
}
