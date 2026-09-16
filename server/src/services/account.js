import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Habit, HabitLog } from '../models/Habit.js';
import { Goal } from '../models/Goal.js';
import { Event } from '../models/Event.js';
import { Folder, Note } from '../models/Note.js';
import { Account, Budget, RecurringTransaction, SavingsGoal, Subscription, Transaction } from '../models/Finance.js';
import { HealthLog, Workout } from '../models/Health.js';
import { Routine, RoutineLog } from '../models/Routine.js';
import { Reminder } from '../models/Reminder.js';
import { Document } from '../models/Document.js';
import { JournalEntry } from '../models/Journal.js';
import { FocusSession } from '../models/FocusSession.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { Notification } from '../models/Notification.js';
import { Link } from '../models/Link.js';
import { AIConversation, AIInsight, AIMessage } from '../models/AI.js';
import { getStorage } from './storage/index.js';

/** Every collection that stores user-owned data, keyed by export name. */
export const USER_DATA_MODELS = {
  tasks: Task, projects: Project, habits: Habit, habitLogs: HabitLog, goals: Goal, events: Event, folders: Folder, notes: Note,
  transactions: Transaction, budgets: Budget, accounts: Account, recurringTransactions: RecurringTransaction,
  subscriptions: Subscription, savingsGoals: SavingsGoal, healthLogs: HealthLog, workouts: Workout, routines: Routine,
  routineLogs: RoutineLog, reminders: Reminder, documents: Document, journal: JournalEntry, focusSessions: FocusSession,
  activity: ActivityLog, notifications: Notification, links: Link, aiConversations: AIConversation, aiMessages: AIMessage,
  aiInsights: AIInsight,
};

/** Removes every document owned by the user (but not the user record itself). */
export async function deleteUserData(userId) {
  await Promise.all(Object.values(USER_DATA_MODELS).map((Model) => Model.deleteMany({ user: userId })));
  await getStorage().removeAll(userId);
}

export async function deleteAccount(userId) {
  await deleteUserData(userId);
  await Session.deleteMany({ user: userId });
  await User.deleteOne({ _id: userId });
}

/** Full JSON export of the user's data (documents include metadata only, not file contents). */
export async function exportUserData(userId) {
  const user = await User.findById(userId).lean();
  const out = { exportedAt: new Date().toISOString(), version: 1, user: { name: user.name, email: user.email, preferences: user.preferences }, data: {} };
  for (const [key, Model] of Object.entries(USER_DATA_MODELS)) {
    if (['notifications', 'aiMessages', 'aiConversations', 'aiInsights'].includes(key)) continue;
    out.data[key] = await Model.find({ user: userId }).select('-user -__v -storageKey -extraction.text').lean();
  }
  return out;
}
