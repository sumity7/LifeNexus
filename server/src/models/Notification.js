import mongoose from 'mongoose';
import { ENTITY_TYPES, NOTIFICATION_TYPES } from '../constants.js';

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    // Stable key so the sync job never creates the same notification twice (e.g. "document:<id>:expiring:2026-09-15").
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, trim: true, maxlength: 500, default: '' },
    href: { type: String, maxlength: 300, default: '' },
    entityType: { type: String, enum: ENTITY_TYPES, default: null },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, key: 1 }, { unique: true });
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });
// Old notifications expire automatically after 60 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 86400 });

export const Notification = mongoose.model('Notification', notificationSchema);
