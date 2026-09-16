import { HabitLog } from '../models/Habit.js';
import { addDays, dayOfWeek, diffDays, startOfWeek, toKey } from '../utils/dates.js';

export const isScheduledOn = (habit, key) =>
  habit.frequency === 'weekly' || !habit.days?.length || habit.days.includes(dayOfWeek(key));

/**
 * Computes streaks and consistency for a habit.
 * Daily habits count scheduled days; weekly habits count weeks that met the target.
 * An unfinished "today" (or current week) never breaks a streak.
 */
export function computeHabitStats(habit, dates, today, weekStartsOn = 1) {
  const set = new Set(dates);
  const sorted = [...set].filter((d) => d <= today).sort();
  const createdKey = toKey(new Date(habit.createdAt ?? Date.now()));
  let start = sorted[0] && sorted[0] < createdKey ? sorted[0] : createdKey;
  if (start > today) start = today;
  const windowStart = addDays(today, -29) > start ? addDays(today, -29) : start;
  const thisWeek = startOfWeek(today, weekStartsOn);

  if (habit.frequency === 'weekly') {
    const target = habit.timesPerWeek || 1;
    const weekCounts = new Map();
    for (const d of sorted) {
      const w = startOfWeek(d, weekStartsOn);
      weekCounts.set(w, (weekCounts.get(w) ?? 0) + 1);
    }
    const firstWeek = startOfWeek(start, weekStartsOn);
    const met = (w) => (weekCounts.get(w) ?? 0) >= target;

    let current = 0;
    let w = met(thisWeek) ? thisWeek : addDays(thisWeek, -7);
    while (w >= firstWeek && met(w)) {
      current++;
      w = addDays(w, -7);
    }

    let best = 0;
    let run = 0;
    for (let wk = firstWeek; wk <= thisWeek; wk = addDays(wk, 7)) {
      if (met(wk)) best = Math.max(best, ++run);
      else if (wk !== thisWeek) run = 0;
    }

    const inWindow = sorted.filter((d) => d >= windowStart).length;
    const expected = Math.max(1, Math.round((target * (diffDays(today, windowStart) + 1)) / 7));

    return {
      currentStreak: current,
      bestStreak: Math.max(best, current),
      streakUnit: 'week',
      completionRate: Math.min(100, Math.round((inWindow / expected) * 100)),
      doneToday: set.has(today),
      scheduledToday: true,
      weekCount: weekCounts.get(thisWeek) ?? 0,
      weekTarget: target,
      totalCompletions: sorted.length,
    };
  }

  let current = 0;
  for (let k = today, i = 0; k >= start && i < 5000; k = addDays(k, -1), i++) {
    if (!isScheduledOn(habit, k)) continue;
    if (set.has(k)) current++;
    else if (k !== today) break;
  }

  let best = 0;
  let run = 0;
  for (let k = start; k <= today; k = addDays(k, 1)) {
    if (!isScheduledOn(habit, k)) continue;
    if (set.has(k)) best = Math.max(best, ++run);
    else if (k !== today) run = 0;
  }

  let scheduled = 0;
  let done = 0;
  let weekCount = 0;
  let weekTarget = 0;
  for (let k = windowStart; k <= today; k = addDays(k, 1)) {
    if (!isScheduledOn(habit, k)) continue;
    if (set.has(k)) {
      done++;
      scheduled++;
    } else if (k !== today) scheduled++;
  }
  for (let k = thisWeek; k < addDays(thisWeek, 7); k = addDays(k, 1)) {
    if (!isScheduledOn(habit, k)) continue;
    weekTarget++;
    if (set.has(k)) weekCount++;
  }

  return {
    currentStreak: current,
    bestStreak: Math.max(best, current),
    streakUnit: 'day',
    completionRate: scheduled ? Math.round((done / scheduled) * 100) : 0,
    doneToday: set.has(today),
    scheduledToday: isScheduledOn(habit, today),
    weekCount,
    weekTarget,
    totalCompletions: sorted.length,
  };
}

/** Attaches `stats` and recent `logs` (date keys within `days`) to each habit. */
export async function withHabitStats(userId, habits, today, { days = 182, weekStartsOn = 1 } = {}) {
  if (!habits.length) return [];
  const logs = await HabitLog.find(
    { user: userId, habit: { $in: habits.map((h) => h._id) } },
    { habit: 1, date: 1 },
  ).lean();

  const byHabit = new Map();
  for (const log of logs) {
    const key = String(log.habit);
    if (!byHabit.has(key)) byHabit.set(key, []);
    byHabit.get(key).push(log.date);
  }

  const windowStart = addDays(today, -(days - 1));
  return habits.map((habit) => {
    const dates = byHabit.get(String(habit._id)) ?? [];
    const plain = typeof habit.toJSON === 'function' ? habit.toJSON() : habit;
    return {
      ...plain,
      stats: computeHabitStats(habit, dates, today, weekStartsOn),
      logs: dates.filter((d) => d >= windowStart && d <= today).sort(),
    };
  });
}
