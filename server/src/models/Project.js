import mongoose from 'mongoose';
import { COLORS, PROJECT_STATUSES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

/** Goal → Project → Task. A project groups the concrete work toward a goal (or stands alone). */
const projectSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    goal: { type: ObjectId, ref: 'Goal', default: null },
    status: { type: String, enum: PROJECT_STATUSES, default: 'active' },
    color: { type: String, enum: COLORS, default: 'indigo' },
    startDate: { type: String, default: null },
    dueDate: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
projectSchema.index({ user: 1, goal: 1 });

export const Project = mongoose.model('Project', projectSchema);
