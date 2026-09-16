import { Routine, RoutineLog } from '../models/Routine.js';
import { Habit, HabitLog } from '../models/Habit.js';
import { AppError, notFound } from '../utils/AppError.js';
import { serverToday } from '../utils/dates.js';
import { listRoutines as loadRoutines, withRoutineProgress } from '../services/routines.js';
import { logActivity } from '../services/activity.js';
import { setHabitCheckin } from './habits.js';
import { findOwned } from './helpers.js';

async function single(userId, routine, date = serverToday()) {
  const [data] = await withRoutineProgress(userId, [routine], date);
  return data;
}

async function assertStepHabits(userId, steps = []) {
  const ids = steps.map((s) => s.habit).filter(Boolean);
  if (!ids.length) return;
  const count = await Habit.countDocuments({ user: userId, _id: { $in: ids } });
  if (count !== new Set(ids.map(String)).size) throw new AppError(400, 'Linked habit not found');
}

/** Mirrors a step check-off onto its linked habit for the same day. */
async function syncLinkedHabit(userId, step, date, done) {
  if (!step.habit) return;
  const habit = await Habit.findOne({ _id: step.habit, user: userId });
  if (!habit) return;
  const has = await HabitLog.exists({ habit: habit._id, user: userId, date });
  if (done && !has) await setHabitCheckin(userId, habit, date, true);
  if (!done && has) await setHabitCheckin(userId, habit, date, false);
}

async function logIfCompleted(userId, routine, date) {
  const log = await RoutineLog.findOne({ user: userId, routine: routine._id, date }).lean();
  const ids = new Set(routine.steps.map((s) => String(s._id)));
  const done = (log?.completedSteps ?? []).map(String).filter((id) => ids.has(id)).length;
  if (ids.size && done === ids.size) {
    await logActivity(userId, 'routine_completed', { entityType: 'routine', entityId: routine._id, title: routine.name, date });
  }
}

export async function listRoutines(req, res) {
  res.json({ data: await loadRoutines(req.user.id, req.valid.query.date ?? serverToday()) });
}

export async function createRoutine(req, res) {
  await assertStepHabits(req.user.id, req.valid.body.steps);
  const routine = await Routine.create({ ...req.valid.body, user: req.user.id });
  res.status(201).json({ data: await single(req.user.id, routine) });
}

export async function updateRoutine(req, res) {
  const routine = await findOwned(Routine, req.valid.params.id, req.user.id, 'Routine');
  await assertStepHabits(req.user.id, req.valid.body.steps);
  routine.set(req.valid.body);
  await routine.save();
  res.json({ data: await single(req.user.id, routine) });
}

export async function deleteRoutine(req, res) {
  const routine = await findOwned(Routine, req.valid.params.id, req.user.id, 'Routine');
  await Promise.all([routine.deleteOne(), RoutineLog.deleteMany({ user: req.user.id, routine: routine._id })]);
  res.status(204).end();
}

export async function toggleStep(req, res) {
  const { id, stepId } = req.valid.params;
  const { date } = req.valid.body;
  const routine = await findOwned(Routine, id, req.user.id, 'Routine');
  const step = routine.steps.id(stepId);
  if (!step) throw notFound('Step');

  const log = await RoutineLog.findOne({ user: req.user.id, routine: routine._id, date });
  const isDone = log?.completedSteps.some((s) => String(s) === stepId);
  await RoutineLog.updateOne(
    { user: req.user.id, routine: routine._id, date },
    isDone ? { $pull: { completedSteps: stepId } } : { $addToSet: { completedSteps: stepId } },
    { upsert: true },
  );
  await syncLinkedHabit(req.user.id, step, date, !isDone);
  if (!isDone) await logIfCompleted(req.user.id, routine, date);

  res.json({ data: await single(req.user.id, routine, date) });
}

export async function completeAll(req, res) {
  const { date } = req.valid.body;
  const routine = await findOwned(Routine, req.valid.params.id, req.user.id, 'Routine');
  await RoutineLog.updateOne(
    { user: req.user.id, routine: routine._id, date },
    { $set: { completedSteps: routine.steps.map((s) => s._id) } },
    { upsert: true },
  );
  for (const step of routine.steps) await syncLinkedHabit(req.user.id, step, date, true);
  await logIfCompleted(req.user.id, routine, date);
  res.json({ data: await single(req.user.id, routine, date) });
}

export async function resetDay(req, res) {
  const { date } = req.valid.body;
  const routine = await findOwned(Routine, req.valid.params.id, req.user.id, 'Routine');
  await RoutineLog.deleteOne({ user: req.user.id, routine: routine._id, date });
  res.json({ data: await single(req.user.id, routine, date) });
}
