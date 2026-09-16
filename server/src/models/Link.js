import mongoose from 'mongoose';
import { ENTITY_TYPES } from '../constants.js';

const endpoint = {
  type: { type: String, enum: ENTITY_TYPES, required: true },
  id: { type: mongoose.Schema.Types.ObjectId, required: true },
};

/**
 * Generic, undirected relationship between two entities owned by the same user
 * (the "context layer" of the Life Graph). Stored once with endpoints sorted so
 * A–B and B–A are the same edge.
 */
const linkSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    a: endpoint,
    b: endpoint,
    note: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { timestamps: true },
);
linkSchema.index({ user: 1, 'a.type': 1, 'a.id': 1, 'b.type': 1, 'b.id': 1 }, { unique: true });
linkSchema.index({ user: 1, 'b.id': 1 });

export const Link = mongoose.model('Link', linkSchema);
