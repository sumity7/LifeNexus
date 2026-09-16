import { Account, Budget, RecurringTransaction, SavingsGoal, Subscription, Transaction } from '../models/Finance.js';
import { Goal } from '../models/Goal.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../validators/common.js';
import { addMonths, monthRange, nextOccurrence, serverToday } from '../utils/dates.js';
import { getMonthSummary } from '../services/finance.js';
import { logActivity } from '../services/activity.js';
import { LIABILITY_ACCOUNT_TYPES } from '../constants.js';
import { findOwned, round2, toObjectId } from './helpers.js';

async function assertAccount(userId, accountId) {
  if (accountId && !(await Account.exists({ _id: accountId, user: userId }))) throw new AppError(400, 'Account not found');
}
async function assertSavingsGoal(userId, id) {
  if (id && !(await SavingsGoal.exists({ _id: id, user: userId }))) throw new AppError(400, 'Savings goal not found');
}

const FREQ_TO_RECURRENCE = { weekly: 'weekly', monthly: 'monthly', quarterly: 'monthly', yearly: 'yearly' };
const advance = (date, frequency) => nextOccurrence(date, FREQ_TO_RECURRENCE[frequency], frequency === 'quarterly' ? 3 : 1);

/**
 * Posts any due recurring transactions (auto-post on) as real transactions and
 * rolls their next date forward. Idempotent and safe to call on every read.
 */
export async function postDueRecurring(userId, today = serverToday()) {
  const due = await RecurringTransaction.find({ user: userId, active: true, autoPost: true, nextDate: { $lte: today } });
  let posted = 0;
  for (const rule of due) {
    for (let i = 0; rule.nextDate <= today && i < 36; i++) {
      await Transaction.create({
        user: userId, type: rule.type, amount: rule.amount, category: rule.category,
        description: rule.description || rule.category, date: rule.nextDate, account: rule.account, recurring: rule._id,
      });
      rule.nextDate = advance(rule.nextDate, rule.frequency);
      posted++;
    }
    await rule.save();
  }
  return posted;
}

/* ───── Transactions ───── */

export async function listTransactions(req, res) {
  const { month, from, to, type, category, account, q, limit = 500 } = req.valid.query;
  await postDueRecurring(req.user.id);
  const filter = { user: req.user.id };
  if (month) {
    const { start, end } = monthRange(month);
    filter.date = { $gte: start, $lte: end };
  } else if (from || to) {
    filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  }
  if (type) filter.type = type;
  if (account) filter.account = account;
  if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ description: rx }, { category: rx }];
  }
  const data = await Transaction.find(filter).sort({ date: -1, createdAt: -1 }).limit(limit).populate('account', 'name type color').lean();
  res.json({ data });
}

export async function createTransaction(req, res) {
  await Promise.all([assertAccount(req.user.id, req.valid.body.account), assertSavingsGoal(req.user.id, req.valid.body.savingsGoal)]);
  const tx = await Transaction.create({ ...req.valid.body, user: req.user.id });
  await applyAccountDelta(req.user.id, tx, +1);
  await logActivity(req.user.id, 'transaction_created', {
    entityType: 'transaction', entityId: tx._id, title: tx.description || tx.category, date: tx.date,
    meta: { amount: tx.amount, type: tx.type, category: tx.category },
  });
  res.status(201).json({ data: tx });
}

export async function updateTransaction(req, res) {
  const tx = await findOwned(Transaction, req.valid.params.id, req.user.id, 'Transaction');
  await Promise.all([assertAccount(req.user.id, req.valid.body.account), assertSavingsGoal(req.user.id, req.valid.body.savingsGoal)]);
  await applyAccountDelta(req.user.id, tx, -1);
  tx.set(req.valid.body);
  await tx.save();
  await applyAccountDelta(req.user.id, tx, +1);
  res.json({ data: tx });
}

export async function deleteTransaction(req, res) {
  const tx = await findOwned(Transaction, req.valid.params.id, req.user.id, 'Transaction');
  await applyAccountDelta(req.user.id, tx, -1);
  await tx.deleteOne();
  res.status(204).end();
}

/** Keeps account balances in step with their transactions (income adds, expenses subtract; liabilities inverted). */
async function applyAccountDelta(userId, tx, sign) {
  if (!tx.account) return;
  const account = await Account.findOne({ _id: tx.account, user: userId });
  if (!account) return;
  const liability = LIABILITY_ACCOUNT_TYPES.includes(account.type);
  const direction = (tx.type === 'income' ? 1 : -1) * (liability ? -1 : 1) * sign;
  account.balance = Math.max(0, round2(account.balance + direction * tx.amount));
  await account.save();
}

/* ───── Budgets ───── */

