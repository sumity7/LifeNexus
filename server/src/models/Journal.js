import mongoose from 'mongoose';

/**
 * One reflective entry per day. Mood and energy are NOT stored here — they live
 * on HealthLog for the same date so Journal and Health share a single record.
 */
const journalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    title: { type: String, trim: true, maxlength: 200, default: '' },
    content: { type: String, maxlength: 20000, default: '' },
    wins: { type: [String], default: [] },
    challenges: { type: [String], default: [] },
    gratitude: { type: [String], default: [] },
    lessons: { type: String, trim: true, maxlength: 2000, default: '' },
    intention: { type: String, trim: true, maxlength: 500, default: '' },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);
journalSchema.index({ user: 1, date: 1 }, { unique: true });

export const JournalEntry = mongoose.model('JournalEntry', journalSchema);
