import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dateQuery, idParams } from '../validators/common.js';
import * as s from '../validators/schemas.js';

import * as auth from '../controllers/auth.js';
import * as tasks from '../controllers/tasks.js';
import * as habits from '../controllers/habits.js';
import * as goals from '../controllers/goals.js';
import * as projects from '../controllers/projects.js';
import * as events from '../controllers/events.js';
import * as notes from '../controllers/notes.js';
import * as finance from '../controllers/finance.js';
import * as health from '../controllers/health.js';
import * as routines from '../controllers/routines.js';
import * as reminders from '../controllers/reminders.js';
import * as documents from '../controllers/documents.js';
import * as journal from '../controllers/journal.js';
import * as focus from '../controllers/focus.js';
import * as context from '../controllers/context.js';
import * as ai from '../controllers/ai.js';
import * as capture from '../controllers/capture.js';
import { getDashboard } from '../controllers/dashboard.js';
import { getAnalytics } from '../controllers/analytics.js';
import { search } from '../controllers/search.js';

const tooMany = (message, code = 'RATE_LIMITED') => ({ error: { message, code } });

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isTest ? 10_000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: tooMany('Too many attempts. Please wait a few minutes and try again.'),
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isTest ? 100_000 : 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Too many requests. Please slow down.'),
});

// AI calls are expensive: a tighter, configurable per-user budget.
// Tests get a high default (like the other limiters) unless AI_RATE_LIMIT_PER_MIN
// was explicitly set — a dedicated test can then exercise the real limiter.
const aiLimit = env.isTest && !process.env.AI_RATE_LIMIT_PER_MIN ? 10_000 : env.AI_RATE_LIMIT_PER_MIN;
const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: aiLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: tooMany('The AI service is busy right now. Please try again in a moment.', 'AI_RATE_LIMITED'),
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.isTest ? 10_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  message: tooMany('Upload limit reached. Please wait a minute.'),
});

// forgot-password always responds 200 (never reveals whether the email exists), so it can't use
// authLimiter's skipSuccessfulRequests — every attempt must count, or this endpoint would never
// actually rate-limit at all.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isTest ? 10_000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Too many attempts. Please wait a few minutes and try again.'),
});

const byId = { params: idParams };

/* ───────────── Auth ───────────── */
const authRouter = Router();
authRouter.post('/register', authLimiter, validate({ body: s.auth.register }), auth.register);
authRouter.post('/login', authLimiter, validate({ body: s.auth.login }), auth.login);
authRouter.post('/forgot-password', forgotPasswordLimiter, validate({ body: s.auth.forgotPassword }), auth.forgotPassword);
authRouter.post('/reset-password', authLimiter, validate({ body: s.auth.resetPassword }), auth.resetPassword);
authRouter.post('/refresh', auth.refresh);
authRouter.post('/logout', auth.logout);
authRouter.get('/me', requireAuth, auth.me);
authRouter.patch('/me', requireAuth, validate({ body: s.auth.updateMe }), auth.updateMe);
authRouter.delete('/me', requireAuth, validate({ body: s.auth.deleteAccount }), auth.deleteAccount);
authRouter.post('/change-password', requireAuth, authLimiter, validate({ body: s.auth.changePassword }), auth.changePassword);
authRouter.get('/sessions', requireAuth, auth.listSessions);
authRouter.delete('/sessions/others', requireAuth, auth.revokeOtherSessions);
authRouter.delete('/sessions/:id', requireAuth, validate(byId), auth.revokeSession);
authRouter.get('/export', requireAuth, auth.exportData);

/* ───────────── Protected resources ───────────── */
const api = Router();
api.use(requireAuth);

api.get('/dashboard', validate({ query: s.insights.dashboard }), getDashboard);
api.get('/analytics', validate({ query: s.insights.analytics }), getAnalytics);
api.get('/search', validate({ query: s.insights.search }), search);
api.post('/capture/parse', validate({ body: s.capture.parse }), capture.parse);

