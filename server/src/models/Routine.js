import mongoose from 'mongoose';
import { ROUTINE_TYPES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const stepSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  durationMin: { type: Number, min: 0, max: 600, default: 5 },
  // Optional behaviour link: checking the step also checks in the habit for the day.
  habit: { type: ObjectId, ref: 'Habit', default: null },
});

const routineSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: ROUTINE_TYPES, default: 'custom' },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    timeOfDay: { type: String, default: null },
    // Scheduled weekdays (0 = Sunday). Empty means every day.
    days: { type: [Number], default: [] },
    steps: { type: [stepSchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const routineLogSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    routine: { type: ObjectId, ref: 'Routine', required: true },
    date: { type: String, required: true },
    completedSteps: { type: [ObjectId], default: [] },
    skippedSteps: { type: [ObjectId], default: [] },
  },
  { timestamps: true },
);
routineLogSchema.index({ routine: 1, date: 1 }, { unique: true });
routineLogSchema.index({ user: 1, date: 1 });

export const Routine = mongoose.model('Routine', routineSchema);
export const RoutineLog = mongoose.model('RoutineLog', routineLogSchema);
