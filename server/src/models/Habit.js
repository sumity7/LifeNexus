import mongoose from 'mongoose';
import { COLORS, HABIT_FREQUENCIES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const habitSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    icon: { type: String, maxlength: 16, default: '✨' },
    color: { type: String, enum: COLORS, default: 'indigo' },
    frequency: { type: String, enum: HABIT_FREQUENCIES, default: 'daily' },
    // For daily habits: scheduled weekdays (0 = Sunday). Empty means every day.
    days: { type: [Number], default: [] },
    // For weekly habits: target check-ins per week.
    timesPerWeek: { type: Number, min: 1, max: 7, default: 3 },
    archived: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const habitLogSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    habit: { type: ObjectId, ref: 'Habit', required: true },
    date: { type: String, required: true },
  },
  { timestamps: true },
);

habitLogSchema.index({ habit: 1, date: 1 }, { unique: true });
habitLogSchema.index({ user: 1, date: 1 });

export const Habit = mongoose.model('Habit', habitSchema);
export const HabitLog = mongoose.model('HabitLog', habitLogSchema);
