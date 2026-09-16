import { z } from 'zod';
import {
  ACCENTS, ACCOUNT_TYPES, ACTIVITY_TYPES, AI_ACTION_TYPES, AI_MODES, AI_SCOPES, BILLING_FREQUENCIES, CURRENCIES,
  DASHBOARD_WIDGETS, DOCUMENT_CATEGORIES, ENTITY_TYPES, FOCUS_MODES, GOAL_CATEGORIES, GOAL_STATUSES, HABIT_FREQUENCIES,
  INTENSITIES, NOTIFICATION_PREFS, PRIORITIES, PROJECT_STATUSES, RECURRENCE, REMINDER_CATEGORIES, REMINDER_RECURRENCE,
  ROUTINE_TYPES, TASK_STATUSES, THEMES, TRANSACTION_TYPES, WORKOUT_TYPES,
} from '../constants.js';
import { color, dateKey, monthKey, objectId, optionalText, requiredText, tagList, timeHM } from './common.js';

const weekdays = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .transform((arr) => [...new Set(arr)].sort());
const search = z.string().trim().max(100);
const limit = z.coerce.number().int().min(1).max(500);
const boolString = z.enum(['true', 'false']);

/* ───────────── Auth ───────────── */

const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
const email = z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email').max(254);

export const auth = {
  register: z.object({ name: requiredText(80, 'Name'), email, password }),
  login: z.object({ email, password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required').max(128) }),
  updateMe: z.object({
    name: requiredText(80, 'Name').optional(),
    preferences: z
      .object({
        theme: z.enum(THEMES),
        accent: z.enum(ACCENTS),
        currency: z.enum(CURRENCIES),
        weekStartsOn: z.union([z.literal(0), z.literal(1)]),
        waterGoalMl: z.number().int().min(250).max(10000),
        sleepGoalHours: z.number().min(3).max(14),
        targetWeightKg: z.number().min(1).max(700).nullable(),
        focusMinutes: z.number().int().min(5).max(180),
        breakMinutes: z.number().int().min(1).max(60),
        language: z.string().trim().min(2).max(10),
        timezone: z.string().trim().max(64),
        notifications: z.object(Object.fromEntries(NOTIFICATION_PREFS.map((k) => [k, z.boolean()]))).partial(),
        ai: z
          .object({
            enabled: z.boolean(),
            rememberConversations: z.boolean(),
            scopes: z.object(Object.fromEntries(AI_SCOPES.map((k) => [k, z.boolean()]))).partial(),
          })
          .partial(),
        dashboardWidgets: z
          .array(z.object({ id: z.enum(DASHBOARD_WIDGETS), visible: z.boolean() }))
          .max(DASHBOARD_WIDGETS.length)
          .refine((w) => new Set(w.map((x) => x.id)).size === w.length, 'Duplicate widgets'),
      })
      .partial()
      .optional(),
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: password,
  }),
  deleteAccount: z.object({ password: z.string().min(1, 'Password is required').max(128) }),
  forgotPassword: z.object({ email }),
  resetPassword: z.object({ token: z.string({ required_error: 'Reset token is required' }).min(1).max(500), password }),
};

/* ───────────── Tasks ───────────── */

const taskBase = z.object({
  title: requiredText(200),
  notes: optionalText(5000, 'Notes'),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  dueDate: dateKey.nullable(),
  dueTime: timeHM.nullable(),
  tags: tagList,
  subtasks: z
    .array(z.object({ _id: objectId.optional(), title: requiredText(200, 'Subtask'), done: z.boolean().optional() }))
    .max(50, 'At most 50 subtasks'),
  recurrence: z.object({ freq: z.enum(RECURRENCE), interval: z.number().int().min(1).max(365).optional() }),
  goal: objectId.nullable(),
  milestone: objectId.nullable(),
  project: objectId.nullable(),
});

export const tasks = {
  list: z.object({
    view: z.enum(['all', 'open', 'today', 'upcoming', 'overdue', 'completed', 'nodate']).optional(),
    date: dateKey.optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    tag: z.string().trim().toLowerCase().max(30).optional(),
    goal: objectId.optional(),
    project: objectId.optional(),
    q: search.optional(),
    sort: z.enum(['due', 'priority', 'created', 'updated']).optional(),
    limit: limit.optional(),
  }),
  create: taskBase.partial().required({ title: true }).extend({ date: dateKey.optional() }),
  update: taskBase.partial().extend({ date: dateKey.optional() }),
  toggle: z.object({ date: dateKey.optional() }),
};

/* ───────────── Habits ───────────── */

const habitBase = z.object({
  name: requiredText(100, 'Name'),
  description: optionalText(500, 'Description'),
  icon: z.string().trim().min(1).max(16),
  color,
  frequency: z.enum(HABIT_FREQUENCIES),
  days: weekdays,
  timesPerWeek: z.number().int().min(1).max(7),
  archived: z.boolean(),
  order: z.number().int().min(0).max(10000),
});

export const habits = {
  list: z.object({
    date: dateKey.optional(),
    archived: boolString.optional(),
    days: z.coerce.number().int().min(7).max(400).optional(),
  }),
  create: habitBase.partial().required({ name: true }),
  update: habitBase.partial(),
  toggle: z.object({ date: dateKey, today: dateKey.optional() }),
  reorder: z.object({ ids: z.array(objectId).min(1).max(200) }),
};

/* ───────────── Goals ───────────── */

const milestone = z.object({
  title: requiredText(200, 'Milestone'),
  dueDate: dateKey.nullable(),
  done: z.boolean(),
});

const goalBase = z.object({
  title: requiredText(200),
  description: optionalText(2000, 'Description'),
  category: z.enum(GOAL_CATEGORIES),
  status: z.enum(GOAL_STATUSES),
  color,
  startDate: dateKey.nullable(),
  deadline: dateKey.nullable(),
});

export const goals = {
  list: z.object({ status: z.enum([...GOAL_STATUSES, 'all']).optional() }),
  create: goalBase
    .partial()
    .required({ title: true })
    .extend({ milestones: z.array(milestone.partial().required({ title: true })).max(50).optional() }),
  update: goalBase.partial(),
  milestoneParams: z.object({ id: objectId, milestoneId: objectId }),
  createMilestone: milestone.partial().required({ title: true }),
  updateMilestone: milestone.partial(),
};

/* ───────────── Events ───────────── */

const eventBase = z.object({
  title: requiredText(200),
  description: optionalText(2000, 'Description'),
  location: optionalText(200, 'Location'),
  start: z.coerce.date({ invalid_type_error: 'Invalid start date' }),
  end: z.coerce.date({ invalid_type_error: 'Invalid end date' }),
  allDay: z.boolean(),
  color,
  recurrence: z.object({
    freq: z.enum(RECURRENCE),
    interval: z.number().int().min(1).max(365).optional(),
    until: z.coerce.date().nullable().optional(),
  }),
});

export const events = {
  list: z.object({ from: z.coerce.date(), to: z.coerce.date() }),
  create: eventBase.partial().required({ title: true, start: true, end: true }),
  update: eventBase.partial(),
};

/* ───────────── Notes ───────────── */

export const notes = {
  list: z.object({
    folder: z.union([objectId, z.literal('none')]).optional(),
    tag: z.string().trim().toLowerCase().max(30).optional(),
    pinned: boolString.optional(),
    archived: boolString.optional(),
    q: search.optional(),
  }),
  create: z
    .object({
      title: optionalText(200, 'Title'),
      content: z.string().max(200_000, 'Note is too long'),
      folder: objectId.nullable(),
      tags: tagList,
      pinned: z.boolean(),
      archived: z.boolean(),
    })
    .partial(),
  folder: z.object({ name: requiredText(60, 'Folder name'), color: color.optional() }),
  folderUpdate: z.object({ name: requiredText(60, 'Folder name'), color }).partial(),
};
notes.update = notes.create;

/* ───────────── Finance ───────────── */

const amount = z.number({ invalid_type_error: 'Amount must be a number' }).positive('Amount must be greater than 0').max(1e9);
const transactionBase = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount,
  category: requiredText(40, 'Category'),
  description: optionalText(200, 'Description'),
  date: dateKey,
  account: objectId.nullable(),
  savingsGoal: objectId.nullable(),
});

