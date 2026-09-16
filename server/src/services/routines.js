import { Routine, RoutineLog } from '../models/Routine.js';
import { addDays, dayOfWeek } from '../utils/dates.js';

const TYPE_ORDER = { morning: 0, custom: 1, evening: 2 };

export const isRoutineScheduled = (routine, key) => !routine.days?.length || routine.days.includes(dayOfWeek(key));

function progressFor(routine, completedSteps) {
  const stepIds = new Set(routine.steps.map((s) => String(s._id)));
  const done = completedSteps.map(String).filter((id) => stepIds.has(id));
  return {
    completedSteps: done,
    completed: done.length,
    total: stepIds.size,
    pct: stepIds.size ? Math.round((done.length / stepIds.size) * 100) : 0,
  };
}

/** Routines with today's check-off state and the last 7 days of completion history. */
export async function withRoutineProgress(userId, routines, date) {
  if (!routines.length) return [];
  const historyStart = addDays(date, -6);
  const logs = await RoutineLog.find({
    user: userId,
    routine: { $in: routines.map((r) => r._id) },
    date: { $gte: historyStart, $lte: date },
  }).lean();

  const logMap = new Map(logs.map((l) => [`${l.routine}:${l.date}`, l.completedSteps]));

  return routines
    .map((routine) => {
      const plain = typeof routine.toJSON === 'function' ? routine.toJSON() : routine;
      const history = [];
      for (let k = historyStart; k <= date; k = addDays(k, 1)) {
        history.push({
          date: k,
          scheduled: isRoutineScheduled(routine, k),
          pct: progressFor(routine, logMap.get(`${routine._id}:${k}`) ?? []).pct,
        });
      }
      return {
        ...plain,
        today: {
          date,
          scheduled: isRoutineScheduled(routine, date),
          ...progressFor(routine, logMap.get(`${routine._id}:${date}`) ?? []),
        },
        history,
      };
    })
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
        (a.timeOfDay ?? '99:99').localeCompare(b.timeOfDay ?? '99:99'),
    );
}

export async function listRoutines(userId, date, filter = {}) {
  const routines = await Routine.find({ user: userId, ...filter });
  return withRoutineProgress(userId, routines, date);
}
