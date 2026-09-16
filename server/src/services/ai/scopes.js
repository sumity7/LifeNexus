import { AI_SCOPES } from '../../constants.js';

export const SCOPE_LABELS = {
  tasks: 'Tasks', projects: 'Projects', calendar: 'Calendar', goals: 'Goals', habits: 'Habits', routines: 'Routines', health: 'Health',
  journal: 'Journal', finance: 'Finance', notes: 'Notes', documents: 'Documents', focus: 'Focus sessions',
};

/** Which AI permission governs each entity type. */
export const ENTITY_SCOPE = {
  task: 'tasks', project: 'projects', goal: 'goals', event: 'calendar', reminder: 'calendar', habit: 'habits', routine: 'routines',
  health: 'health', workout: 'health', note: 'notes', journal: 'journal', document: 'documents', transaction: 'finance',
  budget: 'finance', subscription: 'finance', savings_goal: 'finance', focus: 'focus',
};

/** Which permission governs each activity entry. */
export const ACTIVITY_SCOPE = {
  task_created: 'tasks', task_completed: 'tasks', task_updated: 'tasks',
  project_created: 'projects', project_completed: 'projects',
  goal_created: 'goals', goal_updated: 'goals', goal_completed: 'goals', milestone_completed: 'goals',
  habit_completed: 'habits', routine_completed: 'routines',
  health_entry_created: 'health', workout_logged: 'health',
  note_created: 'notes', journal_created: 'journal',
  document_uploaded: 'documents', document_expiring: 'documents',
  transaction_created: 'finance', budget_updated: 'finance',
  focus_session_completed: 'focus', event_created: 'calendar', reminder_created: 'calendar', reminder_completed: 'calendar',
};

export const activityScope = (entry) => ACTIVITY_SCOPE[entry.type] ?? ENTITY_SCOPE[entry.entityType] ?? null;

/** Which permission each AI action needs. */
export const ACTION_SCOPE = {
  create_task: 'tasks', update_task: 'tasks', complete_task: 'tasks', create_goal: 'goals', update_goal: 'goals',
  create_project: 'projects', update_project: 'projects', create_event: 'calendar', update_event: 'calendar',
  create_reminder: 'calendar', update_reminder: 'calendar', create_note: 'notes', create_journal: 'journal',
  create_focus_session: 'focus', create_habit: 'habits',
};

export const allowedScopes = (preferences) => AI_SCOPES.filter((s) => preferences?.ai?.scopes?.[s] !== false);
export const scopeList = (scopes) => scopes.map((s) => SCOPE_LABELS[s] ?? s).join(', ');
