import mongoose from 'mongoose';
import { PRIORITIES, RECURRENCE, TASK_STATUSES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const subtaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  done: { type: Boolean, default: false },
});

const taskSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 5000, default: '' },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    dueDate: { type: String, default: null },
    dueTime: { type: String, default: null },
    tags: { type: [String], default: [] },
    subtasks: { type: [subtaskSchema], default: [] },
    recurrence: {
      freq: { type: String, enum: RECURRENCE, default: 'none' },
      interval: { type: Number, min: 1, max: 365, default: 1 },
    },
    goal: { type: ObjectId, ref: 'Goal', default: null },
    milestone: { type: ObjectId, default: null },
    project: { type: ObjectId, ref: 'Project', default: null },
    completedAt: { type: Date, default: null },
    completedOn: { type: String, default: null },
    // Set once a recurring task has spawned its next occurrence, so re-toggling can't duplicate it.
    spawnedNext: { type: Boolean, default: false },
  },
  { timestamps: true },
);

taskSchema.index({ user: 1, status: 1, dueDate: 1 });
taskSchema.index({ user: 1, goal: 1 });
taskSchema.index({ user: 1, project: 1 });
taskSchema.index({ user: 1, completedOn: 1 });

export const Task = mongoose.model('Task', taskSchema);