api.get('/tasks', validate({ query: s.tasks.list }), tasks.listTasks);
api.post('/tasks', validate({ body: s.tasks.create }), tasks.createTask);
api.get('/tasks/:id', validate(byId), tasks.getTask);
api.patch('/tasks/:id', validate({ ...byId, body: s.tasks.update }), tasks.updateTask);
api.delete('/tasks/:id', validate(byId), tasks.deleteTask);
api.post('/tasks/:id/toggle', validate({ ...byId, body: s.tasks.toggle }), tasks.toggleTask);

api.get('/projects', validate({ query: s.projects.list }), projects.listProjects);
api.post('/projects', validate({ body: s.projects.create }), projects.createProject);
api.get('/projects/:id', validate(byId), projects.getProject);
api.patch('/projects/:id', validate({ ...byId, body: s.projects.update }), projects.updateProject);
api.delete('/projects/:id', validate(byId), projects.deleteProject);

api.get('/habits', validate({ query: s.habits.list }), habits.listHabits);
api.post('/habits', validate({ body: s.habits.create }), habits.createHabit);
api.put('/habits/order', validate({ body: s.habits.reorder }), habits.reorderHabits);
api.get('/habits/:id', validate({ ...byId, query: dateQuery }), habits.getHabit);
api.patch('/habits/:id', validate({ ...byId, body: s.habits.update }), habits.updateHabit);
api.delete('/habits/:id', validate(byId), habits.deleteHabit);
api.post('/habits/:id/toggle', validate({ ...byId, body: s.habits.toggle }), habits.toggleHabit);

api.get('/goals', validate({ query: s.goals.list }), goals.listGoals);
api.post('/goals', validate({ body: s.goals.create }), goals.createGoal);
api.get('/goals/:id', validate(byId), goals.getGoal);
api.patch('/goals/:id', validate({ ...byId, body: s.goals.update }), goals.updateGoal);
api.delete('/goals/:id', validate(byId), goals.deleteGoal);
api.post('/goals/:id/milestones', validate({ ...byId, body: s.goals.createMilestone }), goals.addMilestone);
api.patch('/goals/:id/milestones/:milestoneId', validate({ params: s.goals.milestoneParams, body: s.goals.updateMilestone }), goals.updateMilestone);
api.delete('/goals/:id/milestones/:milestoneId', validate({ params: s.goals.milestoneParams }), goals.deleteMilestone);

api.get('/events', validate({ query: s.events.list }), events.listEvents);
api.post('/events', validate({ body: s.events.create }), events.createEvent);
api.get('/events/:id', validate(byId), events.getEvent);
api.patch('/events/:id', validate({ ...byId, body: s.events.update }), events.updateEvent);
api.delete('/events/:id', validate(byId), events.deleteEvent);

api.get('/notes', validate({ query: s.notes.list }), notes.listNotes);
api.post('/notes', validate({ body: s.notes.create }), notes.createNote);
api.get('/notes/tags', notes.listTags);
api.get('/notes/folders', notes.listFolders);
api.post('/notes/folders', validate({ body: s.notes.folder }), notes.createFolder);
api.patch('/notes/folders/:id', validate({ ...byId, body: s.notes.folderUpdate }), notes.updateFolder);
api.delete('/notes/folders/:id', validate(byId), notes.deleteFolder);
api.get('/notes/:id', validate(byId), notes.getNote);
api.patch('/notes/:id', validate({ ...byId, body: s.notes.update }), notes.updateNote);
api.delete('/notes/:id', validate(byId), notes.deleteNote);
api.post('/notes/:id/ai', aiLimiter, validate({ ...byId, body: s.ai.noteAction }), ai.noteAction);