const accountBase = z.object({
  name: requiredText(60, 'Name'),
  type: z.enum(ACCOUNT_TYPES),
  balance: z.number().min(0).max(1e9),
  color,
  archived: z.boolean(),
});

const recurringBase = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount,
  category: requiredText(40, 'Category'),
  description: optionalText(200, 'Description'),
  frequency: z.enum(BILLING_FREQUENCIES),
  nextDate: dateKey,
  account: objectId.nullable(),
  active: z.boolean(),
  autoPost: z.boolean(),
});

const subscriptionBase = z.object({
  name: requiredText(80, 'Name'),
  amount,
  frequency: z.enum(BILLING_FREQUENCIES),
  nextPayment: dateKey,
  category: optionalText(40, 'Category'),
  notes: optionalText(300, 'Notes'),
  active: z.boolean(),
});

const savingsBase = z.object({
  title: requiredText(120),
  targetAmount: amount,
  currentAmount: z.number().min(0).max(1e9),
  monthlyContribution: z.number().min(0).max(1e9),
  deadline: dateKey.nullable(),
  color,
  goal: objectId.nullable(),
});

export const finance = {
  listTransactions: z.object({
    month: monthKey.optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    category: z.string().trim().max(40).optional(),
    account: objectId.optional(),
    q: search.optional(),
    limit: limit.optional(),
  }),
  createTransaction: transactionBase.partial({ description: true, account: true, savingsGoal: true }),
  updateTransaction: transactionBase.partial(),
  budget: z.object({ category: requiredText(40, 'Category'), limit: z.number().positive('Limit must be greater than 0').max(1e9) }),
  budgetUpdate: z.object({ category: requiredText(40, 'Category'), limit: z.number().positive().max(1e9) }).partial(),
  summary: z.object({ month: monthKey.optional() }),
  createAccount: accountBase.partial().required({ name: true, type: true }),
  updateAccount: accountBase.partial(),
  createRecurring: recurringBase.partial().required({ type: true, amount: true, category: true, nextDate: true }),
  updateRecurring: recurringBase.partial(),
  createSubscription: subscriptionBase.partial().required({ name: true, amount: true, nextPayment: true }),
  updateSubscription: subscriptionBase.partial(),
  createSavings: savingsBase.partial().required({ title: true, targetAmount: true }),
  updateSavings: savingsBase.partial(),
  contribute: z.object({ amount, date: dateKey.optional(), account: objectId.nullable().optional() }),
};

