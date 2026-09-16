import { HealthLog, Workout } from '../models/Health.js';
import { AppError } from '../utils/AppError.js';
import { addDays, diffDays, rangeKeys, serverToday } from '../utils/dates.js';
import { logActivity } from '../services/activity.js';
import { findOwned, getPreferences, round2, toObjectId } from './helpers.js';

function resolveRange({ from, to }, defaultDays = 30) {
  const end = to ?? serverToday();
  const start = from ?? addDays(end, -(defaultDays - 1));
  if (start > end) throw new AppError(400, '`from` must not be after `to`');
  if (diffDays(end, start) > 400) throw new AppError(400, 'Date range is too large');
  return { start, end };
}

const average = (values) => {
  const nums = values.filter((v) => typeof v === 'number');
  return nums.length ? round2(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
};

export async function listLogs(req, res) {
  const { start, end } = resolveRange(req.valid.query);
  const data = await HealthLog.find({ user: req.user.id, date: { $gte: start, $lte: end } }).sort({ date: -1 }).lean();
  res.json({ data });
}

export async function getLog(req, res) {
  const { date } = req.valid.params;
  const log = await HealthLog.findOne({ user: req.user.id, date });
  res.json({ data: log ?? new HealthLog({ user: req.user.id, date }) });
}

export async function upsertLog(req, res) {
  const { date } = req.valid.params;
  const existed = await HealthLog.exists({ user: req.user.id, date });
  const log = await HealthLog.findOneAndUpdate(
    { user: req.user.id, date },
    { $set: req.valid.body, $setOnInsert: { user: req.user.id, date } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  if (!existed) await logActivity(req.user.id, 'health_entry_created', { entityType: 'health', entityId: log._id, title: `Health log ${date}`, date });
  res.json({ data: log });
}

export async function addWater(req, res) {
  const { date } = req.valid.params;
  const { deltaMl } = req.valid.body;
  const log = await HealthLog.findOneAndUpdate(
    { user: toObjectId(req.user.id), date },
    [
      {
        $set: {
          user: toObjectId(req.user.id),
          date,
          waterMl: { $min: [20000, { $max: [0, { $add: [{ $ifNull: ['$waterMl', 0] }, deltaMl] }] }] },
          createdAt: { $ifNull: ['$createdAt', '$$NOW'] },
          updatedAt: '$$NOW',
        },
      },
    ],
    { upsert: true, new: true },
  );
  res.json({ data: log });
}

export async function listWorkouts(req, res) {
  const { start, end } = resolveRange(req.valid.query, 90);
  const data = await Workout.find({ user: req.user.id, date: { $gte: start, $lte: end } })
    .sort({ date: -1, createdAt: -1 })
    .lean();
  res.json({ data });
}

export async function createWorkout(req, res) {
  const workout = await Workout.create({ ...req.valid.body, user: req.user.id });
  await logActivity(req.user.id, 'workout_logged', { entityType: 'workout', entityId: workout._id, title: workout.title || workout.type, date: workout.date, meta: { minutes: workout.durationMin } });
  res.status(201).json({ data: workout });
}

export async function updateWorkout(req, res) {
  const workout = await findOwned(Workout, req.valid.params.id, req.user.id, 'Workout');
  workout.set(req.valid.body);
  await workout.save();
  res.json({ data: workout });
}

export async function deleteWorkout(req, res) {
  const workout = await findOwned(Workout, req.valid.params.id, req.user.id, 'Workout');
  await workout.deleteOne();
  res.status(204).end();
}

export async function getSummary(req, res) {
  const today = req.valid.query.date ?? serverToday();
  const days = req.valid.query.days ?? 30;
  const start = addDays(today, -(days - 1));
  const [logs, workouts, prefs] = await Promise.all([
    HealthLog.find({ user: req.user.id, date: { $gte: start, $lte: today } }).lean(),
    Workout.find({ user: req.user.id, date: { $gte: start, $lte: today } }).lean(),
    getPreferences(req.user.id),
  ]);
  res.json({ data: buildHealthSummary({ logs, workouts, prefs, start, today }) });
}

export function buildHealthSummary({ logs, workouts, prefs, start, today }) {
  const logByDate = new Map(logs.map((l) => [l.date, l]));
  const minutesByDate = new Map();
  const byType = {};
  for (const w of workouts) {
    minutesByDate.set(w.date, (minutesByDate.get(w.date) ?? 0) + w.durationMin);
    byType[w.type] = (byType[w.type] ?? 0) + w.durationMin;
  }

  const series = rangeKeys(start, today).map((date) => {
    const log = logByDate.get(date);
    return {
      date,
      waterMl: log?.waterMl ?? 0,
      sleepHours: log?.sleepHours ?? null,
      mood: log?.mood ?? null,
      energy: log?.energy ?? null,
      steps: log?.steps ?? null,
      weightKg: log?.weightKg ?? null,
      workoutMin: minutesByDate.get(date) ?? 0,
    };
  });

  const waterGoalMl = prefs.waterGoalMl ?? 2500;
  const sleepGoalHours = prefs.sleepGoalHours ?? 8;
  const weekStart = addDays(today, -6);
  const weights = logs.filter((l) => typeof l.weightKg === 'number').sort((a, b) => a.date.localeCompare(b.date));

  return {
    range: { from: start, to: today },
    goals: { waterGoalMl, sleepGoalHours, targetWeightKg: prefs.targetWeightKg ?? null },
    weight: {
      series: weights.map((l) => ({ date: l.date, weightKg: l.weightKg })),
      first: weights[0]?.weightKg ?? null,
      latest: weights.at(-1)?.weightKg ?? null,
      change: weights.length > 1 ? round2(weights.at(-1).weightKg - weights[0].weightKg) : null,
    },
    averages: {
      sleepHours: average(logs.map((l) => l.sleepHours)),
      waterMl: average(logs.map((l) => l.waterMl)),
      mood: average(logs.map((l) => l.mood)),
      energy: average(logs.map((l) => l.energy)),
      steps: average(logs.map((l) => l.steps)),
    },
    daysLogged: logs.length,
    waterGoalDays: logs.filter((l) => l.waterMl >= waterGoalMl).length,
    sleepGoalDays: logs.filter((l) => (l.sleepHours ?? 0) >= sleepGoalHours).length,
    latestWeightKg: [...logs].sort((a, b) => b.date.localeCompare(a.date)).find((l) => l.weightKg)?.weightKg ?? null,
    workouts: {
      count: workouts.length,
      minutes: workouts.reduce((sum, w) => sum + w.durationMin, 0),
      last7Minutes: workouts.filter((w) => w.date >= weekStart).reduce((sum, w) => sum + w.durationMin, 0),
      last7Count: workouts.filter((w) => w.date >= weekStart).length,
      byType: Object.entries(byType).map(([type, minutes]) => ({ type, minutes })).sort((a, b) => b.minutes - a.minutes),
    },
    series,
  };
}
