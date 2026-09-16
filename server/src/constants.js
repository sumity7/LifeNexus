export const COLORS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink'];
export const ACCENTS = ['indigo', 'blue', 'teal', 'green', 'orange', 'rose', 'violet'];
export const THEMES = ['light', 'dark', 'system'];
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'SGD'];

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const TASK_STATUSES = ['todo', 'in_progress', 'done'];
export const RECURRENCE = ['none', 'daily', 'weekly', 'monthly', 'yearly'];
export const REMINDER_RECURRENCE = ['none', 'weekly', 'monthly', 'yearly'];

export const HABIT_FREQUENCIES = ['daily', 'weekly'];

export const GOAL_CATEGORIES = ['personal', 'career', 'health', 'finance', 'learning', 'relationships', 'other'];
export const GOAL_STATUSES = ['active', 'paused', 'completed', 'archived'];

export const REMINDER_CATEGORIES = ['birthday', 'renewal', 'deadline', 'bill', 'appointment', 'other'];

export const TRANSACTION_TYPES = ['income', 'expense'];

export const WORKOUT_TYPES = ['run', 'walk', 'strength', 'cycling', 'yoga', 'swim', 'hiit', 'sport', 'other'];
export const INTENSITIES = ['low', 'moderate', 'high'];

export const ROUTINE_TYPES = ['morning', 'evening', 'custom'];

export const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived'];

export const DOCUMENT_CATEGORIES = [
  'identity', 'education', 'finance', 'insurance', 'health', 'legal', 'travel', 'work', 'property', 'vehicle', 'bills', 'other',
];
export const DOCUMENT_MIME_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

export const ACCOUNT_TYPES = ['bank', 'cash', 'credit_card', 'savings', 'investment', 'wallet', 'loan'];
export const LIABILITY_ACCOUNT_TYPES = ['credit_card', 'loan'];
export const BILLING_FREQUENCIES = ['weekly', 'monthly', 'quarterly', 'yearly'];

export const FOCUS_MODES = ['pomodoro', 'custom'];
export const FOCUS_STATUSES = ['running', 'paused', 'completed', 'abandoned'];

/** Entity types that can participate in cross-module links, search and AI context. */
export const ENTITY_TYPES = [
  'task', 'project', 'goal', 'event', 'reminder', 'habit', 'routine', 'health', 'workout', 'note', 'journal', 'document',
  'transaction', 'budget', 'subscription', 'savings_goal', 'focus',
];

export const ACTIVITY_TYPES = [
  'task_created', 'task_completed', 'task_updated', 'project_created', 'project_completed', 'goal_created', 'goal_updated',
  'goal_completed', 'milestone_completed', 'habit_completed', 'routine_completed', 'health_entry_created', 'workout_logged',
  'note_created', 'journal_created', 'document_uploaded', 'document_expiring', 'transaction_created', 'budget_updated',
  'focus_session_completed', 'event_created', 'reminder_created', 'reminder_completed', 'ai_action_executed', 'ai_action_rejected',
];

export const NOTIFICATION_TYPES = ['task', 'goal', 'habit', 'routine', 'calendar', 'document', 'finance', 'ai', 'system'];
export const NOTIFICATION_PREFS = ['tasks', 'goals', 'habits', 'routines', 'calendar', 'documents', 'finance', 'ai', 'dailyBrief'];

export const AI_SCOPES = ['tasks', 'projects', 'calendar', 'goals', 'habits', 'routines', 'health', 'journal', 'finance', 'notes', 'documents', 'focus'];
export const AI_MODES = ['ask', 'analyze', 'recommend', 'create', 'act'];
export const AI_ACTION_TYPES = [
  'create_task', 'update_task', 'complete_task', 'create_goal', 'update_goal', 'create_project', 'update_project', 'create_event',
  'update_event', 'create_reminder', 'update_reminder', 'create_note', 'create_journal', 'create_focus_session', 'create_habit',
];

export const DASHBOARD_WIDGETS = [
  'brief',
  'focus',
  'schedule',
  'habits',
  'routines',
  'upcoming',
  'reminders',
  'goals',
  'finance',
  'health',
  'productivity',
  'documents',
  'focusTime',
];