/* ───────────── Health ───────────── */

const rating = z.number().int().min(1).max(5).nullable();
const workoutBase = z.object({
  date: dateKey,
  type: z.enum(WORKOUT_TYPES),
  title: optionalText(100, 'Title'),
  durationMin: z.number().int().min(1, 'Duration must be at least 1 minute').max(1440),
  intensity: z.enum(INTENSITIES),
  calories: z.number().int().min(0).max(20000).nullable(),
  distanceKm: z.number().min(0).max(1000).nullable(),
  notes: optionalText(1000, 'Notes'),
});

export const health = {
  dateParams: z.object({ date: dateKey }),
  range: z.object({ from: dateKey.optional(), to: dateKey.optional() }),
  log: z
    .object({
      waterMl: z.number().int().min(0).max(20000),
      sleepHours: z.number().min(0).max(24).nullable(),
      sleepQuality: rating,
      mood: rating,
      energy: rating,
      weightKg: z.number().min(1).max(700).nullable(),
      steps: z.number().int().min(0).max(200000).nullable(),
      notes: optionalText(1000, 'Notes'),
    })
    .partial(),
  water: z.object({ deltaMl: z.number().int().min(-5000).max(5000) }),
  createWorkout: workoutBase.partial().required({ date: true, durationMin: true }),
  updateWorkout: workoutBase.partial(),
  summary: z.object({ date: dateKey.optional(), days: z.coerce.number().int().min(7).max(365).optional() }),
};

/* ───────────── Routines ───────────── */

