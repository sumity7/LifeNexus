import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ACCENTS, AI_SCOPES, CURRENCIES, DASHBOARD_WIDGETS, NOTIFICATION_PREFS, THEMES } from '../constants.js';

const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;

const widgetSchema = new mongoose.Schema(
  { id: { type: String, enum: DASHBOARD_WIDGETS, required: true }, visible: { type: Boolean, default: true } },
  { _id: false },
);

const boolMap = (keys, defaultValue = true) =>
  new mongoose.Schema(Object.fromEntries(keys.map((k) => [k, { type: Boolean, default: defaultValue }])), { _id: false });

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    preferences: {
      theme: { type: String, enum: THEMES, default: 'system' },
      accent: { type: String, enum: ACCENTS, default: 'indigo' },
      currency: { type: String, enum: CURRENCIES, default: 'USD' },
      language: { type: String, default: 'en', maxlength: 10 },
      timezone: { type: String, default: '', maxlength: 64 },
      weekStartsOn: { type: Number, enum: [0, 1], default: 1 },
      waterGoalMl: { type: Number, min: 250, max: 10000, default: 2500 },
      sleepGoalHours: { type: Number, min: 3, max: 14, default: 8 },
      targetWeightKg: { type: Number, min: 1, max: 700, default: null },
      focusMinutes: { type: Number, min: 5, max: 180, default: 25 },
      breakMinutes: { type: Number, min: 1, max: 60, default: 5 },
      dashboardWidgets: {
        type: [widgetSchema],
        default: () => DASHBOARD_WIDGETS.map((id) => ({ id, visible: true })),
      },
      notifications: { type: boolMap(NOTIFICATION_PREFS), default: () => ({}) },
      ai: {
        enabled: { type: Boolean, default: true },
        scopes: { type: boolMap(AI_SCOPES), default: () => ({}) },
        // When false, conversations are not persisted beyond the current request.
        rememberConversations: { type: Boolean, default: true },
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

userSchema.methods.setPassword = async function setPassword(password) {
  this.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

export const User = mongoose.model('User', userSchema);
