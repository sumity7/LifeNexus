import { activityScope } from './scopes.js';

/**
 * Facts handed to the model for narratives are filtered by AI permissions.
 * The application still shows all computed numbers to the user; only what the
 * model receives is restricted.
 */
const SUGGESTION_SCOPE = { focus: 'tasks', goal: 'goals', routine: 'routines', habit: 'habits', document: 'documents', project: 'projects' };

export function briefFactsForAI(summary, scopes) {
  const allow = new Set(scopes);
  const facts = { date: summary.date };
  if (allow.has('tasks')) facts.tasks = summary.tasks;
  if (allow.has('calendar')) {
    facts.events = summary.events;
    facts.reminders = summary.reminders;
  }
  if (allow.has('habits')) facts.habits = summary.habits;
  if (allow.has('routines')) facts.routines = summary.routines;
  if (allow.has('goals')) facts.goals = summary.goals;
  if (allow.has('projects')) facts.projects = summary.projects;
  if (allow.has('documents')) facts.documents = summary.documents;
  if (allow.has('finance')) facts.finance = summary.finance;
  if (allow.has('focus')) facts.focus = summary.focus;
  if (allow.has('health')) facts.health = summary.health;
  facts.suggestions = summary.suggestions.filter((s) => allow.has(SUGGESTION_SCOPE[s.kind])).map((s) => s.title);
  return facts;
}

const REVIEW_SCOPE = { tasks: 'tasks', projects: 'projects', goals: 'goals', habits: 'habits', routines: 'routines', health: 'health', focus: 'focus', finance: 'finance', journal: 'journal' };

function pick(metrics, allow) {
  const out = {};
  for (const [key, scope] of Object.entries(REVIEW_SCOPE)) if (metrics[key] !== undefined && allow.has(scope)) out[key] = metrics[key];
  return out;
}

export function reviewFactsForAI(data, scopes) {
  const allow = new Set(scopes);
  return {
    range: data.range,
    thisWeek: pick(data.metrics, allow),
    previousWeek: pick(data.metrics.previous ?? {}, allow),
    highlights: data.activity.filter((a) => allow.has(activityScope(a))).slice(0, 12).map((a) => `${a.type.replace(/_/g, ' ')}: ${a.title}`),
  };
}

/** Numbers in the narrative that don't appear in the facts (small counts ≤ 10 are always allowed). */
export function findUngroundedNumbers(text, factsJson) {
  const found = String(text).match(/(?<![\w.])\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(found)].filter((n) => {
    if (Number(n) <= 10 && !n.includes('.')) return false;
    const escaped = n.replace('.', '\\.');
    return !new RegExp(`(?<![\\d.])${escaped}(?![\\d])`).test(factsJson);
  });
}