const routineBase = z.object({
  name: requiredText(80, 'Name'),
  type: z.enum(ROUTINE_TYPES),
  description: optionalText(500, 'Description'),
  timeOfDay: timeHM.nullable(),
  days: weekdays,
  steps: z
    .array(
      z.object({
        _id: objectId.optional(),
        title: requiredText(120, 'Step'),
        durationMin: z.number().int().min(0).max(600).optional(),
        habit: objectId.nullable().optional(),
      }),
    )
    .max(50, 'At most 50 steps'),
  active: z.boolean(),
});

export const routines = {
  list: z.object({ date: dateKey.optional() }),
  create: routineBase.partial().required({ name: true }),
  update: routineBase.partial(),
  stepParams: z.object({ id: objectId, stepId: objectId }),
  dateBody: z.object({ date: dateKey }),
};

/* ───────────── Projects ───────────── */

const projectBase = z.object({
  title: requiredText(200),
  description: optionalText(2000, 'Description'),
  goal: objectId.nullable(),
  status: z.enum(PROJECT_STATUSES),
  color,
  startDate: dateKey.nullable(),
  dueDate: dateKey.nullable(),
});

export const projects = {
  list: z.object({ status: z.enum([...PROJECT_STATUSES, 'all']).optional(), goal: objectId.optional() }),
  create: projectBase.partial().required({ title: true }),
  update: projectBase.partial(),
};

/* ───────────── Links / activity / notifications ───────────── */

const entityRef = z.object({ type: z.enum(ENTITY_TYPES), id: objectId });

export const links = {
  list: entityRef,
  create: z.object({ from: entityRef, to: entityRef, note: optionalText(200, 'Note').optional() }),
};