export async function listBudgets(req, res) {
  res.json({ data: await Budget.find({ user: req.user.id }).sort({ category: 1 }).lean() });
}

export async function createBudget(req, res) {
  const budget = await Budget.create({ ...req.valid.body, user: req.user.id });
  await logActivity(req.user.id, 'budget_updated', { entityType: 'budget', entityId: budget._id, title: `${budget.category} budget` });
  res.status(201).json({ data: budget });
}

export async function updateBudget(req, res) {
  const budget = await findOwned(Budget, req.valid.params.id, req.user.id, 'Budget');
  budget.set(req.valid.body);
  await budget.save();
  await logActivity(req.user.id, 'budget_updated', { entityType: 'budget', entityId: budget._id, title: `${budget.category} budget` });
  res.json({ data: budget });
}

export async function deleteBudget(req, res) {
  const budget = await findOwned(Budget, req.valid.params.id, req.user.id, 'Budget');
  await budget.deleteOne();
  res.status(204).end();
}

/* ───── Accounts & net worth ───── */

export async function listAccounts(req, res) {
  const accounts = await Account.find({ user: req.user.id }).sort({ archived: 1, name: 1 }).lean();
  res.json({ data: accounts, meta: netWorth(accounts) });
}

export function netWorth(accounts) {
  const active = accounts.filter((a) => !a.archived);
  const assets = round2(active.filter((a) => !LIABILITY_ACCOUNT_TYPES.includes(a.type)).reduce((s, a) => s + a.balance, 0));
  const liabilities = round2(active.filter((a) => LIABILITY_ACCOUNT_TYPES.includes(a.type)).reduce((s, a) => s + a.balance, 0));
  return { assets, liabilities, netWorth: round2(assets - liabilities) };
}

export async function createAccount(req, res) {
  const account = await Account.create({ ...req.valid.body, user: req.user.id });
  res.status(201).json({ data: account });
}

export async function updateAccount(req, res) {
  const account = await findOwned(Account, req.valid.params.id, req.user.id, 'Account');
  account.set(req.valid.body);
  await account.save();
  res.json({ data: account });
}

export async function deleteAccount(req, res) {
  const account = await findOwned(Account, req.valid.params.id, req.user.id, 'Account');
  await account.deleteOne();
  await Transaction.updateMany({ user: req.user.id, account: account._id }, { $set: { account: null } });
  await RecurringTransaction.updateMany({ user: req.user.id, account: account._id }, { $set: { account: null } });
  res.status(204).end();
}

/* ───── Recurring transactions ───── */

export async function listRecurring(req, res) {
  await postDueRecurring(req.user.id);
  res.json({ data: await RecurringTransaction.find({ user: req.user.id }).sort({ active: -1, nextDate: 1 }).populate('account', 'name').lean() });
}

export async function createRecurring(req, res) {
  await assertAccount(req.user.id, req.valid.body.account);
  const rule = await RecurringTransaction.create({ ...req.valid.body, user: req.user.id });
  res.status(201).json({ data: rule });
}

export async function updateRecurring(req, res) {
  const rule = await findOwned(RecurringTransaction, req.valid.params.id, req.user.id, 'Recurring transaction');
  await assertAccount(req.user.id, req.valid.body.account);
  rule.set(req.valid.body);
  await rule.save();
  res.json({ data: rule });
}

export async function deleteRecurring(req, res) {
  const rule = await findOwned(RecurringTransaction, req.valid.params.id, req.user.id, 'Recurring transaction');
  await rule.deleteOne();
  res.status(204).end();
}

/* ───── Subscriptions ───── */

const MONTHLY_FACTOR = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 };

export async function listSubscriptions(req, res) {
  const today = serverToday();
  const subs = await Subscription.find({ user: req.user.id }).sort({ active: -1, nextPayment: 1 }).lean();
  // Roll past renewal dates forward so "next payment" is always upcoming.
  for (const s of subs) {
    if (s.active && s.nextPayment < today) {
      let next = s.nextPayment;
      for (let i = 0; next < today && i < 120; i++) next = advance(next, s.frequency);
      await Subscription.updateOne({ _id: s._id }, { $set: { nextPayment: next } });
      s.nextPayment = next;
    }
  }
  const monthly = round2(subs.filter((s) => s.active).reduce((sum, s) => sum + s.amount * MONTHLY_FACTOR[s.frequency], 0));
  res.json({ data: subs, meta: { monthlyTotal: monthly, yearlyTotal: round2(monthly * 12) } });
}

export async function createSubscription(req, res) {
  const sub = await Subscription.create({ ...req.valid.body, user: req.user.id });
  res.status(201).json({ data: sub });
}

