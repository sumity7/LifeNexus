import mongoose from 'mongoose';
import { ACCOUNT_TYPES, BILLING_FREQUENCIES, COLORS, TRANSACTION_TYPES } from '../constants.js';

const { ObjectId } = mongoose.Schema.Types;

const round2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
const money = (extra = {}) => ({ type: Number, min: 0, max: 1_000_000_000, set: round2, ...extra });

const transactionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    amount: { type: Number, required: true, min: 0.01, max: 1_000_000_000, set: round2 },
    category: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    date: { type: String, required: true },
    account: { type: ObjectId, ref: 'Account', default: null },
    recurring: { type: ObjectId, ref: 'RecurringTransaction', default: null },
    savingsGoal: { type: ObjectId, ref: 'SavingsGoal', default: null },
  },
  { timestamps: true },
);
transactionSchema.index({ user: 1, date: -1 });
transactionSchema.index({ user: 1, account: 1 });

const budgetSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    category: { type: String, required: true, trim: true, maxlength: 40 },
    limit: { type: Number, required: true, min: 1, max: 1_000_000_000, set: round2 },
  },
  { timestamps: true },
);
budgetSchema.index({ user: 1, category: 1 }, { unique: true });

const accountSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: { type: String, enum: ACCOUNT_TYPES, required: true },
    // Current balance entered by the user (positive = asset balance, or amount owed for liabilities).
    balance: money({ default: 0 }),
    color: { type: String, enum: COLORS, default: 'blue' },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);
accountSchema.index({ user: 1, name: 1 }, { unique: true });

const recurringSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    amount: { type: Number, required: true, min: 0.01, max: 1_000_000_000, set: round2 },
    category: { type: String, required: true, trim: true, maxlength: 40 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    frequency: { type: String, enum: BILLING_FREQUENCIES, default: 'monthly' },
    nextDate: { type: String, required: true },
    account: { type: ObjectId, ref: 'Account', default: null },
    active: { type: Boolean, default: true },
    autoPost: { type: Boolean, default: true },
  },
  { timestamps: true },
);
recurringSchema.index({ user: 1, active: 1, nextDate: 1 });

const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    amount: { type: Number, required: true, min: 0.01, max: 1_000_000_000, set: round2 },
    frequency: { type: String, enum: BILLING_FREQUENCIES, default: 'monthly' },
    nextPayment: { type: String, required: true },
    category: { type: String, trim: true, maxlength: 40, default: 'Subscriptions' },
    notes: { type: String, trim: true, maxlength: 300, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
subscriptionSchema.index({ user: 1, active: 1, nextPayment: 1 });

const savingsGoalSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    targetAmount: { type: Number, required: true, min: 1, max: 1_000_000_000, set: round2 },
    currentAmount: money({ default: 0 }),
    monthlyContribution: money({ default: 0 }),
    deadline: { type: String, default: null },
    color: { type: String, enum: COLORS, default: 'teal' },
    goal: { type: ObjectId, ref: 'Goal', default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
export const Budget = mongoose.model('Budget', budgetSchema);
export const Account = mongoose.model('Account', accountSchema);
export const RecurringTransaction = mongoose.model('RecurringTransaction', recurringSchema);
export const Subscription = mongoose.model('Subscription', subscriptionSchema);
export const SavingsGoal = mongoose.model('SavingsGoal', savingsGoalSchema);
