import { addDays, dayOfWeek, isDateKey, serverToday } from '../utils/dates.js';

/**
 * Deterministic Quick Capture parser. It extracts dates, times, amounts and an
 * entity type from short natural-language input using explicit rules — no
 * model involved, so results are predictable and never invented. When an AI
 * provider is configured the client can ask for an AI refinement separately.
 */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pad = (n) => String(n).padStart(2, '0');

const CURRENCY_SYMBOLS = { '₹': 'INR', $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };

function parseTime(text) {
  const m = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? text.match(/\b(?:at\s+)(\d{1,2})(?::(\d{2}))\b/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const meridiem = m[3]?.toLowerCase();
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { value: `${pad(hour)}:${pad(minute)}`, match: m[0] };
}

function parseDate(text, today) {
  const lower = text.toLowerCase();
  let m;
  if ((m = lower.match(/\b(today|tonight)\b/))) return { value: today, match: m[0] };
  if ((m = lower.match(/\btomorrow\b/))) return { value: addDays(today, 1), match: m[0] };
  if ((m = lower.match(/\byesterday\b/))) return { value: addDays(today, -1), match: m[0] };
  if ((m = lower.match(/\b(?:in\s+)(\d{1,3})\s+(day|week|month)s?\b/))) {
    const n = Number(m[1]);
    const days = m[2] === 'day' ? n : m[2] === 'week' ? n * 7 : n * 30;
    return { value: addDays(today, days), match: m[0] };
  }
  if ((m = lower.match(/\b(?:next\s+|this\s+|on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/))) {
    const idx = WEEKDAYS.findIndex((d) => d.startsWith(m[1].slice(0, 3)));
    let delta = (idx - dayOfWeek(today) + 7) % 7;
    if (delta === 0 || m[0].startsWith('next')) delta += delta === 0 ? 7 : 0;
    return { value: addDays(today, delta), match: m[0] };
  }
  if ((m = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)) && isDateKey(m[0])) return { value: m[0], match: m[0] };
  // "11 August 2032", "August 11, 2032", "11 Aug", "Aug 11"
  const monthRx = MONTHS.map((mo) => mo.slice(0, 3)).join('|');
  if ((m = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthRx})[a-z]*(?:,?\\s+(\\d{4}))?\\b`)))) {
    return buildDate(m[3], m[2], m[1], today, m[0]);
  }
  if ((m = lower.match(new RegExp(`\\b(${monthRx})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`)))) {
    return buildDate(m[3], m[1], m[2], today, m[0]);
  }
  if ((m = lower.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) {
    // Day-first when unambiguous (>12), else month-first.
    const a = Number(m[1]);
    const b = Number(m[2]);
    const [day, month] = a > 12 ? [a, b] : [b, a];
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : Number(today.slice(0, 4));
    const key = `${year}-${pad(month)}-${pad(day)}`;
    if (isDateKey(key)) return { value: key < today && !m[3] ? `${year + 1}-${pad(month)}-${pad(day)}` : key, match: m[0] };
  }
  return null;
}

function buildDate(yearText, monthText, dayText, today, match) {
  const month = MONTHS.findIndex((mo) => mo.startsWith(monthText.slice(0, 3))) + 1;
  const day = Number(dayText);
  let year = yearText ? Number(yearText) : Number(today.slice(0, 4));
  let key = `${year}-${pad(month)}-${pad(day)}`;
  if (!isDateKey(key)) return null;
  if (!yearText && key < today) {
    year += 1;
    key = `${year}-${pad(month)}-${pad(day)}`;
  }
  return { value: key, match };
}

function parseAmount(text) {
  const m =
    text.match(/([₹$€£¥])\s?(\d[\d,]*(?:\.\d{1,2})?)/) ??
    text.match(/(\d[\d,]*(?:\.\d{1,2})?)\s?(rs\.?|inr|usd|eur|gbp|dollars?|rupees?|bucks)\b/i);
  if (!m) return null;
  const symbol = m[1] && CURRENCY_SYMBOLS[m[1]] ? m[1] : null;
  const raw = symbol ? m[2] : m[1];
  const value = Number(raw.replace(/,/g, ''));
  if (!(value > 0)) return null;
  return { value, currency: symbol ? CURRENCY_SYMBOLS[symbol] : null, match: m[0] };
}

const TYPE_HINTS = [
  { type: 'transaction', rx: /\b(spent|paid|bought|purchase[d]?|expense|cost|income|received|salary|earned)\b/i },
  { type: 'event', rx: /\b(meeting|meet|call|appointment|lunch|dinner|coffee|interview|session with|catch ?up|sync)\b/i },
  { type: 'reminder', rx: /\b(remind|reminder|renew|renewal|expires?|expiry|due date|birthday|anniversary|bill)\b/i },
  { type: 'journal', rx: /\b(journal|today i felt|grateful|reflection|dear diary)\b/i },
  { type: 'goal', rx: /\b(goal:|i want to|aim to|by the end of)\b/i },
  { type: 'note', rx: /^(note:|idea:|remember that)/i },
  { type: 'habit', rx: /\b(every day|daily habit|habit:)\b/i },
];

const clean = (text, matches) => {
  let out = text;
  for (const m of matches.filter(Boolean)) out = out.replace(m, ' ');
  return out
    .replace(/\b(at|on|by|for|of|the)\s*$/i, '')
    .replace(/^\s*(spent|paid|bought|remind me to|remind me|reminder:|note:|idea:|task:|todo:)\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,:-]+|[\s,:-]+$/g, '')
    .trim();
};

export function parseCapture(text, today = serverToday()) {
  const date = parseDate(text, today);
  const time = parseTime(text);
  const amount = parseAmount(text);
  const hint = TYPE_HINTS.find((h) => h.rx.test(text))?.type;

  let type = hint ?? (amount ? 'transaction' : time ? 'event' : 'task');
  if (type === 'reminder' && /\bexpires?\b/i.test(text)) type = 'reminder';

  const title = clean(text, [date?.match, time?.match, amount?.match]) || text.trim();
  const categoryGuess = amount ? guessCategory(text) : null;

  const fields = {
    task: { title, dueDate: date?.value ?? null, dueTime: time?.value ?? null },
    event: { title, date: date?.value ?? today, time: time?.value ?? null, durationMin: 60 },
    reminder: { title, date: date?.value ?? addDays(today, 7), time: time?.value ?? null, category: /\bexpires?|renew/i.test(text) ? 'renewal' : /\bbirthday\b/i.test(text) ? 'birthday' : /\bbill\b/i.test(text) ? 'bill' : 'other' },
    transaction: { type: /\b(income|received|salary|earned)\b/i.test(text) ? 'income' : 'expense', amount: amount?.value ?? null, currency: amount?.currency ?? null, category: categoryGuess, description: title, date: date?.value ?? today },
    note: { title, content: text },
    journal: { date: date?.value ?? today, content: text },
    goal: { title },
    habit: { name: title },
    document: { title },
  };

  return {
    type,
    title,
    date: date?.value ?? null,
    time: time?.value ?? null,
    amount: amount?.value ?? null,
    fields,
    // Confidence is heuristic: high when both a type hint and a matching structured token were found.
    confidence: hint && (date || amount || time) ? 'high' : hint || date || amount ? 'medium' : 'low',
    parser: 'rules',
  };
}

function guessCategory(text) {
  const t = text.toLowerCase();
  const table = [
    ['Groceries', /grocer|vegetable|fruit|supermarket|market/],
    ['Dining', /lunch|dinner|breakfast|restaurant|coffee|cafe|pizza|burger|food|swiggy|zomato/],
    ['Transport', /uber|ola|taxi|cab|metro|bus|train|fuel|petrol|diesel|gas|parking/],
    ['Shopping', /amazon|flipkart|clothes|shoes|shopping|store/],
    ['Utilities', /electricity|water bill|internet|wifi|broadband|phone bill|recharge/],
    ['Health', /doctor|pharmacy|medicine|gym|hospital|dentist/],
    ['Entertainment', /movie|cinema|netflix|spotify|concert|game/],
    ['Travel', /flight|hotel|trip|train ticket|airbnb/],
    ['Housing', /rent|maintenance|emi/],
    ['Salary', /salary|payroll/],
  ];
  return table.find(([, rx]) => rx.test(t))?.[0] ?? 'Other';
}
