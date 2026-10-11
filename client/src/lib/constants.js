import {
  Activity, BarChart3, Bell, BookHeart, CalendarDays, CheckSquare, ClipboardCheck, FileText, Flame, FolderKanban, LayoutDashboard,
  NotebookPen, Repeat, Settings, Sparkles, Target, Timer, Wallet,
} from 'lucide-react';

const PAGES = {
  dashboard: { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, shortcut: 'G D' },
  tasks: { to: '/tasks', label: 'Tasks', icon: CheckSquare, shortcut: 'G T' },
  focus: { to: '/focus', label: 'Focus', icon: Timer, shortcut: 'G F' },
  calendar: { to: '/calendar', label: 'Calendar', icon: CalendarDays, shortcut: 'G C' },
  reminders: { to: '/reminders', label: 'Reminders', icon: Bell },
  habits: { to: '/habits', label: 'Habits', icon: Flame, shortcut: 'G H' },
  routines: { to: '/routines', label: 'Routines', icon: Repeat },
  health: { to: '/health', label: 'Health', icon: Activity },
  goals: { to: '/goals', label: 'Goals', icon: Target },
  projects: { to: '/projects', label: 'Projects', icon: FolderKanban },
  notes: { to: '/notes', label: 'Notes', icon: NotebookPen, shortcut: 'G N' },
  journal: { to: '/journal', label: 'Journal', icon: BookHeart, shortcut: 'G J' },
  documents: { to: '/documents', label: 'Documents', icon: FileText },
  finance: { to: '/finance', label: 'Finance', icon: Wallet },
  review: { to: '/review', label: 'Weekly review', icon: ClipboardCheck },
  analytics: { to: '/analytics', label: 'Analytics', icon: BarChart3 },
};

/**
 * Sidebar destinations. An item with `tabs` is a group of related pages: the sidebar shows one
 * link for it, and the pages inside are switched with tabs at the top of the screen.
 */
export const NAV_ITEMS = [
  PAGES.dashboard,
  { ...PAGES.tasks, tabs: [PAGES.tasks, PAGES.focus] },
  { ...PAGES.calendar, tabs: [PAGES.calendar, PAGES.reminders] },
  { ...PAGES.habits, tabs: [PAGES.habits, PAGES.routines, PAGES.health] },
  { ...PAGES.goals, tabs: [PAGES.goals, PAGES.projects] },
  { ...PAGES.notes, tabs: [PAGES.notes, PAGES.journal, PAGES.documents] },
  PAGES.finance,
  { ...PAGES.review, label: 'Review', tabs: [PAGES.review, PAGES.analytics] },
];
export const ASSISTANT_NAV = { to: '/ai', label: 'Assistant', icon: Sparkles, shortcut: 'G A' };