api.get('/finance/summary', validate({ query: s.finance.summary }), finance.getSummary);
api.get('/finance/transactions', validate({ query: s.finance.listTransactions }), finance.listTransactions);
api.post('/finance/transactions', validate({ body: s.finance.createTransaction }), finance.createTransaction);
api.patch('/finance/transactions/:id', validate({ ...byId, body: s.finance.updateTransaction }), finance.updateTransaction);
api.delete('/finance/transactions/:id', validate(byId), finance.deleteTransaction);
api.get('/finance/budgets', finance.listBudgets);
api.post('/finance/budgets', validate({ body: s.finance.budget }), finance.createBudget);
api.patch('/finance/budgets/:id', validate({ ...byId, body: s.finance.budgetUpdate }), finance.updateBudget);
api.delete('/finance/budgets/:id', validate(byId), finance.deleteBudget);
api.get('/finance/accounts', finance.listAccounts);
api.post('/finance/accounts', validate({ body: s.finance.createAccount }), finance.createAccount);
api.patch('/finance/accounts/:id', validate({ ...byId, body: s.finance.updateAccount }), finance.updateAccount);
api.delete('/finance/accounts/:id', validate(byId), finance.deleteAccount);
api.get('/finance/recurring', finance.listRecurring);
api.post('/finance/recurring', validate({ body: s.finance.createRecurring }), finance.createRecurring);
api.patch('/finance/recurring/:id', validate({ ...byId, body: s.finance.updateRecurring }), finance.updateRecurring);
api.delete('/finance/recurring/:id', validate(byId), finance.deleteRecurring);
api.get('/finance/subscriptions', finance.listSubscriptions);
api.post('/finance/subscriptions', validate({ body: s.finance.createSubscription }), finance.createSubscription);
api.patch('/finance/subscriptions/:id', validate({ ...byId, body: s.finance.updateSubscription }), finance.updateSubscription);
api.delete('/finance/subscriptions/:id', validate(byId), finance.deleteSubscription);
api.get('/finance/savings', finance.listSavingsGoals);
api.post('/finance/savings', validate({ body: s.finance.createSavings }), finance.createSavingsGoal);
api.patch('/finance/savings/:id', validate({ ...byId, body: s.finance.updateSavings }), finance.updateSavingsGoal);
api.post('/finance/savings/:id/contribute', validate({ ...byId, body: s.finance.contribute }), finance.contributeSavings);
api.delete('/finance/savings/:id', validate(byId), finance.deleteSavingsGoal);

api.get('/health/summary', validate({ query: s.health.summary }), health.getSummary);
api.get('/health/logs', validate({ query: s.health.range }), health.listLogs);
api.get('/health/logs/:date', validate({ params: s.health.dateParams }), health.getLog);
api.put('/health/logs/:date', validate({ params: s.health.dateParams, body: s.health.log }), health.upsertLog);
api.post('/health/logs/:date/water', validate({ params: s.health.dateParams, body: s.health.water }), health.addWater);
api.get('/health/workouts', validate({ query: s.health.range }), health.listWorkouts);
api.post('/health/workouts', validate({ body: s.health.createWorkout }), health.createWorkout);
api.patch('/health/workouts/:id', validate({ ...byId, body: s.health.updateWorkout }), health.updateWorkout);
api.delete('/health/workouts/:id', validate(byId), health.deleteWorkout);

api.get('/routines', validate({ query: s.routines.list }), routines.listRoutines);
api.post('/routines', validate({ body: s.routines.create }), routines.createRoutine);
api.patch('/routines/:id', validate({ ...byId, body: s.routines.update }), routines.updateRoutine);
api.delete('/routines/:id', validate(byId), routines.deleteRoutine);
api.post('/routines/:id/steps/:stepId/toggle', validate({ params: s.routines.stepParams, body: s.routines.dateBody }), routines.toggleStep);
api.post('/routines/:id/complete', validate({ ...byId, body: s.routines.dateBody }), routines.completeAll);
api.post('/routines/:id/reset', validate({ ...byId, body: s.routines.dateBody }), routines.resetDay);

api.get('/reminders', validate({ query: s.reminders.list }), reminders.listReminders);
api.post('/reminders', validate({ body: s.reminders.create }), reminders.createReminder);
api.patch('/reminders/:id', validate({ ...byId, body: s.reminders.update }), reminders.updateReminder);
api.delete('/reminders/:id', validate(byId), reminders.deleteReminder);
api.post('/reminders/:id/complete', validate({ ...byId, body: s.reminders.complete }), reminders.completeReminder);

