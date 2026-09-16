import { Budget, Transaction } from '../models/Finance.js';
import { addMonthsToMonth, monthRange } from '../utils/dates.js';
import { round2, toObjectId } from '../controllers/helpers.js';

/** Monthly totals, category breakdown, budgets and a 6-month trend ending at `month`. */
export async function getMonthSummary(userId, month, { trendMonths = 6 } = {}) {
  const user = toObjectId(userId);
  const { start, end } = monthRange(month);
  const trendStart = monthRange(addMonthsToMonth(month, -(trendMonths - 1))).start;

  const [[agg], budgets] = await Promise.all([
    Transaction.aggregate([
      { $match: { user, date: { $gte: trendStart, $lte: end } } },
      {
        $facet: {
          byMonth: [
            {
              $group: {
                _id: { month: { $substrCP: ['$date', 0, 7] }, type: '$type' },
                total: { $sum: '$amount' },
              },
            },
          ],
          byCategory: [
            { $match: { date: { $gte: start, $lte: end } } },
            // Categories are free text, so group case-insensitively and keep the first spelling for display.
            {
              $group: {
                _id: { category: { $toLower: '$category' }, type: '$type' },
                label: { $first: '$category' },
                total: { $sum: '$amount' },
                count: { $sum: 1 },
              },
            },
            { $sort: { total: -1 } },
          ],
        },
      },
    ]),
    Budget.find({ user }).sort({ category: 1 }).lean(),
  ]);

  const monthly = new Map();
  for (const row of agg.byMonth) {
    const entry = monthly.get(row._id.month) ?? { income: 0, expense: 0 };
    entry[row._id.type] += row.total;
    monthly.set(row._id.month, entry);
  }
  const trend = Array.from({ length: trendMonths }, (_, i) => {
    const m = addMonthsToMonth(month, i - (trendMonths - 1));
    const { income = 0, expense = 0 } = monthly.get(m) ?? {};
    return { month: m, income: round2(income), expense: round2(expense), net: round2(income - expense) };
  });

  const current = trend[trend.length - 1];
  const previous = trend[trend.length - 2] ?? { income: 0, expense: 0, net: 0 };

  const expenseByCategory = agg.byCategory
    .filter((r) => r._id.type === 'expense')
    .map((r) => ({ category: r.label, total: round2(r.total), count: r.count }));
  const incomeByCategory = agg.byCategory
    .filter((r) => r._id.type === 'income')
    .map((r) => ({ category: r.label, total: round2(r.total), count: r.count }));

  const spentBy = new Map(expenseByCategory.map((c) => [c.category.toLowerCase(), c.total]));
  const budgetRows = budgets.map((b) => {
    const spent = spentBy.get(b.category.toLowerCase()) ?? 0;
    return {
      ...b,
      spent,
      remaining: round2(b.limit - spent),
      pct: Math.round((spent / b.limit) * 100),
    };
  });

  return {
    month,
    income: current.income,
    expense: current.expense,
    net: current.net,
    savingsRate: current.income > 0 ? Math.round((current.net / current.income) * 100) : null,
    previous: { income: previous.income, expense: previous.expense, net: previous.net },
    expenseByCategory,
    incomeByCategory,
    budgets: budgetRows,
    trend,
  };
}
