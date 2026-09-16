import mongoose from 'mongoose';
import { AI_ACTION_TYPES, AI_MODES, ENTITY_TYPES } from '../constants.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const conversationSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    title: { type: String, trim: true, maxlength: 120, default: 'New conversation' },
    // Optional entity the conversation is anchored to (e.g. asking about a note).
    context: { type: { type: String, enum: ENTITY_TYPES }, id: ObjectId },
    // "Remember conversations" off → hidden from history and deleted automatically after an hour.
    ephemeral: { type: Boolean, default: false },
    expiresAt: { type: Date, default: null },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
conversationSchema.index({ user: 1, lastMessageAt: -1 });
conversationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const proposedActionSchema = new mongoose.Schema({
  type: { type: String, enum: AI_ACTION_TYPES, required: true },
  payload: { type: Mixed, required: true },
  // Server-written summary (never the model's wording) and before/after preview for updates.
  summary: { type: String, maxlength: 300, default: '' },
  preview: { type: Mixed, default: null },
  status: { type: String, enum: ['proposed', 'executed', 'rejected', 'failed'], default: 'proposed' },
  resultId: { type: ObjectId, default: null },
  error: { type: String, default: null },
  decidedAt: { type: Date, default: null },
});

const rejectedActionSchema = new mongoose.Schema({ type: { type: String }, reason: { type: String } }, { _id: false });

const messageSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    conversation: { type: ObjectId, ref: 'AIConversation', required: true },
    role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
    content: { type: String, maxlength: 40000, default: '' },
    mode: { type: String, enum: AI_MODES, default: null },
    // Which modules were consulted, and which were requested but blocked by permissions.
    sources: { type: [String], default: [] },
    denied: { type: [String], default: [] },
    actions: { type: [proposedActionSchema], default: [] },
    rejectedActions: { type: [rejectedActionSchema], default: [] },
    provider: { type: String, default: null },
    model: { type: String, default: null },
    usage: { input: Number, output: Number },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);
messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const insightSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['daily_brief', 'weekly_review', 'module'], required: true },
    // Period key: a date for daily briefs, a week-start date for reviews.
    period: { type: String, required: true },
    module: { type: String, default: null },
    content: { type: String, maxlength: 20000, default: '' },
    // Hash of the facts the narrative was written from; a change invalidates the cache.
    factsHash: { type: String, default: null },
    data: { type: Mixed, default: undefined },
    provider: { type: String, default: null },
    model: { type: String, default: null },
  },
  { timestamps: true },
);
insightSchema.index({ user: 1, kind: 1, period: 1, module: 1 }, { unique: true });

export const AIConversation = mongoose.model('AIConversation', conversationSchema);
export const AIMessage = mongoose.model('AIMessage', messageSchema);
export const AIInsight = mongoose.model('AIInsight', insightSchema);
