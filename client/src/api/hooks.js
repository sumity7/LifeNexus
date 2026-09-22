import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, request, uploadForm } from './client';
import { todayKey } from '../lib/dates';

// Aggregated views that depend on data from every module.
const CROSS_MODULE = [['dashboard'], ['analytics'], ['search']];

/**
 * A mutation that refreshes the affected queries before resolving, so the UI
 * shows fresh data by the time a modal closes or a toast appears.
 */
function useApiMutation(mutationFn, { invalidate = [], onSuccess, ...options } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    ...options,
    onSuccess: async (data, variables, context) => {
      await onSuccess?.(data, variables, context, queryClient);
      await Promise.all(
        [...invalidate, ...CROSS_MODULE].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}

/* ───────── Dashboard / analytics / search ───────── */

export const useDashboard = () => {
  const date = todayKey();
  return useQuery({ queryKey: ['dashboard', date], queryFn: ({ signal }) => api.get('/dashboard', { date }, { signal }) });
};

export const useAnalytics = (days) => {
  const date = todayKey();
  return useQuery({
    queryKey: ['analytics', days, date],
    queryFn: ({ signal }) => api.get('/analytics', { date, days }, { signal }),
    placeholderData: keepPreviousData,
  });
};

export const useSearch = (q) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => api.get('/search', { q }, { signal }),
    enabled: q.trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

export const useSearchAdvanced = (params) =>
  useQuery({
    queryKey: ['search', 'advanced', params],
    queryFn: ({ signal }) => api.get('/search', params, { signal }),
    enabled: (params.q ?? '').trim().length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });

/* ───────── Tasks ───────── */

export const useTasks = (params = {}, options = {}) =>
  useQuery({
    queryKey: ['tasks', params],
    queryFn: ({ signal }) => api.get('/tasks', { date: todayKey(), ...params }, { signal }),
    placeholderData: keepPreviousData,
    ...options,
  });

const TASK_KEYS = [['tasks'], ['goals'], ['projects']];
export const useCreateTask = () => useApiMutation((body) => api.post('/tasks', { date: todayKey(), ...body }), { invalidate: TASK_KEYS });
export const useUpdateTask = () =>
  useApiMutation(({ id, ...body }) => api.patch(`/tasks/${id}`, { date: todayKey(), ...body }), { invalidate: TASK_KEYS });
export const useToggleTask = () =>
  useApiMutation(({ id }) => request(`/tasks/${id}/toggle`, { method: 'POST', body: { date: todayKey() } }), { invalidate: TASK_KEYS });
export const useDeleteTask = () => useApiMutation((id) => api.del(`/tasks/${id}`), { invalidate: TASK_KEYS });

/* ───────── Habits ───────── */

export const useHabits = ({ archived = false, days = 182 } = {}) =>
  useQuery({
    queryKey: ['habits', { archived, days }],
    queryFn: ({ signal }) => api.get('/habits', { date: todayKey(), archived, days }, { signal }),
    placeholderData: keepPreviousData,
  });

const HABIT_KEYS = [['habits']];
export const useCreateHabit = () => useApiMutation((body) => api.post('/habits', body), { invalidate: HABIT_KEYS });
export const useUpdateHabit = () => useApiMutation(({ id, ...body }) => api.patch(`/habits/${id}`, body), { invalidate: HABIT_KEYS });
export const useDeleteHabit = () => useApiMutation((id) => api.del(`/habits/${id}`), { invalidate: HABIT_KEYS });
export const useReorderHabits = () => useApiMutation((ids) => api.put('/habits/order', { ids }), { invalidate: HABIT_KEYS });
export const useToggleHabit = () =>
  useApiMutation(
    ({ id, date = todayKey() }) => request(`/habits/${id}/toggle`, { method: 'POST', body: { date, today: todayKey() } }),
    { invalidate: HABIT_KEYS },
  );

/* ───────── Goals ───────── */

export const useGoals = (status) =>
  useQuery({
    queryKey: ['goals', 'list', status ?? 'default'],
    queryFn: ({ signal }) => api.get('/goals', { status }, { signal }),
    placeholderData: keepPreviousData,
  });

export const useGoal = (id) =>
  useQuery({ queryKey: ['goals', 'detail', id], queryFn: ({ signal }) => api.get(`/goals/${id}`, undefined, { signal }), enabled: !!id });

const GOAL_KEYS = [['goals'], ['tasks']];
export const useCreateGoal = () => useApiMutation((body) => api.post('/goals', body), { invalidate: GOAL_KEYS });
export const useUpdateGoal = () => useApiMutation(({ id, ...body }) => api.patch(`/goals/${id}`, body), { invalidate: GOAL_KEYS });
export const useDeleteGoal = () => useApiMutation((id) => api.del(`/goals/${id}`), { invalidate: GOAL_KEYS });
export const useAddMilestone = () =>
  useApiMutation(({ goalId, ...body }) => api.post(`/goals/${goalId}/milestones`, body), { invalidate: GOAL_KEYS });
export const useUpdateMilestone = () =>
  useApiMutation(({ goalId, milestoneId, ...body }) => api.patch(`/goals/${goalId}/milestones/${milestoneId}`, body), { invalidate: GOAL_KEYS });
export const useDeleteMilestone = () =>
  useApiMutation(({ goalId, milestoneId }) => api.del(`/goals/${goalId}/milestones/${milestoneId}`), { invalidate: GOAL_KEYS });

/* ───────── Calendar events ───────── */

export const useEvents = (from, to, options = {}) =>
  useQuery({
    queryKey: ['events', from.toISOString(), to.toISOString()],
    queryFn: ({ signal }) => api.get('/events', { from: from.toISOString(), to: to.toISOString() }, { signal }),
    placeholderData: keepPreviousData,
    ...options,
  });

const EVENT_KEYS = [['events']];
export const useCreateEvent = () => useApiMutation((body) => api.post('/events', body), { invalidate: EVENT_KEYS });
export const useUpdateEvent = () => useApiMutation(({ id, ...body }) => api.patch(`/events/${id}`, body), { invalidate: EVENT_KEYS });
export const useDeleteEvent = () => useApiMutation((id) => api.del(`/events/${id}`), { invalidate: EVENT_KEYS });

/* ───────── Notes ───────── */

export const useNotes = (params = {}) =>
  useQuery({
    queryKey: ['notes', 'list', params],
    queryFn: ({ signal }) => api.get('/notes', params, { signal }),
    placeholderData: keepPreviousData,
  });

export const useNote = (id) =>
  useQuery({
    queryKey: ['notes', 'detail', id],
    queryFn: ({ signal }) => api.get(`/notes/${id}`, undefined, { signal }),
    enabled: !!id,
    staleTime: Infinity, // the editor owns the content once loaded
  });

export const useFolders = () =>
  useQuery({ queryKey: ['notes', 'folders'], queryFn: ({ signal }) => request('/notes/folders', { signal }) });

export const useNoteTags = () =>
  useQuery({ queryKey: ['notes', 'tags'], queryFn: ({ signal }) => api.get('/notes/tags', undefined, { signal }) });

const NOTE_META_KEYS = [['notes', 'list'], ['notes', 'folders'], ['notes', 'tags']];
const cacheNote = (note, _vars, _ctx, queryClient) => queryClient.setQueryData(['notes', 'detail', note._id], note);

export const useCreateNote = () => useApiMutation((body) => api.post('/notes', body), { invalidate: NOTE_META_KEYS, onSuccess: cacheNote });
export const useUpdateNote = () =>
  useApiMutation(({ id, ...body }) => api.patch(`/notes/${id}`, body), { invalidate: NOTE_META_KEYS, onSuccess: cacheNote });
export const useDeleteNote = () => {
  const queryClient = useQueryClient();
  return useApiMutation((id) => api.del(`/notes/${id}`), {
    invalidate: NOTE_META_KEYS,
    // Drop the cached note after the caller has navigated away, so the open editor isn't torn down mid-flight.
    onSettled: (_data, error, id) => !error && setTimeout(() => queryClient.removeQueries({ queryKey: ['notes', 'detail', id] }), 0),
  });
};
export const useCreateFolder = () => useApiMutation((body) => api.post('/notes/folders', body), { invalidate: NOTE_META_KEYS });
export const useUpdateFolder = () => useApiMutation(({ id, ...body }) => api.patch(`/notes/folders/${id}`, body), { invalidate: NOTE_META_KEYS });
export const useDeleteFolder = () => useApiMutation((id) => api.del(`/notes/folders/${id}`), { invalidate: [['notes']] });

/* ───────── Finance ───────── */

export const useFinanceSummary = (month) =>
  useQuery({
    queryKey: ['finance', 'summary', month],
    queryFn: ({ signal }) => api.get('/finance/summary', { month }, { signal }),
    placeholderData: keepPreviousData,
  });

export const useTransactions = (params) =>
  useQuery({
    queryKey: ['finance', 'transactions', params],
    queryFn: ({ signal }) => api.get('/finance/transactions', params, { signal }),
    placeholderData: keepPreviousData,
  });

const FINANCE_KEYS = [['finance']];
export const useCreateTransaction = () => useApiMutation((body) => api.post('/finance/transactions', body), { invalidate: FINANCE_KEYS });
export const useUpdateTransaction = () =>
  useApiMutation(({ id, ...body }) => api.patch(`/finance/transactions/${id}`, body), { invalidate: FINANCE_KEYS });
export const useDeleteTransaction = () => useApiMutation((id) => api.del(`/finance/transactions/${id}`), { invalidate: FINANCE_KEYS });
export const useCreateBudget = () => useApiMutation((body) => api.post('/finance/budgets', body), { invalidate: FINANCE_KEYS });
export const useUpdateBudget = () => useApiMutation(({ id, ...body }) => api.patch(`/finance/budgets/${id}`, body), { invalidate: FINANCE_KEYS });
export const useDeleteBudget = () => useApiMutation((id) => api.del(`/finance/budgets/${id}`), { invalidate: FINANCE_KEYS });

/* ───────── Health ───────── */

export const useHealthSummary = (date, days = 14) =>
  useQuery({
    queryKey: ['health', 'summary', date, days],
    queryFn: ({ signal }) => api.get('/health/summary', { date, days }, { signal }),
    placeholderData: keepPreviousData,
  });

export const useHealthLog = (date) =>
  useQuery({ queryKey: ['health', 'log', date], queryFn: ({ signal }) => api.get(`/health/logs/${date}`, undefined, { signal }) });

export const useWorkouts = (from, to) =>
  useQuery({
    queryKey: ['health', 'workouts', from, to],
    queryFn: ({ signal }) => api.get('/health/workouts', { from, to }, { signal }),
    placeholderData: keepPreviousData,
  });

const HEALTH_KEYS = [['health']];
export const useUpsertHealthLog = () => useApiMutation(({ date, ...body }) => api.put(`/health/logs/${date}`, body), { invalidate: HEALTH_KEYS });
export const useAddWater = () =>
  useApiMutation(({ date = todayKey(), deltaMl }) => api.post(`/health/logs/${date}/water`, { deltaMl }), { invalidate: HEALTH_KEYS });
export const useCreateWorkout = () => useApiMutation((body) => api.post('/health/workouts', body), { invalidate: HEALTH_KEYS });
export const useUpdateWorkout = () => useApiMutation(({ id, ...body }) => api.patch(`/health/workouts/${id}`, body), { invalidate: HEALTH_KEYS });
export const useDeleteWorkout = () => useApiMutation((id) => api.del(`/health/workouts/${id}`), { invalidate: HEALTH_KEYS });

/* ───────── Routines ───────── */

export const useRoutines = () => {
  const date = todayKey();
  return useQuery({ queryKey: ['routines', date], queryFn: ({ signal }) => api.get('/routines', { date }, { signal }) });
};

const ROUTINE_KEYS = [['routines']];
export const useCreateRoutine = () => useApiMutation((body) => api.post('/routines', body), { invalidate: ROUTINE_KEYS });
export const useUpdateRoutine = () => useApiMutation(({ id, ...body }) => api.patch(`/routines/${id}`, body), { invalidate: ROUTINE_KEYS });
export const useDeleteRoutine = () => useApiMutation((id) => api.del(`/routines/${id}`), { invalidate: ROUTINE_KEYS });
export const useToggleRoutineStep = () =>
  useApiMutation(({ id, stepId }) => api.post(`/routines/${id}/steps/${stepId}/toggle`, { date: todayKey() }), { invalidate: ROUTINE_KEYS });
export const useCompleteRoutine = () => useApiMutation((id) => api.post(`/routines/${id}/complete`, { date: todayKey() }), { invalidate: ROUTINE_KEYS });
export const useResetRoutine = () => useApiMutation((id) => api.post(`/routines/${id}/reset`, { date: todayKey() }), { invalidate: ROUTINE_KEYS });

/* ───────── Projects ───────── */

export const useProjects = (params = {}) =>
  useQuery({ queryKey: ['projects', 'list', params], queryFn: ({ signal }) => api.get('/projects', params, { signal }), placeholderData: keepPreviousData });
export const useProject = (id) =>
  useQuery({ queryKey: ['projects', 'detail', id], queryFn: ({ signal }) => api.get(`/projects/${id}`, undefined, { signal }), enabled: !!id });
const PROJECT_KEYS = [['projects'], ['goals'], ['tasks']];
export const useCreateProject = () => useApiMutation((body) => api.post('/projects', body), { invalidate: PROJECT_KEYS });
export const useUpdateProject = () => useApiMutation(({ id, ...body }) => api.patch(`/projects/${id}`, body), { invalidate: PROJECT_KEYS });
export const useDeleteProject = () => useApiMutation((id) => api.del(`/projects/${id}`), { invalidate: PROJECT_KEYS });

/* ───────── Links / activity / notifications ───────── */

export const useLinks = (type, id) =>
  useQuery({ queryKey: ['links', type, id], queryFn: ({ signal }) => api.get('/links', { type, id }, { signal }), enabled: !!type && !!id });
export const useGraph = (type, id) =>
  useQuery({ queryKey: ['graph', type, id], queryFn: ({ signal }) => api.get('/graph', { type, id }, { signal }), enabled: !!type && !!id });
export const useCreateLink = () => useApiMutation((body) => api.post('/links', body), { invalidate: [['links'], ['graph'], ['projects', 'detail'], ['goals', 'detail'], ['documents', 'detail']] });
export const useDeleteLink = () => useApiMutation((id) => api.del(`/links/${id}`), { invalidate: [['links'], ['graph'], ['projects', 'detail'], ['goals', 'detail'], ['documents', 'detail']] });

export const useActivity = (params = {}) =>
  useQuery({ queryKey: ['activity', params], queryFn: ({ signal }) => api.get('/activity', params, { signal }) });

export const useNotifications = (options = {}) =>
  useQuery({
    queryKey: ['notifications'],
    queryFn: ({ signal }) => request('/notifications', { query: { date: todayKey(), limit: 40 }, signal }),
    refetchInterval: 5 * 60_000,
    ...options,
  });
export const useMarkNotificationRead = () => useApiMutation((id) => api.post(`/notifications/${id}/read`), { invalidate: [['notifications']] });
export const useMarkAllNotificationsRead = () => useApiMutation(() => api.post('/notifications/read-all'), { invalidate: [['notifications']] });
export const useDeleteNotification = () => useApiMutation((id) => api.del(`/notifications/${id}`), { invalidate: [['notifications']] });

/* ───────── Documents ───────── */

export const useDocuments = (params = {}) =>
  useQuery({
    queryKey: ['documents', 'list', params],
    queryFn: ({ signal }) => request('/documents', { query: { date: todayKey(), ...params }, signal }),
    placeholderData: keepPreviousData,
  });
export const useDocument = (id) =>
  useQuery({ queryKey: ['documents', 'detail', id], queryFn: ({ signal }) => api.get(`/documents/${id}`, undefined, { signal }), enabled: !!id, staleTime: 4 * 60_000 });
const DOCUMENT_KEYS = [['documents'], ['reminders']];
export const useUploadDocument = () =>
  useApiMutation(
    async ({ file, ...fields }) => {
      const form = new FormData();
      form.append('file', file);
      for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) form.append(k, v);
      return uploadForm('/documents', form);
    },
    { invalidate: DOCUMENT_KEYS },
  );
export const useUpdateDocument = () => useApiMutation(({ id, ...body }) => api.patch(`/documents/${id}`, body), { invalidate: DOCUMENT_KEYS });
export const useDeleteDocument = () => useApiMutation((id) => api.del(`/documents/${id}`), { invalidate: DOCUMENT_KEYS });
export const useExtractDocument = () => useApiMutation((id) => api.post(`/documents/${id}/extract`), { invalidate: DOCUMENT_KEYS });

/* ───────── Journal ───────── */

export const useJournalEntries = (params = {}, options = {}) =>
  useQuery({ queryKey: ['journal', 'list', params], queryFn: ({ signal }) => api.get('/journal', params, { signal }), placeholderData: keepPreviousData, ...options });
export const useJournalEntry = (date) =>
  useQuery({ queryKey: ['journal', 'entry', date], queryFn: ({ signal }) => api.get(`/journal/${date}`, undefined, { signal }), enabled: !!date });
export const useJournalCalendar = (from, to) =>
  useQuery({ queryKey: ['journal', 'calendar', from, to], queryFn: ({ signal }) => api.get('/journal/calendar', { from, to }, { signal }) });
const JOURNAL_KEYS = [['journal'], ['health']];
export const useSaveJournal = () => useApiMutation(({ date, ...body }) => api.put(`/journal/${date}`, body), { invalidate: JOURNAL_KEYS });
export const useDeleteJournal = () => useApiMutation((date) => api.del(`/journal/${date}`), { invalidate: JOURNAL_KEYS });

/* ───────── Focus ───────── */

export const useActiveFocus = () =>
  useQuery({ queryKey: ['focus', 'active'], queryFn: ({ signal }) => api.get('/focus/active', undefined, { signal }), refetchInterval: 60_000 });
export const useFocusSummary = (days = 30) =>
  useQuery({ queryKey: ['focus', 'summary', days, todayKey()], queryFn: ({ signal }) => api.get('/focus/summary', { date: todayKey(), days }, { signal }) });
export const useFocusSessions = (params = {}) =>
  useQuery({ queryKey: ['focus', 'sessions', params], queryFn: ({ signal }) => api.get('/focus/sessions', params, { signal }) });
const FOCUS_KEYS = [['focus'], ['goals', 'detail'], ['projects', 'detail']];
export const useStartFocus = () => useApiMutation((body) => api.post('/focus/sessions', { date: todayKey(), ...body }), { invalidate: FOCUS_KEYS });
export const useFocusCommand = () =>
  useApiMutation(({ id, command, ...body }) => api.post(`/focus/sessions/${id}/${command}`, { date: todayKey(), ...body }), { invalidate: FOCUS_KEYS });
export const useLogFocus = () => useApiMutation((body) => api.post('/focus/sessions/log', { date: todayKey(), ...body }), { invalidate: FOCUS_KEYS });
export const useDeleteFocus = () => useApiMutation((id) => api.del(`/focus/sessions/${id}`), { invalidate: FOCUS_KEYS });

/* ───────── Finance extras ───────── */

export const useAccounts = () => useQuery({ queryKey: ['finance', 'accounts'], queryFn: ({ signal }) => request('/finance/accounts', { signal }) });
export const useRecurring = () => useQuery({ queryKey: ['finance', 'recurring'], queryFn: ({ signal }) => api.get('/finance/recurring', undefined, { signal }) });
export const useSubscriptions = () => useQuery({ queryKey: ['finance', 'subscriptions'], queryFn: ({ signal }) => request('/finance/subscriptions', { signal }) });
export const useSavingsGoals = () => useQuery({ queryKey: ['finance', 'savings'], queryFn: ({ signal }) => api.get('/finance/savings', undefined, { signal }) });
export const useCreateAccount = () => useApiMutation((body) => api.post('/finance/accounts', body), { invalidate: FINANCE_KEYS });
export const useUpdateAccount = () => useApiMutation(({ id, ...body }) => api.patch(`/finance/accounts/${id}`, body), { invalidate: FINANCE_KEYS });
export const useDeleteAccount = () => useApiMutation((id) => api.del(`/finance/accounts/${id}`), { invalidate: FINANCE_KEYS });
export const useCreateRecurring = () => useApiMutation((body) => api.post('/finance/recurring', body), { invalidate: FINANCE_KEYS });
export const useUpdateRecurring = () => useApiMutation(({ id, ...body }) => api.patch(`/finance/recurring/${id}`, body), { invalidate: FINANCE_KEYS });
export const useDeleteRecurring = () => useApiMutation((id) => api.del(`/finance/recurring/${id}`), { invalidate: FINANCE_KEYS });
export const useCreateSubscription = () => useApiMutation((body) => api.post('/finance/subscriptions', body), { invalidate: FINANCE_KEYS });
export const useUpdateSubscription = () => useApiMutation(({ id, ...body }) => api.patch(`/finance/subscriptions/${id}`, body), { invalidate: FINANCE_KEYS });
export const useDeleteSubscription = () => useApiMutation((id) => api.del(`/finance/subscriptions/${id}`), { invalidate: FINANCE_KEYS });
export const useCreateSavingsGoal = () => useApiMutation((body) => api.post('/finance/savings', body), { invalidate: FINANCE_KEYS });
export const useUpdateSavingsGoal = () => useApiMutation(({ id, ...body }) => api.patch(`/finance/savings/${id}`, body), { invalidate: FINANCE_KEYS });
export const useContributeSavings = () => useApiMutation(({ id, ...body }) => api.post(`/finance/savings/${id}/contribute`, body), { invalidate: FINANCE_KEYS });
export const useDeleteSavingsGoal = () => useApiMutation((id) => api.del(`/finance/savings/${id}`), { invalidate: FINANCE_KEYS });

/* ───────── AI ───────── */

export const useAIStatus = () => useQuery({ queryKey: ['ai', 'status'], queryFn: ({ signal }) => api.get('/ai/status', undefined, { signal }), staleTime: 5 * 60_000 });
export const useDailyBrief = (options = {}) =>
  useQuery({ queryKey: ['ai', 'brief', todayKey()], queryFn: ({ signal }) => api.get('/ai/brief', { date: todayKey() }, { signal }), staleTime: 10 * 60_000, ...options });
export const useWeeklyReview = (week) =>
  useQuery({ queryKey: ['ai', 'review', week ?? 'current'], queryFn: ({ signal }) => api.get('/ai/review', { week }, { signal }), placeholderData: keepPreviousData });
export const useRefreshInsight = () =>
  useApiMutation(({ kind, ...params }) => api.get(`/ai/${kind}`, { ...params, refresh: 'true' }), { invalidate: [['ai']] });
export const useConversations = () => useQuery({ queryKey: ['ai', 'conversations'], queryFn: ({ signal }) => api.get('/ai/conversations', undefined, { signal }) });
export const useConversation = (id) =>
  useQuery({ queryKey: ['ai', 'conversation', id], queryFn: ({ signal }) => api.get(`/ai/conversations/${id}`, undefined, { signal }), enabled: !!id });
export const useSendAIMessage = () =>
  // Deliberately does NOT invalidate ['ai', 'conversation'] (the open thread): AIPage already
  // applies the response to its own local state directly (see its submit()), so a background
  // refetch here would race that local update and re-add the same message a second time.
  useApiMutation((body) => api.post('/ai/chat', { date: todayKey(), ...body }), { invalidate: [['ai', 'conversations']] });
export const useDecideAIAction = () => useApiMutation((body) => api.post('/ai/actions', { date: todayKey(), ...body }), { invalidate: [['ai', 'conversation']] });
export const useExecuteProposal = () => useApiMutation((body) => api.post('/ai/proposals/execute', body));
export const useDeleteConversation = () => useApiMutation((id) => api.del(`/ai/conversations/${id}`), { invalidate: [['ai', 'conversations']] });
export const useRenameConversation = () => useApiMutation(({ id, title }) => api.patch(`/ai/conversations/${id}`, { title }), { invalidate: [['ai', 'conversations']] });
export const useNoteAI = () => useApiMutation(({ id, ...body }) => api.post(`/notes/${id}/ai`, body));

/* ───────── Quick capture / sessions ───────── */

export const useParseCapture = () => useMutation({ mutationFn: (text) => api.post('/capture/parse', { text, date: todayKey() }) });
export const useSessions = () => useQuery({ queryKey: ['auth', 'sessions'], queryFn: ({ signal }) => api.get('/auth/sessions', undefined, { signal }) });
export const useRevokeSession = () => useApiMutation((id) => api.del(`/auth/sessions/${id}`), { invalidate: [['auth', 'sessions']] });
export const useRevokeOtherSessions = () => useApiMutation(() => api.del('/auth/sessions/others'), { invalidate: [['auth', 'sessions']] });

/* ───────── Reminders ───────── */

export const useReminders = (status = 'active') =>
  useQuery({
    queryKey: ['reminders', status],
    queryFn: ({ signal }) => api.get('/reminders', { status }, { signal }),
    placeholderData: keepPreviousData,
  });

const REMINDER_KEYS = [['reminders']];
export const useCreateReminder = () => useApiMutation((body) => api.post('/reminders', body), { invalidate: REMINDER_KEYS });
export const useUpdateReminder = () => useApiMutation(({ id, ...body }) => api.patch(`/reminders/${id}`, body), { invalidate: REMINDER_KEYS });
export const useDeleteReminder = () => useApiMutation((id) => api.del(`/reminders/${id}`), { invalidate: REMINDER_KEYS });
export const useCompleteReminder = () =>
  useApiMutation((id) => request(`/reminders/${id}/complete`, { method: 'POST', body: { date: todayKey() } }), { invalidate: REMINDER_KEYS });
