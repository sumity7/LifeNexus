import mongoose from 'mongoose';
import { Link } from '../models/Link.js';
import { Task } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Goal } from '../models/Goal.js';
import { Event } from '../models/Event.js';
import { Reminder } from '../models/Reminder.js';
import { Habit } from '../models/Habit.js';
import { Routine } from '../models/Routine.js';
import { Note } from '../models/Note.js';
import { JournalEntry } from '../models/Journal.js';
import { Document } from '../models/Document.js';
import { FocusSession } from '../models/FocusSession.js';
import { Budget, SavingsGoal, Subscription, Transaction } from '../models/Finance.js';
import { HealthLog, Workout } from '../models/Health.js';
import { AppError } from '../utils/AppError.js';

/** Model + fields needed to render a compact "chip" for each entity type. */
export const ENTITY_REGISTRY = {
  task: { model: Task, fields: 'title status dueDate priority', label: (d) => d.title },
  project: { model: Project, fields: 'title status color', label: (d) => d.title },
  goal: { model: Goal, fields: 'title status color deadline', label: (d) => d.title },
  event: { model: Event, fields: 'title start end allDay color', label: (d) => d.title },
  reminder: { model: Reminder, fields: 'title date completed category', label: (d) => d.title },
  habit: { model: Habit, fields: 'name icon color archived', label: (d) => `${d.icon} ${d.name}` },
  routine: { model: Routine, fields: 'name type active', label: (d) => d.name },
  health: { model: HealthLog, fields: 'date', label: (d) => `Health log ${d.date}` },
  workout: { model: Workout, fields: 'title type date durationMin', label: (d) => d.title || `${d.type} · ${d.date}` },
  note: { model: Note, fields: 'title pinned archived', label: (d) => d.title || 'Untitled note' },
  journal: { model: JournalEntry, fields: 'date title', label: (d) => d.title || `Journal ${d.date}` },
  document: { model: Document, fields: 'title category expiryDate mimeType', label: (d) => d.title },
  transaction: { model: Transaction, fields: 'description category amount type date', label: (d) => d.description || d.category },
  budget: { model: Budget, fields: 'category limit', label: (d) => `${d.category} budget` },
  subscription: { model: Subscription, fields: 'name amount nextPayment', label: (d) => d.name },
  savings_goal: { model: SavingsGoal, fields: 'title targetAmount currentAmount', label: (d) => d.title },
  focus: { model: FocusSession, fields: 'label date plannedMinutes focusedSeconds', label: (d) => d.label || `Focus ${d.date}` },
};

const ENTITY_ROUTES = {
  task: (id) => `/tasks?task=${id}`,
  project: (id) => `/projects/${id}`,
  goal: (id) => `/goals/${id}`,
  event: () => '/calendar',
  reminder: () => '/reminders',
  habit: (id) => `/habits?habit=${id}`,
  routine: () => '/routines',
  health: (_, d) => `/health?date=${d?.date ?? ''}`,
  workout: () => '/health',
  note: (id) => `/notes?note=${id}`,
  journal: (_, d) => `/journal?date=${d?.date ?? ''}`,
  document: (id) => `/documents?doc=${id}`,
  transaction: (_, d) => `/finance?month=${d?.date?.slice(0, 7) ?? ''}`,
  budget: () => '/finance',
  subscription: () => '/finance?tab=subscriptions',
  savings_goal: () => '/finance?tab=savings',
  focus: () => '/focus',
};

const isValidId = (id) => mongoose.isValidObjectId(id);

function orderEndpoints(x, y) {
  const kx = `${x.type}:${x.id}`;
  const ky = `${y.type}:${y.id}`;
  return kx <= ky ? [x, y] : [y, x];
}

/** Verifies the entity exists and belongs to the user. */
export async function assertOwnedEntity(userId, type, id) {
  const entry = ENTITY_REGISTRY[type];
  if (!entry || !isValidId(id)) throw new AppError(400, 'Invalid entity reference');
  const exists = await entry.model.exists({ _id: id, user: userId });
  if (!exists) throw new AppError(404, `${type} not found`);
}

export async function createLink(userId, from, to, note = '') {
  if (from.type === to.type && String(from.id) === String(to.id)) throw new AppError(400, "An item can't be linked to itself");
  await Promise.all([assertOwnedEntity(userId, from.type, from.id), assertOwnedEntity(userId, to.type, to.id)]);
  const [a, b] = orderEndpoints(from, to);
  try {
    return await Link.create({ user: userId, a, b, note });
  } catch (err) {
    if (err?.code === 11000) return Link.findOne({ user: userId, 'a.type': a.type, 'a.id': a.id, 'b.type': b.type, 'b.id': b.id });
    throw err;
  }
}

/** Resolves entities into chips `{type, id, label, href, meta}`; skips anything that no longer exists. */
export async function resolveEntities(userId, refs) {
  const byType = new Map();
  for (const ref of refs) {
    if (!ENTITY_REGISTRY[ref.type]) continue;
    if (!byType.has(ref.type)) byType.set(ref.type, new Set());
    byType.get(ref.type).add(String(ref.id));
  }
  const chips = new Map();
  await Promise.all(
    [...byType].map(async ([type, ids]) => {
      const { model, fields, label } = ENTITY_REGISTRY[type];
      const docs = await model.find({ user: userId, _id: { $in: [...ids] } }).select(fields).lean();
      for (const doc of docs) {
        chips.set(`${type}:${doc._id}`, { type, id: doc._id, label: label(doc), href: ENTITY_ROUTES[type](doc._id, doc), meta: doc });
      }
    }),
  );
  return chips;
}

/** All links touching an entity, with the *other* endpoint resolved. */
export async function getLinksFor(userId, type, id) {
  const links = await Link.find({
    user: userId,
    $or: [
      { 'a.type': type, 'a.id': id },
      { 'b.type': type, 'b.id': id },
    ],
  }).lean();
  const others = links.map((l) => (l.a.type === type && String(l.a.id) === String(id) ? l.b : l.a));
  const chips = await resolveEntities(userId, others);
  return links
    .map((l, i) => {
      const chip = chips.get(`${others[i].type}:${others[i].id}`);
      return chip ? { _id: l._id, note: l.note, createdAt: l.createdAt, ...chip } : null;
    })
    .filter(Boolean);
}

export async function deleteLinksFor(userId, type, id) {
  await Link.deleteMany({ user: userId, $or: [{ 'a.type': type, 'a.id': id }, { 'b.type': type, 'b.id': id }] });
}

export const entityHref = (type, id, doc) => ENTITY_ROUTES[type]?.(id, doc) ?? '/';
