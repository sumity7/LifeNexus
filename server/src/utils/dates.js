/**
 * Calendar-day helpers operating on "YYYY-MM-DD" keys.
 *
 * Day-based data (due dates, habit check-ins, health logs…) is stored as plain
 * keys in the user's local calendar, so all arithmetic here is done in UTC to
 * stay independent of the server's timezone.
 */
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');

export const fromKey = (key) => new Date(`${key}T00:00:00Z`);
export const toKey = (date) => date.toISOString().slice(0, 10);

export function isDateKey(value) {
  if (typeof value !== 'string' || !KEY_RE.test(value)) return false;
  const date = fromKey(value);
  return !Number.isNaN(date.getTime()) && toKey(date) === value;
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}

export const diffDays = (a, b) => Math.round((fromKey(a) - fromKey(b)) / DAY_MS);
export const dayOfWeek = (key) => fromKey(key).getUTCDay();

export function addMonths(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return toKey(target);
}

export const startOfWeek = (key, weekStartsOn = 1) => addDays(key, -((dayOfWeek(key) - weekStartsOn + 7) % 7));

export const monthOf = (key) => key.slice(0, 7);
export const addMonthsToMonth = (month, n) => addMonths(`${month}-01`, n).slice(0, 7);
export const monthRange = (month) => ({ start: `${month}-01`, end: addDays(addMonths(`${month}-01`, 1), -1) });

export function rangeKeys(start, end) {
  const keys = [];
  for (let k = start; k <= end; k = addDays(k, 1)) keys.push(k);
  return keys;
}

export function nextOccurrence(key, freq, interval = 1) {
  switch (freq) {
    case 'daily':
      return addDays(key, interval);
    case 'weekly':
      return addDays(key, 7 * interval);
    case 'monthly':
      return addMonths(key, interval);
    case 'yearly':
      return addMonths(key, 12 * interval);
    default:
      return null;
  }
}

/** Server-local "today" — only used as a fallback when the client doesn't send its date. */
export function serverToday() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
