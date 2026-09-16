import mongoose from 'mongoose';
import { INTENSITIES, WORKOUT_TYPES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const healthLogSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    waterMl: { type: Number, min: 0, max: 20000, default: 0 },
    sleepHours: { type: Number, min: 0, max: 24, default: null },
    sleepQuality: { type: Number, min: 1, max: 5, default: null },
    mood: { type: Number, min: 1, max: 5, default: null },
    energy: { type: Number, min: 1, max: 5, default: null },
    weightKg: { type: Number, min: 1, max: 700, default: null },
    steps: { type: Number, min: 0, max: 200000, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);
healthLogSchema.index({ user: 1, date: 1 }, { unique: true });

const workoutSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    type: { type: String, enum: WORKOUT_TYPES, default: 'other' },
    title: { type: String, trim: true, maxlength: 100, default: '' },
    durationMin: { type: Number, required: true, min: 1, max: 1440 },
    intensity: { type: String, enum: INTENSITIES, default: 'moderate' },
    calories: { type: Number, min: 0, max: 20000, default: null },
    distanceKm: { type: Number, min: 0, max: 1000, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { timestamps: true },
);
workoutSchema.index({ user: 1, date: -1 });

export const HealthLog = mongoose.model('HealthLog', healthLogSchema);
export const Workout = mongoose.model('Workout', workoutSchema);
