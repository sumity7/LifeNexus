import { ActivityLog } from '../models/ActivityLog.js';
import { serverToday } from '../utils/dates.js';

/**
 * Records a meaningful user action. Never throws — logging must not break the
 * request that triggered it.
 */
export async function logActivity(userId, type, { entityType = null, entityId = null, title = '', date, meta } = {}) {
  try {
    await ActivityLog.create({ user: userId, type, entityType, entityId, title: String(title).slice(0, 240), date: date ?? serverToday(), meta });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.error('activity log failed:', err.message);
  }
}

export function listActivity(userId, { from, to, types, limit = 100 } = {}) {
  const filter = { user: userId };
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (types?.length) filter.type = { $in: types };
  return ActivityLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
}
