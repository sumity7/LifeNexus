import { format } from 'date-fns';
import { Bell, BookHeart, CalendarDays, CheckSquare, FileText, Flame, FolderKanban, HeartPulse, NotebookPen, Repeat, Target, Timer, Wallet } from 'lucide-react';
import { formatCurrency, formatDuration } from '../../lib/format';
import { relativeDay, toKey } from '../../lib/dates';
import { DOCUMENT_META } from '../../lib/constants';

export const SEARCH_TYPE_OPTIONS = [
  { value: 'tasks', label: 'Tasks' }, { value: 'notes', label: 'Notes' }, { value: 'goals', label: 'Goals' }, { value: 'projects', label: 'Projects' },
  { value: 'events', label: 'Calendar' }, { value: 'reminders', label: 'Reminders' }, { value: 'habits', label: 'Habits' }, { value: 'routines', label: 'Routines' },
  { value: 'journal', label: 'Journal' }, { value: 'documents', label: 'Documents' }, { value: 'transactions', label: 'Finance' }, { value: 'focus', label: 'Focus' },
  { value: 'health', label: 'Health' },
];

/** Normalises global search results into navigable items shared by the palette, search page and link picker. */
export function buildSearchGroups(results, currency = 'USD') {
  if (!results) return [];
  const r = (key) => results[key] ?? [];
  return [
    {
      id: 'tasks', label: 'Tasks', icon: CheckSquare,
      items: r('tasks').map((t) => ({ id: `task-${t._id}`, label: t.title, sub: [t.status === 'done' ? 'Completed' : 'Open', t.dueDate && `Due ${relativeDay(t.dueDate)}`].filter(Boolean).join(' · '), to: `/tasks?task=${t._id}` })),
    },
    {
      id: 'projects', label: 'Projects', icon: FolderKanban,
      items: r('projects').map((p) => ({ id: `project-${p._id}`, label: p.title, sub: p.dueDate ? `Due ${relativeDay(p.dueDate)}` : p.status, to: `/projects/${p._id}` })),
    },
    {
      id: 'notes', label: 'Notes', icon: NotebookPen,
      items: r('notes').map((n) => ({ id: `note-${n._id}`, label: n.title || 'Untitled note', sub: n.excerpt, to: `/notes?note=${n._id}` })),
    },
    {
      id: 'documents', label: 'Documents', icon: FileText,
      items: r('documents').map((d) => ({ id: `document-${d._id}`, label: d.title, sub: [DOCUMENT_META[d.category]?.label, d.expiryDate && `Expires ${relativeDay(d.expiryDate)}`, d.archived && 'Archived'].filter(Boolean).join(' · '), to: `/documents?doc=${d._id}` })),
    },
    {
      id: 'goals', label: 'Goals', icon: Target,
      items: r('goals').map((g) => ({ id: `goal-${g._id}`, label: g.title, sub: g.deadline ? `Deadline ${relativeDay(g.deadline)}` : g.status, to: `/goals/${g._id}` })),
    },
    {
      id: 'events', label: 'Calendar', icon: CalendarDays,
      items: r('events').map((e) => {
        const start = new Date(e.start);
        return { id: `event-${e._id}`, label: e.title, sub: [format(start, e.allDay ? 'EEE, MMM d' : 'EEE, MMM d · p'), e.location].filter(Boolean).join(' · '), to: `/calendar?date=${toKey(start)}&view=day` };
      }),
    },
    {
      id: 'reminders', label: 'Reminders', icon: Bell,
      items: r('reminders').map((x) => ({ id: `reminder-${x._id}`, label: x.title, sub: `${relativeDay(x.date)}${x.completed ? ' · Done' : ''}`, to: '/reminders' })),
    },
    {
      id: 'journal', label: 'Journal', icon: BookHeart,
      items: r('journal').map((j) => ({ id: `journal-${j._id}`, label: j.title || `Journal · ${relativeDay(j.date)}`, sub: j.excerpt, to: `/journal?date=${j.date}` })),
    },
    {
      id: 'habits', label: 'Habits', icon: Flame,
      items: r('habits').map((h) => ({ id: `habit-${h._id}`, label: `${h.icon} ${h.name}`, sub: h.archived ? 'Archived' : 'Habit', to: `/habits?habit=${h._id}` })),
    },
    {
      id: 'routines', label: 'Routines', icon: Repeat,
      items: r('routines').map((x) => ({ id: `routine-${x._id}`, label: x.name, sub: x.active ? `${x.type} routine` : 'Paused', to: '/routines' })),
    },
    {
      id: 'transactions', label: 'Finance', icon: Wallet,
      items: r('transactions').map((t) => ({ id: `transaction-${t._id}`, label: t.description || t.category, sub: `${t.type === 'income' ? '+' : '−'}${formatCurrency(t.amount, currency)} · ${t.category} · ${relativeDay(t.date)}`, to: `/finance?month=${t.date.slice(0, 7)}` })),
    },
    {
      id: 'focus', label: 'Focus sessions', icon: Timer,
      items: r('focus').map((f) => ({ id: `focus-${f._id}`, label: f.label || 'Focus session', sub: `${formatDuration(Math.round(f.focusedSeconds / 60))} · ${relativeDay(f.date)}`, to: '/focus' })),
    },
    {
      id: 'health', label: 'Health', icon: HeartPulse,
      items: r('health').map((h) => ({ id: `health-${h._id}`, label: `Health log · ${relativeDay(h.date)}`, sub: h.notes, to: `/health?date=${h.date}` })),
    },
  ].filter((g) => g.items.length);
}
