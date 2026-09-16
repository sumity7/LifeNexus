import mongoose from 'mongoose';
import { REMINDER_CATEGORIES, REMINDER_RECURRENCE } from '../constants.js';

const reminderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    date: { type: String, required: true },
    time: { type: String, default: null },
    category: { type: String, enum: REMINDER_CATEGORIES, default: 'other' },
    recurrence: { type: String, enum: REMINDER_RECURRENCE, default: 'none' },
    leadDays: { type: Number, min: 0, max: 60, default: 3 },
    important: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    // Entity that generated this reminder (e.g. a document's expiry).
    source: { type: { type: String }, id: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true },
);
reminderSchema.index({ user: 1, completed: 1, date: 1 });

export const Reminder = mongoose.model('Reminder', reminderSchema);
