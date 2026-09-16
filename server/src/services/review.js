import { Task } from '../models/Task.js';
import { Habit, HabitLog } from '../models/Habit.js';
import { Goal } from '../models/Goal.js';
import { Routine, RoutineLog } from '../models/Routine.js';
import { HealthLog, Workout } from '../models/Health.js';
import { Transaction } from '../models/Finance.js';
import { FocusSession } from '../models/FocusSession.js';
import { JournalEntry } from '../models/Journal.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { isScheduledOn } from './habits.js';
import { isRoutineScheduled } from './routines.js';
import { withGoalProgress } from './goals.js';
import { addDays, rangeKeys, toKey } from '../utils/dates.js';
import { round2, toObjectId } from '../controllers/helpers.js';

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const avg = (arr) => {
  const nums = arr.filter((v) => typeof v === 'number');
  return nums.length ? Math.round((sum(nums) / nums.length) * 10) / 10 : null;
};
const pct = (part, total) => (total ? Math.round((part / total) * 100) : null);

async function weekMetrics(userId, start, end) {
  const user = toObjectId(userId);
  const keys = rangeKeys(start, end);
  const [completed, created, missed, habits, habitLogs, routines, routineLogs, logs, workouts, transactions, focus, journal] = await Promise.all([
    Task.find({ user, completedOn: { $gte: start, $lte: end } }).select('title priority goal').lean(),
    Task.countDocuments({ user, createdAt: { $gte: new Date(`${start}T00:00:00Z`), $lte: new Date(`${end}T23:59:59Z`) } }),
    Task.countDocuments({ user, status: { $ne: 'done' }, dueDate: { $gte: start, $lte: end } }),
    Habit.find({ user, archived: false }).lean(),
    HabitLog.find({ user, date: { $gte: start, $lte: end } }).lean(),
    Routine.find({ user, active: true }).lean(),
    RoutineLog.find({ user, date: { $gte: start, $lte: end } }).lean(),
    HealthLog.find({ user, date: { $gte: start, $lte: end } }).lean(),
    Workout.find({ user, date: { $gte: start, $lte: end } }).lean(),
    Transaction.find({ user, date: { $gte: start, $lte: end } }).lean(),
    FocusSession.find({ user, status: 'completed', date: { $gte: start, $lte: end } }).lean(),
    JournalEntry.find({ user, date: { $gte: start, $lte: end } }).lean(),
  ]);

  const logSet = new Set(habitLogs.map((l) => `${l.habit}:${l.date}`));
  let scheduled = 0;
  let done = 0;
  const perHabit = habits.map((h) => {
    let s = 0;
    let d = 0;
    for (const k of keys) {
      if (h.frequency === 'weekly' || !isScheduledOn(h, k) || toKey(h.createdAt) > k) continue;
      s++;
      if (logSet.has(`${h._id}:${k}`)) d++;
    }
    if (h.frequency === 'weekly') {
      d = keys.filter((k) => logSet.has(`${h._id}:${k}`)).length;
      s = h.timesPerWeek;
    }
    scheduled += s;
    done += Math.min(d, s);
    return { name: h.name, done: d, scheduled: s, rate: pct(Math.min(d, s), s) };
  });

  const routineLogMap = new Map(routineLogs.map((l) => [`${l.routine}:${l.date}`, l.completedSteps.map(String)]));
  const routineRates = [];
  for (const r of routines) {
    if (!r.steps.length) continue;
    const ids = new Set(r.steps.map((s) => String(s._id)));
    for (const k of keys) {
      if (!isRoutineScheduled(r, k) || toKey(r.createdAt) > k) continue;
      const d = (routineLogMap.get(`${r._id}:${k}`) ?? []).filter((id) => ids.has(id)).length;
      routineRates.push(d / ids.size);
    }
  }

  const income = round2(sum(transactions.filter((t) => t.type === 'income').map((t) => t.amount)));
  const expense = round2(sum(transactions.filter((t) => t.type === 'expense').map((t) => t.amount)));
  const byCat = new Map();
  for (const t of transactions.filter((x) => x.type === 'expense')) byCat.set(t.category, (byCat.get(t.category) ?? 0) + t.amount);

  return {
    range: { from: start, to: end },
    tasks: { completed: completed.length, created, missed, completionRate: pct(completed.length, completed.length + missed), topTitles: completed.slice(0, 8).map((t) => t.title) },
    habits: { consistency: pct(done, scheduled), scheduled, done, perHabit: perHabit.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)) },
    routines: { consistency: routineRates.length ? Math.round((sum(routineRates) / routineRates.length) * 100) : null },
    health: {
      avgSleep: avg(logs.map((l) => l.sleepHours)), avgMood: avg(logs.map((l) => l.mood)), avgEnergy: avg(logs.map((l) => l.energy)),
      avgWater: avg(logs.map((l) => l.waterMl)), workouts: workouts.length, workoutMinutes: sum(workouts.map((w) => w.durationMin)), daysLogged: logs.length,
    },
    focus: { sessions: focus.length, minutes: Math.round(sum(focus.map((f) => f.focusedSeconds)) / 60), daysWithFocus: new Set(focus.map((f) => f.date)).size },
    finance: { income, expense, net: round2(income - expense), topCategories: [...byCat].map(([category, total]) => ({ category, total: round2(total) })).sort((a, b) => b.total - a.total).slice(0, 5) },
    journal: { entries: journal.length, wins: journal.flatMap((j) => j.wins).slice(0, 8), challenges: journal.flatMap((j) => j.challenges).slice(0, 8), gratitude: journal.flatMap((j) => j.gratitude).slice(0, 5) },
  };
}

/** Week + previous week metrics, goal state and activity highlights. All numbers are computed, never modelled. */
export async function buildWeeklyReview(userId, weekStart, today) {
  const weekEnd = addDays(weekStart, 6);
  const end = weekEnd < today ? weekEnd : today;
  const [current, previous, goalDocs, activity] = await Promise.all([
    weekMetrics(userId, weekStart, end),
    weekMetrics(userId, addDays(weekStart, -7), addDays(weekStart, -1)),
    Goal.find({ user: userId, status: 'active' }),
    ActivityLog.find({ user: userId, date: { $gte: weekStart, $lte: end } }).sort({ createdAt: -1 }).limit(60).lean(),
  ]);
  const goals = await withGoalProgress(userId, goalDocs);
  const highlights = activity
    .filter((a) => ['goal_completed', 'milestone_completed', 'project_completed', 'focus_session_completed', 'document_uploaded', 'journal_created'].includes(a.type))
    .slice(0, 12)
    .map((a) => `${a.type.replace(/_/g, ' ')}: ${a.title}`);

  const metrics = {
    ...current,
    previous: { tasks: previous.tasks, habits: { consistency: previous.habits.consistency }, routines: previous.routines, health: previous.health, focus: previous.focus, finance: { income: previous.finance.income, expense: previous.finance.expense, net: previous.finance.net } },
    goals: goals.slice(0, 8).map((g) => ({ title: g.title, progress: g.progress, deadline: g.deadline, milestonesDone: g.stats.milestonesDone, milestones: g.stats.milestones })),
  };
  return { range: { from: weekStart, to: end, weekEnd }, metrics, highlights, activity: activity.slice(0, 30) };
}
