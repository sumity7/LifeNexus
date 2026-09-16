import mongoose from 'mongoose';
import { COLORS } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const folderSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    color: { type: String, enum: COLORS, default: 'slate' },
  },
  { timestamps: true },
);
folderSchema.index({ user: 1, name: 1 }, { unique: true });

const noteSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 200, default: '' },
    // Sanitized HTML produced by the rich-text editor.
    content: { type: String, maxlength: 200_000, default: '' },
    // Plain-text projection of `content`, used for search and previews.
    plainText: { type: String, default: '' },
    folder: { type: ObjectId, ref: 'Folder', default: null },
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);
noteSchema.index({ user: 1, pinned: -1, updatedAt: -1 });
noteSchema.index({ user: 1, folder: 1 });

export const Folder = mongoose.model('Folder', folderSchema);
export const Note = mongoose.model('Note', noteSchema);
