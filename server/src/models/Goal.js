import mongoose from 'mongoose';
import { COLORS, GOAL_CATEGORIES, GOAL_STATUSES } from '../constants.js';

const milestoneSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  dueDate: { type: String, default: null },
  done: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
});

const goalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    category: { type: String, enum: GOAL_CATEGORIES, default: 'personal' },
    status: { type: String, enum: GOAL_STATUSES, default: 'active' },
    color: { type: String, enum: COLORS, default: 'indigo' },
    startDate: { type: String, default: null },
    deadline: { type: String, default: null },
    milestones: { type: [milestoneSchema], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Goal = mongoose.model('Goal', goalSchema);