export const activity = {
  list: z.object({
    from: dateKey.optional(),
    to: dateKey.optional(),
    types: z.string().max(600).optional().transform((s) => s?.split(',').filter((t) => ACTIVITY_TYPES.includes(t))),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
};

export const notifications = {
  list: z.object({ unread: boolString.optional(), limit: z.coerce.number().int().min(1).max(200).optional(), date: dateKey.optional() }),
};

/* ───────────── Documents ───────────── */

const documentBase = z.object({
  title: requiredText(200),
  category: z.enum(DOCUMENT_CATEGORIES),
  tags: tagList,
  notes: optionalText(2000, 'Notes'),
  metadata: z.record(z.string().max(60), z.string().max(300)).refine((m) => Object.keys(m).length <= 30, 'At most 30 fields'),
  expiryDate: dateKey.nullable(),
  remindDaysBefore: z.number().int().min(0).max(365).nullable(),
  favorite: z.boolean(),
  archived: z.boolean(),
});

export const documents = {
  list: z.object({
    category: z.enum(DOCUMENT_CATEGORIES).optional(),
    view: z.enum(['all', 'favorites', 'expiring', 'archived']).optional(),
    tag: z.string().trim().toLowerCase().max(30).optional(),
    q: search.optional(),
    date: dateKey.optional(),
  }),
  // Multipart fields arrive as strings; coerce the few we accept at upload time.
  upload: z.object({
    title: optionalText(200, 'Title').optional(),
    category: z.enum(DOCUMENT_CATEGORIES).optional(),
    tags: z.string().max(400).optional().transform((s) => (s ? [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20) : [])),
    expiryDate: z.union([dateKey, z.literal('')]).optional().transform((v) => v || null),
    remindDaysBefore: z.union([z.coerce.number().int().min(0).max(365), z.literal('')]).optional().transform((v) => (v === '' || v === undefined ? null : v)),
    notes: optionalText(2000, 'Notes').optional(),
  }),
  update: documentBase.partial(),
  fileQuery: z.object({ token: z.string().min(10).max(500), download: boolString.optional() }),
};

/* ───────────── Journal ───────────── */

const lines = z.array(z.string().trim().min(1).max(300)).max(20);
export const journal = {
  list: z.object({ from: dateKey.optional(), to: dateKey.optional(), q: search.optional(), tag: z.string().trim().toLowerCase().max(30).optional() }),
  upsert: z
    .object({
      title: optionalText(200, 'Title'),
      content: z.string().max(20000, 'Entry is too long'),
      wins: lines,
      challenges: lines,
      gratitude: lines,
      lessons: optionalText(2000, 'Lessons'),
      intention: optionalText(500, 'Intention'),
      tags: tagList,
      // Stored on the day's HealthLog, not on the entry.
      mood: z.number().int().min(1).max(5).nullable(),
      energy: z.number().int().min(1).max(5).nullable(),
    })
    .partial(),
  dateParams: z.object({ date: dateKey }),
};

/* ───────────── Focus ───────────── */

export const focus = {
  list: z.object({ from: dateKey.optional(), to: dateKey.optional(), limit: limit.optional() }),
  start: z.object({
    mode: z.enum(FOCUS_MODES).optional(),
    plannedMinutes: z.number().int().min(1).max(480),
    label: optionalText(200, 'Label').optional(),
    task: objectId.nullable().optional(),
    goal: objectId.nullable().optional(),
    project: objectId.nullable().optional(),
    date: dateKey.optional(),
  }),
  finish: z.object({ notes: optionalText(1000, 'Notes').optional(), date: dateKey.optional() }),
  log: z.object({
    plannedMinutes: z.number().int().min(1).max(480),
    focusedMinutes: z.number().int().min(1).max(480),
    label: optionalText(200, 'Label').optional(),
    task: objectId.nullable().optional(),
    goal: objectId.nullable().optional(),
    project: objectId.nullable().optional(),
    date: dateKey.optional(),
    notes: optionalText(1000, 'Notes').optional(),
  }),
  summary: z.object({ date: dateKey.optional(), days: z.coerce.number().int().min(7).max(365).optional() }),
};

/* ───────────── Quick capture ───────────── */

export const capture = {
  parse: z.object({ text: z.string().trim().min(1).max(500), date: dateKey.optional() }),
};

/* ───────────── AI ───────────── */

export const ai = {
  chat: z.object({
    conversationId: objectId.optional(),
    message: z.string().trim().min(1, 'Message is required').max(6000),
    mode: z.enum(AI_MODES).optional(),
    context: entityRef.optional(),
    date: dateKey.optional(),
  }),
  listMessages: z.object({ limit: z.coerce.number().int().min(1).max(200).optional() }),
  rename: z.object({ title: requiredText(120, 'Title') }),
  action: z.object({ messageId: objectId, actionId: objectId, decision: z.enum(['execute', 'reject']), date: dateKey.optional() }),
  brief: z.object({ date: dateKey.optional(), refresh: boolString.optional() }),
  review: z.object({ week: dateKey.optional(), refresh: boolString.optional() }),
  noteAction: z.object({
    action: z.enum(['summarize', 'rewrite', 'extract_tasks', 'extract_dates', 'checklist', 'ask']),
    question: z.string().trim().max(1000).optional(),
  }),
  proposal: z.object({ type: z.enum(AI_ACTION_TYPES), payload: z.record(z.any()) }),
  graph: entityRef,
};

/* ───────────── Reminders ───────────── */

const reminderBase = z.object({
  title: requiredText(200),
  notes: optionalText(2000, 'Notes'),
  date: dateKey,
  time: timeHM.nullable(),
  category: z.enum(REMINDER_CATEGORIES),
  recurrence: z.enum(REMINDER_RECURRENCE),
  leadDays: z.number().int().min(0).max(60),
  important: z.boolean(),
  completed: z.boolean(),
});

export const reminders = {
  list: z.object({
    status: z.enum(['active', 'completed', 'all']).optional(),
    from: dateKey.optional(),
    to: dateKey.optional(),
    q: search.optional(),
  }),
  create: reminderBase.partial().required({ title: true, date: true }),
  update: reminderBase.partial(),
  complete: z.object({ date: dateKey.optional() }),
};

/* ───────────── Insights ───────────── */

export const insights = {
  dashboard: z.object({ date: dateKey.optional() }),
  analytics: z.object({ date: dateKey.optional(), days: z.coerce.number().int().min(7).max(365).optional() }),
  search: z.object({
    q: z.string().trim().min(1, 'Search query is required').max(100),
    limit: z.coerce.number().int().min(1).max(20).optional(),
    types: z.string().max(300).optional().transform((s) => s?.split(',').map((t) => t.trim()).filter(Boolean)),
    from: dateKey.optional(),
    to: dateKey.optional(),
    tag: z.string().trim().toLowerCase().max(30).optional(),
  }),
};
