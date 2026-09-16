import mongoose from 'mongoose';
import { COLORS, RECURRENCE } from '../constants.js';

const eventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    location: { type: String, trim: true, maxlength: 200, default: '' },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    allDay: { type: Boolean, default: false },
    color: { type: String, enum: COLORS, default: 'blue' },
    recurrence: {
      freq: { type: String, enum: RECURRENCE, default: 'none' },
      interval: { type: Number, min: 1, max: 365, default: 1 },
      until: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

eventSchema.index({ user: 1, start: 1 });

export const Event = mongoose.model('Event', eventSchema);
