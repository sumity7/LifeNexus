import mongoose from 'mongoose';
import { notFound } from '../utils/AppError.js';
import { User } from '../models/User.js';

export const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Loads a document only if it belongs to the user — the core authorization check. */
export async function findOwned(Model, id, userId, resource) {
  const doc = await Model.findOne({ _id: id, user: userId });
  if (!doc) throw notFound(resource);
  return doc;
}

export async function getPreferences(userId, withName = false) {
  const user = await User.findById(userId).select('preferences name').lean();
  if (withName) return { preferences: user?.preferences ?? {}, name: user?.name ?? '' };
  return user?.preferences ?? {};
}