export async function updateSubscription(req, res) {
  const sub = await findOwned(Subscription, req.valid.params.id, req.user.id, 'Subscription');
  sub.set(req.valid.body);
  await sub.save();
  res.json({ data: sub });
}

export async function deleteSubscription(req, res) {
  const sub = await findOwned(Subscription, req.valid.params.id, req.user.id, 'Subscription');
  await sub.deleteOne();
  res.status(204).end();
}

/* ───── Savings goals ───── */

function decorateSavings(goal, today) {
  const plain = typeof goal.toJSON === 'function' ? goal.toJSON() : goal;
  const remaining = Math.max(0, round2(plain.targetAmount - plain.currentAmount));
  const monthsLeft = plain.monthlyContribution > 0 ? Math.ceil(remaining / plain.monthlyContribution) : null;
  return {
    ...plain,
    progress: Math.min(100, Math.round((plain.currentAmount / plain.targetAmount) * 100)),
    remaining,
    monthsLeft,
    estimatedCompletion: remaining === 0 ? today : monthsLeft !== null ? addMonths(today, monthsLeft) : null,
  };
}

export async function listSavingsGoals(req, res) {
  const today = serverToday();
  const goals = await SavingsGoal.find({ user: req.user.id }).sort({ completedAt: 1, deadline: 1 }).populate('goal', 'title color').lean();
  res.json({ data: goals.map((g) => decorateSavings(g, today)) });
}

async function assertGoalRef(userId, goalId) {
  if (goalId && !(await Goal.exists({ _id: goalId, user: userId }))) throw new AppError(400, 'Linked goal not found');
}

export async function createSavingsGoal(req, res) {
  await assertGoalRef(req.user.id, req.valid.body.goal);
  const goal = await SavingsGoal.create({ ...req.valid.body, user: req.user.id });
  res.status(201).json({ data: decorateSavings(goal, serverToday()) });
}

export async function updateSavingsGoal(req, res) {
  const goal = await findOwned(SavingsGoal, req.valid.params.id, req.user.id, 'Savings goal');
  await assertGoalRef(req.user.id, req.valid.body.goal);
  goal.set(req.valid.body);
  goal.completedAt = goal.currentAmount >= goal.targetAmount ? goal.completedAt ?? new Date() : null;
  await goal.save();
  res.json({ data: decorateSavings(goal, serverToday()) });
}

/** Records a contribution as an expense transaction (category "Savings") and increases the goal. */
export async function contributeSavings(req, res) {
  const goal = await findOwned(SavingsGoal, req.valid.params.id, req.user.id, 'Savings goal');
  const { amount, date = serverToday(), account = null } = req.valid.body;
  await assertAccount(req.user.id, account);
  const tx = await Transaction.create({ user: req.user.id, type: 'expense', amount, category: 'Savings', description: `Contribution · ${goal.title}`, date, account, savingsGoal: goal._id });
  await applyAccountDelta(req.user.id, tx, +1);
  goal.currentAmount = round2(goal.currentAmount + amount);
  if (goal.currentAmount >= goal.targetAmount && !goal.completedAt) goal.completedAt = new Date();
  await goal.save();
  await logActivity(req.user.id, 'transaction_created', { entityType: 'transaction', entityId: tx._id, title: tx.description, date, meta: { amount, type: 'expense', category: 'Savings' } });
  res.json({ data: decorateSavings(goal, serverToday()) });
}

export async function deleteSavingsGoal(req, res) {
  const goal = await findOwned(SavingsGoal, req.valid.params.id, req.user.id, 'Savings goal');
  await goal.deleteOne();
  await Transaction.updateMany({ user: req.user.id, savingsGoal: goal._id }, { $set: { savingsGoal: null } });
  res.status(204).end();
}

/* ───── Summary ───── */

export async function getSummary(req, res) {
  const month = req.valid.query.month ?? serverToday().slice(0, 7);
  await postDueRecurring(req.user.id);
  const [summary, accounts, subs, savings] = await Promise.all([
    getMonthSummary(req.user.id, month),
    Account.find({ user: req.user.id }).lean(),
    Subscription.find({ user: req.user.id, active: true }).lean(),
    SavingsGoal.find({ user: toObjectId(req.user.id) }).lean(),
  ]);
  const today = serverToday();
  res.json({
    data: {
      ...summary,
      netWorth: netWorth(accounts),
      subscriptionsMonthly: round2(subs.reduce((s, x) => s + x.amount * MONTHLY_FACTOR[x.frequency], 0)),
      savings: {
        count: savings.length,
        target: round2(savings.reduce((s, g) => s + g.targetAmount, 0)),
        current: round2(savings.reduce((s, g) => s + g.currentAmount, 0)),
        goals: savings.map((g) => decorateSavings(g, today)).slice(0, 4),
      },
    },
  });
}
