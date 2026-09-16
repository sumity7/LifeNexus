import mongoose from 'mongoose';
import { ACTIVITY_TYPES, ENTITY_TYPES } from '../constants.js';

/** Append-only record of meaningful user actions. Powers the weekly review, notifications and AI context. */
const activitySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    entityType: { type: String, enum: ENTITY_TYPES, default: null },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    title: { type: String, trim: true, maxlength: 240, default: '' },
    // Local calendar day of the action, for grouping.
    date: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
activitySchema.index({ user: 1, createdAt: -1 });
activitySchema.index({ user: 1, date: 1, type: 1 });

export const ActivityLog = mongoose.model('ActivityLog', activitySchema);
