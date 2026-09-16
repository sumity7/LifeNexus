import { Task } from '../models/Task.js';
import { Event } from '../models/Event.js';
import { Habit } from '../models/Habit.js';
import { Goal } from '../models/Goal.js';
import { Document } from '../models/Document.js';
import { Reminder } from '../models/Reminder.js';
import { withHabitStats } from './habits.js';
import { withGoalProgress } from './goals.js';
import { getMonthSummary } from './finance.js';
import { listRoutines } from './routines.js';
import { buildFocusSummary } from '../controllers/focus.js';
import { addDays, diffDays } from '../utils/dates.js';
import { getPreferences } from '../controllers/helpers.js';

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Deterministic daily brief computed from the user's real data. The AI (when
 * configured) only narrates this summary; the numbers never come from the model.
 */
export async function buildBrief(userId, today) {
  const prefs = await getPreferences(userId);
  const dayStart = new Date(`${today}T00:00:00`);
  const dayEnd = new Date(`${addDays(today, 1)}T00:00:00`);
  const [tasks, events, habitDocs, goalDocs, documents, reminders, routines, focus, finance] = await Promise.all([
    Task.find({ user: userId, status: { $ne: 'done' }, dueDate: { $ne: null, $lte: addDays(today, 7) } }).populate('goal', 'title').lean(),
    Event.find({ user: userId, start: { $lt: dayEnd }, $or: [{ end: { $gt: dayStart } }, { 'recurrence.freq': { $ne: 'none' } }] }).sort({ start: 1 }).lean(),
    Habit.find({ user: userId, archived: false }),
    Goal.find({ user: userId, status: 'active' }),
    Document.find({ user: userId, archived: false, expiryDate: { $ne: null, $lte: addDays(today, 60) } }).select('title expiryDate remindDaysBefore').lean(),
    Reminder.find({ user: userId, completed: false, date: { $lte: addDays(today, 7) } }).sort({ date: 1 }).lean(),
    listRoutines(userId, today, { active: true }),
    buildFocusSummary(userId, today, 7),
    getMonthSummary(userId, today.slice(0, 7), { trendMonths: 1 }),
  ]);

  const habits = await withHabitStats(userId, habitDocs, today, { days: 7, weekStartsOn: prefs.weekStartsOn ?? 1 });
  const goals = await withGoalProgress(userId, goalDocs);

  const overdue = tasks.filter((t) => t.dueDate < today).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const dueToday = tasks.filter((t) => t.dueDate === today).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const important = [...overdue, ...dueToday].filter((t) => ['urgent', 'high'].includes(t.priority));

  // Recurring events: only those whose weekday matches today (client expands exact occurrences).
  const todayDow = dayStart.getDay();
  const todaysEvents = events.filter((e) => {
    if (e.recurrence?.freq === 'none') return true;
    const s = new Date(e.start);
    if (s > dayEnd) return false;
    if (e.recurrence.freq === 'daily') return true;
    if (e.recurrence.freq === 'weekly') return s.getDay() === todayDow;
    if (e.recurrence.freq === 'monthly') return s.getDate() === dayStart.getDate();
    return s.getMonth() === dayStart.getMonth() && s.getDate() === dayStart.getDate();
  });

  const habitsToday = habits.filter((h) => h.scheduledToday ?? h.stats.scheduledToday);
  const habitsLeft = habitsToday.filter((h) => !h.stats.doneToday);

  const behind = goals
    .filter((g) => g.deadline && g.startDate && g.deadline > g.startDate)
    .map((g) => {
      const elapsed = Math.min(100, Math.max(0, Math.round((diffDays(today, g.startDate) / diffDays(g.deadline, g.startDate)) * 100)));
      return { ...g, elapsed, gap: elapsed - g.progress };
    })
    .filter((g) => g.gap > 15)
    .sort((a, b) => b.gap - a.gap);

  const deadlines = goals.filter((g) => g.deadline && diffDays(g.deadline, today) <= 7 && diffDays(g.deadline, today) >= 0);
  const expiring = documents.filter((d) => diffDays(d.expiryDate, today) <= (d.remindDaysBefore ?? 30));
  const overBudget = finance.budgets.filter((b) => b.pct > 100);

  // Suggestions: deterministic, data-driven, at most 3.
  const suggestions = [];
  const focusTarget = important[0] ?? dueToday[0] ?? overdue[0];
  if (focusTarget) suggestions.push({ kind: 'focus', title: `${prefs.focusMinutes ?? 25}-minute focus session on "${focusTarget.title}"`, taskId: focusTarget._id });
  if (behind[0]) suggestions.push({ kind: 'goal', title: `Move "${behind[0].title}" forward — it's ${behind[0].gap}% behind schedule`, goalId: behind[0]._id });
  const routineNext = routines.find((r) => r.today.scheduled && r.today.pct < 100 && r.steps.length);
  if (routineNext) suggestions.push({ kind: 'routine', title: `Finish ${routineNext.name} (${routineNext.today.completed}/${routineNext.today.total} steps)`, routineId: routineNext._id });
  if (suggestions.length < 3 && habitsLeft[0]) suggestions.push({ kind: 'habit', title: `Check in ${habitsLeft[0].name}${habitsLeft[0].stats.currentStreak ? ` to keep your ${habitsLeft[0].stats.currentStreak}-day streak` : ''}`, habitId: habitsLeft[0]._id });
  if (suggestions.length < 3 && expiring[0]) suggestions.push({ kind: 'document', title: `Renew "${expiring[0].title}" (expires ${expiring[0].expiryDate})`, documentId: expiring[0]._id });

  const summary = {
    date: today,
    tasks: { important: important.slice(0, 5).map((t) => t.title), dueToday: dueToday.length, overdue: overdue.length, overdueTitles: overdue.slice(0, 3).map((t) => t.title) },
    events: todaysEvents.slice(0, 6).map((e) => ({ title: e.title, allDay: e.allDay, start: e.start })),
    habits: { scheduled: habitsToday.length, done: habitsToday.length - habitsLeft.length, left: habitsLeft.slice(0, 4).map((h) => h.name) },
    routines: routines.filter((r) => r.today.scheduled).map((r) => ({ name: r.name, pct: r.today.pct })),
    goals: { deadlines: deadlines.map((g) => ({ title: g.title, deadline: g.deadline, progress: g.progress })), behind: behind.slice(0, 3).map((g) => ({ title: g.title, progress: g.progress, expected: g.elapsed })) },
    documents: { expiring: expiring.slice(0, 3).map((d) => ({ title: d.title, expiryDate: d.expiryDate })) },
    reminders: reminders.slice(0, 4).map((r) => ({ title: r.title, date: r.date })),
    finance: { overBudget: overBudget.map((b) => b.category), net: finance.net },
    focus: { weekMinutes: focus.weekMinutes, streak: focus.streak },
    suggestions: suggestions.slice(0, 3).map((s) => s.title),
  };

  return { date: today, summary, suggestions: suggestions.slice(0, 3), counts: { important: important.length, events: todaysEvents.length, habitsLeft: habitsLeft.length, deadlines: deadlines.length, expiring: expiring.length, overdue: overdue.length } };
}
