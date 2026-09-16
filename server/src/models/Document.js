import mongoose from 'mongoose';
import { DOCUMENT_CATEGORIES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const documentSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 120 },
    size: { type: Number, required: true, min: 0 },
    // Opaque storage key (never derived from user input). Only the storage provider resolves it.
    storageKey: { type: String, required: true, select: false },
    sha256: { type: String, default: null },
    category: { type: String, enum: DOCUMENT_CATEGORIES, default: 'other' },
    tags: { type: [String], default: [] },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    metadata: { type: Map, of: String, default: undefined },
    expiryDate: { type: String, default: null },
    remindDaysBefore: { type: Number, min: 0, max: 365, default: null },
    reminder: { type: ObjectId, ref: 'Reminder', default: null },
    favorite: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    // Populated by the extraction provider when one is configured; never fabricated.
    extraction: {
      status: { type: String, enum: ['none', 'pending', 'done', 'failed', 'unavailable'], default: 'none' },
      text: { type: String, default: '', select: false },
      summary: { type: String, default: '' },
      provider: { type: String, default: null },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true },
);
documentSchema.index({ user: 1, archived: 1, category: 1 });
documentSchema.index({ user: 1, expiryDate: 1 });

export const Document = mongoose.model('Document', documentSchema);