api.get('/documents', validate({ query: s.documents.list }), documents.listDocuments);
api.post('/documents', uploadLimiter, documents.handleUpload, validate({ body: s.documents.upload }), documents.uploadDocument);
api.get('/documents/:id', validate(byId), documents.getDocument);
api.get('/documents/:id/file', validate({ ...byId, query: s.documents.fileQuery }), documents.serveFile);
api.patch('/documents/:id', validate({ ...byId, body: s.documents.update }), documents.updateDocument);
api.post('/documents/:id/extract', validate(byId), documents.extractDocument);
api.delete('/documents/:id', validate(byId), documents.deleteDocument);

api.get('/journal', validate({ query: s.journal.list }), journal.listEntries);
api.get('/journal/calendar', validate({ query: s.journal.list }), journal.getCalendar);
api.get('/journal/:date', validate({ params: s.journal.dateParams }), journal.getEntry);
api.put('/journal/:date', validate({ params: s.journal.dateParams, body: s.journal.upsert }), journal.upsertEntry);
api.delete('/journal/:date', validate({ params: s.journal.dateParams }), journal.deleteEntry);

api.get('/focus/active', focus.getActive);
api.get('/focus/summary', validate({ query: s.focus.summary }), focus.getSummary);
api.get('/focus/sessions', validate({ query: s.focus.list }), focus.listSessions);
api.post('/focus/sessions', validate({ body: s.focus.start }), focus.startSession);
api.post('/focus/sessions/log', validate({ body: s.focus.log }), focus.logSession);
api.post('/focus/sessions/:id/pause', validate(byId), focus.pauseSession);
api.post('/focus/sessions/:id/resume', validate(byId), focus.resumeSession);
api.post('/focus/sessions/:id/complete', validate({ ...byId, body: s.focus.finish }), focus.completeSession);
api.post('/focus/sessions/:id/abandon', validate({ ...byId, body: s.focus.finish }), focus.abandonSession);
api.delete('/focus/sessions/:id', validate(byId), focus.deleteSession);

api.get('/links', validate({ query: s.links.list }), context.listLinks);
api.post('/links', validate({ body: s.links.create }), context.addLink);
api.delete('/links/:id', validate(byId), context.removeLink);
api.get('/graph', validate({ query: s.ai.graph }), ai.graph);
api.get('/activity', validate({ query: s.activity.list }), context.getActivity);
api.get('/notifications', validate({ query: s.notifications.list }), context.listNotifications);
api.post('/notifications/read-all', context.markAllRead);
api.post('/notifications/:id/read', validate(byId), context.markRead);
api.delete('/notifications/:id', validate(byId), context.deleteNotification);

api.get('/ai/status', ai.status);
api.get('/ai/brief', aiLimiter, validate({ query: s.ai.brief }), ai.dailyBrief);
api.get('/ai/review', aiLimiter, validate({ query: s.ai.review }), ai.weeklyReview);
api.post('/ai/chat', aiLimiter, validate({ body: s.ai.chat }), ai.sendMessage);
api.post('/ai/actions', validate({ body: s.ai.action }), ai.decideAction);
api.post('/ai/proposals/execute', validate({ body: s.ai.proposal }), ai.executeProposal);
api.get('/ai/conversations', ai.listConversations);
api.delete('/ai/conversations', ai.clearConversations);
api.get('/ai/conversations/:id', validate({ ...byId, query: s.ai.listMessages }), ai.getConversation);
api.patch('/ai/conversations/:id', validate({ ...byId, body: s.ai.rename }), ai.renameConversation);
api.delete('/ai/conversations/:id', validate(byId), ai.deleteConversation);

/* ───────────── Mount ───────────── */
export const apiRouter = Router();
apiRouter.use('/auth', authRouter);
apiRouter.use(api);