export const isNavActive = (item, pathname) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`));
export const navGroupFor = (pathname) => NAV_ITEMS.find((item) => (item.tabs ?? [item]).some((page) => isNavActive(page, pathname)));

export const PROJECT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export const DOCUMENT_CATEGORIES = [
  { value: 'identity', label: 'Identity', emoji: '🪪' },
  { value: 'education', label: 'Education', emoji: '🎓' },
  { value: 'finance', label: 'Finance', emoji: '🏦' },
  { value: 'insurance', label: 'Insurance', emoji: '🛡️' },
  { value: 'health', label: 'Health', emoji: '🩺' },
  { value: 'legal', label: 'Legal', emoji: '⚖️' },
  { value: 'travel', label: 'Travel', emoji: '✈️' },
  { value: 'work', label: 'Work', emoji: '💼' },
  { value: 'property', label: 'Property', emoji: '🏠' },
  { value: 'vehicle', label: 'Vehicle', emoji: '🚗' },
  { value: 'bills', label: 'Bills', emoji: '🧾' },
  { value: 'other', label: 'Other', emoji: '📄' },
];
export const DOCUMENT_META = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.value, c]));
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
export const DOCUMENT_MAX_MB = 25;

export const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit card', liability: true },
  { value: 'savings', label: 'Savings' },
  { value: 'investment', label: 'Investment' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'loan', label: 'Loan', liability: true },
];
export const ACCOUNT_META = Object.fromEntries(ACCOUNT_TYPES.map((a) => [a.value, a]));
export const BILLING_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

export const AI_SCOPES = [
  { value: 'tasks', label: 'Tasks' },
  { value: 'projects', label: 'Projects' },
  { value: 'calendar', label: 'Calendar & reminders' },
  { value: 'goals', label: 'Goals' },
  { value: 'habits', label: 'Habits' },
  { value: 'routines', label: 'Routines' },
  { value: 'health', label: 'Health' },
  { value: 'finance', label: 'Finance' },
  { value: 'notes', label: 'Notes' },
  { value: 'journal', label: 'Journal' },
  { value: 'documents', label: 'Documents' },
  { value: 'focus', label: 'Focus sessions' },
];

export const NOTIFICATION_PREFS = [
  { value: 'tasks', label: 'Tasks', description: 'Overdue and due-today reminders' },
  { value: 'goals', label: 'Goals', description: 'Approaching and missed deadlines' },
  { value: 'habits', label: 'Habits', description: 'Streaks at risk' },
  { value: 'routines', label: 'Routines', description: 'Unfinished routines' },
  { value: 'calendar', label: 'Calendar & reminders', description: 'Upcoming reminders and events' },
  { value: 'documents', label: 'Documents', description: 'Expiring documents' },
  { value: 'finance', label: 'Finance', description: 'Budgets exceeded, bills and renewals' },
  { value: 'ai', label: 'AI insights', description: 'Insights generated by the assistant' },
  { value: 'dailyBrief', label: 'Daily brief', description: 'AI narrative on the dashboard' },
];

// Shown instead of a narrative when the AI's draft couldn't be grounded in the real, computed
// numbers (see server narrativeWithheld) — the assistant declines rather than inventing statistics.
export const AI_WITHHELD_REASON = {
  ungrounded: "Held back — the draft didn't match your actual numbers.",
  refused: 'The assistant declined to write this narrative.',
  empty: "The assistant didn't return a narrative this time.",
  error: 'The AI narrative is temporarily unavailable.',
};

export const ENTITY_LABELS = {
  task: 'Task', project: 'Project', goal: 'Goal', event: 'Event', reminder: 'Reminder', habit: 'Habit', routine: 'Routine', health: 'Health log',
  workout: 'Workout', note: 'Note', journal: 'Journal', document: 'Document', transaction: 'Transaction', budget: 'Budget',
  subscription: 'Subscription', savings_goal: 'Savings goal', focus: 'Focus session',
};

export const SETTINGS_NAV = { to: '/settings', label: 'Settings', icon: Settings };
/** Every page, flat — for the command palette and the top-bar title. */
export const ALL_NAV_ITEMS = [...Object.values(PAGES), ASSISTANT_NAV, SETTINGS_NAV];

export const COLORS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink'];
export const ACCENTS = ['indigo', 'blue', 'teal', 'green', 'orange', 'rose', 'violet'];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'SGD'];
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const PRIORITIES = [
  { value: 'urgent', label: 'Urgent', tone: 'danger' },
  { value: 'high', label: 'High', tone: 'warning' },
  { value: 'medium', label: 'Medium', tone: 'info' },
  { value: 'low', label: 'Low', tone: 'neutral' },
];
export const PRIORITY_META = Object.fromEntries(PRIORITIES.map((p) => [p.value, p]));

export const TASK_STATUSES = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: "Doesn't repeat" },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export const GOAL_CATEGORIES = [
  { value: 'personal', label: 'Personal' },
  { value: 'career', label: 'Career' },
  { value: 'health', label: 'Health' },
  { value: 'finance', label: 'Finance' },
  { value: 'learning', label: 'Learning' },
  { value: 'relationships', label: 'Relationships' },
  { value: 'other', label: 'Other' },
];

export const GOAL_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export const REMINDER_CATEGORIES = [
  { value: 'birthday', label: 'Birthday', emoji: '🎂' },
  { value: 'renewal', label: 'Renewal', emoji: '🔁' },
  { value: 'deadline', label: 'Deadline', emoji: '⏳' },
  { value: 'bill', label: 'Bill', emoji: '💳' },
  { value: 'appointment', label: 'Appointment', emoji: '📍' },
  { value: 'other', label: 'Other', emoji: '📌' },
];
export const REMINDER_META = Object.fromEntries(REMINDER_CATEGORIES.map((c) => [c.value, c]));

export const REMINDER_RECURRENCE = RECURRENCE_OPTIONS.filter((o) => o.value !== 'daily');

export const EXPENSE_CATEGORIES = [
  'Housing', 'Groceries', 'Dining', 'Transport', 'Utilities', 'Subscriptions', 'Shopping', 'Health', 'Entertainment',
  'Travel', 'Education', 'Gifts', 'Other',
];
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investments', 'Gifts', 'Refunds', 'Other'];

export const WORKOUT_TYPES = [
  { value: 'run', label: 'Run', emoji: '🏃' },
  { value: 'walk', label: 'Walk', emoji: '🚶' },
  { value: 'strength', label: 'Strength', emoji: '🏋️' },
  { value: 'cycling', label: 'Cycling', emoji: '🚴' },
  { value: 'yoga', label: 'Yoga', emoji: '🧘' },
  { value: 'swim', label: 'Swim', emoji: '🏊' },
  { value: 'hiit', label: 'HIIT', emoji: '⚡' },
  { value: 'sport', label: 'Sport', emoji: '⚽' },
  { value: 'other', label: 'Other', emoji: '✨' },
];
export const WORKOUT_META = Object.fromEntries(WORKOUT_TYPES.map((w) => [w.value, w]));
export const INTENSITIES = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
];

export const ROUTINE_TYPES = [
  { value: 'morning', label: 'Morning' },
  { value: 'evening', label: 'Evening' },
  { value: 'custom', label: 'Custom' },
];

export const HABIT_ICONS = ['✨', '🧘', '📚', '🏃', '💧', '📵', '🎸', '🥗', '😴', '✍️', '🧠', '💪', '🌱', '🙏', '🎨', '💻', '🚭', '☀️'];

// `default: true` widgets are the ones a new account starts with (keep in sync with
// DASHBOARD_DEFAULT_WIDGETS on the server); the rest are one switch away in Customize.
export const DASHBOARD_WIDGETS = {
  brief: { label: 'Daily brief', description: 'Your day at a glance, with AI narrative when configured', section: 'today', default: true },
  focus: { label: 'Focus', description: 'Overdue, today and priority tasks', section: 'today', default: true },
  schedule: { label: "Today's schedule", description: 'Events happening today', section: 'today', default: true },
  habits: { label: 'Habits', description: "Today's habit check-ins", section: 'today', default: true },
  routines: { label: 'Routines', description: "Today's routine progress", section: 'today' },
  upcoming: { label: 'Upcoming', description: 'Events and tasks in the next 7 days', section: 'upcoming' },
  reminders: { label: 'Reminders', description: 'Important dates, bills and renewals', section: 'upcoming' },
  goals: { label: 'Goals', description: 'Progress on active goals', section: 'progress', default: true },
  finance: { label: 'Finance', description: "This month's cash flow and budgets", section: 'progress' },
  health: { label: 'Wellness', description: 'Water, sleep, mood and workouts', section: 'progress' },
  productivity: { label: 'This week', description: 'Tasks completed and habit consistency', section: 'progress' },
  documents: { label: 'Document alerts', description: 'Documents expiring soon', section: 'upcoming' },
  focusTime: { label: 'Focus time', description: 'Deep-work minutes this week', section: 'progress' },
};

export const DASHBOARD_SECTIONS = [
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'progress', label: 'Progress' },
];
