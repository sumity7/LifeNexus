import mongoose from 'mongoose';
import { FOCUS_MODES, FOCUS_STATUSES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const focusSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    mode: { type: String, enum: FOCUS_MODES, default: 'pomodoro' },
    status: { type: String, enum: FOCUS_STATUSES, default: 'running' },
    label: { type: String, trim: true, maxlength: 200, default: '' },
    plannedMinutes: { type: Number, min: 1, max: 480, required: true },
    // Accumulated focused seconds (pauses excluded), finalized on complete/abandon.
    focusedSeconds: { type: Number, min: 0, default: 0 },
    startedAt: { type: Date, required: true },
    lastResumedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    date: { type: String, required: true },
    task: { type: ObjectId, ref: 'Task', default: null },
    goal: { type: ObjectId, ref: 'Goal', default: null },
    project: { type: ObjectId, ref: 'Project', default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);
focusSchema.index({ user: 1, date: -1 });
focusSchema.index({ user: 1, status: 1 });

export const FocusSession = mongoose.model('FocusSession', focusSchema);
