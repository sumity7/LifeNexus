import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  endOfDay,
  format,
  isSameYear,
  parseISO,
  startOfDay,
} from 'date-fns';

/* Day keys ("YYYY-MM-DD") always refer to the user's local calendar. */
export const toKey = (date) => format(date, 'yyyy-MM-dd');
export const fromKey = (key) => parseISO(key);
export const todayKey = () => toKey(new Date());
export const addDaysKey = (key, n) => toKey(addDays(fromKey(key), n));
export const daysBetween = (fromKeyValue, toKeyValue) => differenceInCalendarDays(fromKey(toKeyValue), fromKey(fromKeyValue));
export const monthKey = (date = new Date()) => format(date, 'yyyy-MM');

/** "Today", "Tomorrow", "Yesterday", "Friday", "Sep 28", "Jan 3, 2027". */
export function relativeDay(key, { today = todayKey(), weekday = true } = {}) {
  if (!key) return '';
  const diff = daysBetween(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const date = fromKey(key);
  if (weekday && diff > 1 && diff < 7) return format(date, 'EEEE');
  return format(date, isSameYear(date, fromKey(today)) ? 'MMM d' : 'MMM d, yyyy');
}

/** "in 3 days", "2 days ago", "today". */
export function countdown(key, today = todayKey()) {
  const diff = daysBetween(today, key);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 0) return diff < 60 ? `in ${diff} days` : `in ${Math.round(diff / 30)} months`;
  return `${Math.abs(diff)} days ago`;
}

export const formatKey = (key, pattern = 'MMM d, yyyy') => (key ? format(fromKey(key), pattern) : '');

export function formatTimeHM(hm) {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return format(date, 'p');
}

const STEP = {
  daily: (date, n) => addDays(date, n),
  weekly: (date, n) => addWeeks(date, n),
  monthly: (date, n) => addMonths(date, n),
  yearly: (date, n) => addYears(date, n),
};

/**
 * Expands events (including recurring series) into concrete occurrences
 * overlapping [rangeStart, rangeEnd). Runs in local time so recurring events
 * keep their wall-clock time across DST changes.
 */
export function expandEvents(events = [], rangeStart, rangeEnd) {
  const occurrences = [];
  for (const event of events) {
    const start = new Date(event.start);
    const end = new Date(event.end);
    const duration = end - start;
    const freq = event.recurrence?.freq ?? 'none';

    if (freq === 'none') {
      if (start < rangeEnd && end > rangeStart) occurrences.push({ ...event, start, end, key: event._id, source: event });
      continue;
    }

    const interval = event.recurrence.interval || 1;
    const until = event.recurrence.until ? endOfDay(new Date(event.recurrence.until)) : null;
    const step = STEP[freq];

    // Jump close to the visible range instead of iterating from the series start.
    let n = 0;
    if (rangeStart > start) {
      const elapsed =
        freq === 'daily' ? differenceInCalendarDays(rangeStart, start)
          : freq === 'weekly' ? Math.floor(differenceInCalendarDays(rangeStart, start) / 7)
            : freq === 'monthly' ? differenceInCalendarMonths(rangeStart, start)
              : Math.floor(differenceInCalendarMonths(rangeStart, start) / 12);
      n = Math.max(0, Math.floor(elapsed / interval) - 1);
    }

    for (let guard = 0; guard < 1500; guard++, n++) {
      const occStart = step(start, n * interval);
      if (occStart >= rangeEnd || (until && occStart > until)) break;
      const occEnd = new Date(occStart.getTime() + duration);
      if (occEnd > rangeStart) {
        occurrences.push({ ...event, start: occStart, end: occEnd, key: `${event._id}:${n}`, isRecurring: true, source: event });
      }
    }
  }
  return occurrences.sort((a, b) => a.start - b.start || Number(b.allDay) - Number(a.allDay));
}

export const occursOnDay = (occurrence, day) => occurrence.start <= endOfDay(day) && occurrence.end > startOfDay(day);

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Converts a Date to the value format of <input type="datetime-local">. */
export const toDateTimeInput = (date) => format(date, "yyyy-MM-dd'T'HH:mm");
