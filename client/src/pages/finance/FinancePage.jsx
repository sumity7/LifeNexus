import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { addMonths, format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Landmark, PiggyBank, Plus, Receipt, Repeat, Search, Sparkles, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, IconButton, Input, PageHeader, ProgressBar, Segmented, Select, Skeleton, SkeletonList, StatTile, Tabs,
} from '../../components/ui';
import { ChartCard } from '../../components/ChartCard';
import { FormModal } from '../../components/FormModal';
import { RankList } from '../../components/RankList';
import { BAR_PROPS, ChartLegend, ChartTooltip, useChartTheme } from '../../components/charts';
import { useAccounts, useContributeSavings, useFinanceSummary, useRecurring, useSavingsGoals, useSubscriptions, useTransactions } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { useDebounce } from '../../hooks/useUtils';
import { ACCOUNT_META, BILLING_FREQUENCIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../lib/constants';
import { countdown, formatKey, fromKey, monthKey, relativeDay } from '../../lib/dates';
import { formatCurrency } from '../../lib/format';
import { useNavigate } from 'react-router-dom';

const TABS = ['overview', 'accounts', 'subscriptions', 'savings', 'recurring'];
const FREQ_LABEL = Object.fromEntries(BILLING_FREQUENCIES.map((f) => [f.value, f.label]));

function Delta({ current, previous, upIsGood }) {
  if (!previous) return <span>No data last month</span>;
  const change = Math.round(((current - previous) / previous) * 100);
  const good = change === 0 ? null : (change > 0) === upIsGood;
  const Icon = change >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={clsx(good === true && 'text-success', good === false && 'text-danger')}>
      <Icon aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} size={13} />
      {Math.abs(change)}% vs last month
    </span>
  );
}

export default function FinancePage() {
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') ?? '') ? params.get('month') : monthKey();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview';
  const monthDate = fromKey(`${month}-01`);
  const setMonth = (d) => setParams((p) => { const n = new URLSearchParams(p); n.set('month', format(d, 'yyyy-MM')); return n; }, { replace: true });
  const setTab = (t) => setParams((p) => { const n = new URLSearchParams(p); if (t === 'overview') n.delete('tab'); else n.set('tab', t); return n; }, { replace: true });

  const { user } = useAuth();
  const currency = user?.preferences?.currency ?? 'USD';
  const openEditor = useEditor();
  const navigate = useNavigate();
  const theme = useChartTheme();
  const money = (v, opts) => formatCurrency(v, currency, opts);

  const summary = useFinanceSummary(month);
  const [type, setType] = useState('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 250);
  const transactions = useTransactions({ month, type: type === 'all' ? undefined : type, category: category || undefined, q: q || undefined });

  const s = summary.data;
  const trend = useMemo(() => (s?.trend ?? []).map((t) => ({ ...t, label: format(fromKey(`${t.month}-01`), 'MMM') })), [s]);
  const categoryOptions = [...new Set([...(type !== 'income' ? EXPENSE_CATEGORIES : []), ...(type !== 'expense' ? INCOME_CATEGORIES : [])])];

  return (
    <div className="page page--wide">
      <PageHeader
        title="Finance"
        subtitle="Income, spending, budgets, accounts and savings — one picture of your money."
        actions={
          <>
            {tab === 'overview' && (
              <div className="row" style={{ gap: 2 }}>
                <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(addMonths(monthDate, -1))} />
                <span className="weight-medium" style={{ minWidth: 120, textAlign: 'center' }} aria-live="polite">{format(monthDate, 'MMMM yyyy')}</span>
                <IconButton icon={ChevronRight} label="Next month" onClick={() => setMonth(addMonths(monthDate, 1))} />
              </div>
            )}
            <Button icon={Sparkles} onClick={() => navigate('/ai?prompt=How%20much%20did%20I%20spend%20this%20month%20and%20where%3F')}>Ask AI</Button>
            <Button icon={Target} onClick={() => openEditor('budget')}>New budget</Button>
            <Button variant="primary" icon={Plus} onClick={() => openEditor('transaction', { defaults: { type: 'expense', date: month === monthKey() ? undefined : `${month}-01` } })}>
              Add transaction
            </Button>
          </>
        }
      />

      <Tabs
        label="Finance sections"
        value={tab}
        onChange={setTab}
        className="mb"
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'accounts', label: 'Accounts & net worth' },
          { value: 'subscriptions', label: 'Subscriptions' },
          { value: 'savings', label: 'Savings goals' },
          { value: 'recurring', label: 'Recurring' },
        ]}
      />
      <div style={{ height: 16 }} />

      {tab === 'accounts' && <AccountsTab money={money} />}
      {tab === 'subscriptions' && <SubscriptionsTab money={money} />}
      {tab === 'savings' && <SavingsTab money={money} />}
      {tab === 'recurring' && <RecurringTab money={money} />}
      {tab !== 'overview' ? null : summary.isError && !s ? (
        <Card><ErrorState error={summary.error} onRetry={() => summary.refetch()} /></Card>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            {!s ? (
              Array.from({ length: 4 }, (_, i) => <div key={i} className="card stat"><Skeleton width="40%" /><Skeleton height={24} width="60%" style={{ marginTop: 10 }} /></div>)
            ) : (
              <>
                <StatTile icon={TrendingUp} label="Income" value={money(s.income)} meta={<Delta current={s.income} previous={s.previous.income} upIsGood />} />
                <StatTile icon={TrendingDown} label="Expenses" value={money(s.expense)} meta={<Delta current={s.expense} previous={s.previous.expense} upIsGood={false} />} />
                <StatTile icon={Wallet} label="Net cash flow" value={<span className={clsx(s.net < 0 && 'text-danger')}>{money(s.net, { signed: true })}</span>} meta={`Last month ${money(s.previous.net, { signed: true })}`} />
                <StatTile icon={PiggyBank} label="Savings rate" value={s.savingsRate === null ? '—' : `${s.savingsRate}%`} meta="Share of income kept" />
                <StatTile icon={Landmark} label="Net worth" value={money(s.netWorth.netWorth, { compact: true })} meta={<button type="button" className="text-accent" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => setTab('accounts')}>{money(s.netWorth.assets, { compact: true })} assets · {money(s.netWorth.liabilities, { compact: true })} owed</button>} />
                <StatTile icon={Repeat} label="Subscriptions" value={money(s.subscriptionsMonthly)} meta={<button type="button" className="text-accent" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => setTab('subscriptions')}>per month · view all</button>} />
              </>
            )}
          </div>

          <div className="grid-2" style={{ marginBottom: 16 }}>
            <ChartCard
              title="Cash flow"
              subtitle="Last 6 months"
              legend={<ChartLegend items={[{ label: 'Income', color: theme.chart1 }, { label: 'Expenses', color: theme.chart2 }]} />}
              table={{
                columns: [
                  { key: 'label', label: 'Month' },
                  { key: 'income', label: 'Income', numeric: true, format: (v) => money(v) },
                  { key: 'expense', label: 'Expenses', numeric: true, format: (v) => money(v) },
                  { key: 'net', label: 'Net', numeric: true, format: (v) => money(v, { signed: true }) },
                ],
                rows: trend,
              }}
            >
              {!s ? (
                <Skeleton height="100%" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} barGap={2} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={theme.chartGrid} />
                    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} />
                    <YAxis tickLine={false} axisLine={false} tick={theme.axisTick} width={56} tickFormatter={(v) => money(v, { compact: true })} />
                    <Tooltip cursor={theme.cursorFill} content={<ChartTooltip valueFormatter={(v) => money(v)} labelFormatter={(_, p) => p?.[0] && format(fromKey(`${p[0].payload.month}-01`), 'MMMM yyyy')} />} />
                    <Bar dataKey="income" name="Income" fill={theme.chart1} {...BAR_PROPS} />
                    <Bar dataKey="expense" name="Expenses" fill={theme.chart2} {...BAR_PROPS} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <Card title="Spending by category" subtitle={format(monthDate, 'MMMM')}>
              {!s ? (
                <SkeletonList rows={5} />
              ) : s.expenseByCategory.length ? (
                <RankList items={s.expenseByCategory.map((c) => ({ key: c.category, label: c.category, value: c.total }))} formatValue={(v) => money(v)} />
              ) : (
                <EmptyState compact icon={Receipt} title="No expenses this month" />
              )}
            </Card>
          </div>
        </>
      )}

      {tab === 'overview' && <div className="split">
        <Card
          title="Transactions"
          subtitle={transactions.data ? `${transactions.data.length} in ${format(monthDate, 'MMMM')}` : undefined}
          flush
        >
          <div className="toolbar" style={{ padding: '4px 16px 0', marginBottom: 8 }}>
            <Segmented
              label="Transaction type"
              value={type}
              onChange={(v) => {
                setType(v);
                setCategory('');
              }}
              options={[{ value: 'all', label: 'All' }, { value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }]}
            />
            <Select size="sm" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="All categories" options={categoryOptions} aria-label="Filter by category" style={{ width: 160 }} />
            <div className="input-group" style={{ flex: '1 1 160px' }}>
              <Search aria-hidden="true" />
              <Input size="sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" aria-label="Search transactions" />
            </div>
          </div>
          {transactions.isPending ? (
            <SkeletonList rows={6} />
          ) : transactions.isError && !transactions.data ? (
            <ErrorState compact error={transactions.error} onRetry={() => transactions.refetch()} />
          ) : !transactions.data.length ? (
            <EmptyState
              icon={Receipt}
              title={q || category || type !== 'all' ? 'No matching transactions' : 'No transactions this month'}
              description="Log income and expenses to see where your money goes."
              action={<Button size="sm" icon={Plus} onClick={() => openEditor('transaction')}>Add transaction</Button>}
            />
          ) : (
            <div style={{ padding: '0 16px 16px', opacity: transactions.isPlaceholderData ? 0.6 : 1 }}>
              <div className="table-wrap" style={{ maxHeight: 520 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Description</th>
                      <th scope="col" className="desktop-only">Category</th>
                      <th scope="col" className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.data.map((t) => (
                      <tr
                        key={t._id}
                        className="is-clickable"
                        tabIndex={0}
                        onClick={() => openEditor('transaction', { item: t })}
                        onKeyDown={(e) => e.key === 'Enter' && openEditor('transaction', { item: t })}
                      >
                        <td className="muted tabular" style={{ whiteSpace: 'nowrap' }}>{formatKey(t.date, 'MMM d')}</td>
                        <td>
                          <div className="weight-medium">{t.description || t.category}</div>
                          <div className="text-xs muted mobile-only">{t.category}</div>
                        </td>
                        <td className="desktop-only muted">{t.category}</td>
                        <td className={clsx('num weight-medium', t.type === 'income' && 'text-success')} style={{ whiteSpace: 'nowrap' }}>
                          {t.type === 'income' ? '+' : '−'}{money(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>

        <div className="stack" style={{ gap: 16 }}>
          <Card title="Monthly budgets" icon={Target} actions={<IconButton icon={Plus} size="sm" label="New budget" onClick={() => openEditor('budget')} />}>
            {!s ? (
              <SkeletonList rows={4} />
            ) : !s.budgets.length ? (
              <EmptyState compact icon={Target} title="No budgets yet" description="Set monthly limits per category to stay on track." action={<Button size="sm" icon={Plus} onClick={() => openEditor('budget')}>Create budget</Button>} />
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                {s.budgets.map((b) => (
                  <button key={b._id} type="button" className="budget-item" onClick={() => openEditor('budget', { item: b })}>
                    <div className="row row--between text-sm">
                      <span className="weight-medium">{b.category}</span>
                      <span className="tabular">{money(b.spent)} <span className="muted">/ {money(b.limit)}</span></span>
                    </div>
                    <ProgressBar value={b.pct} tone={b.pct > 100 ? 'danger' : b.pct > 85 ? 'warning' : undefined} label={`${b.category}: ${b.pct}% of budget used`} />
                    <div className={clsx('text-xs', b.remaining < 0 ? 'text-danger' : 'muted')}>
                      {b.remaining < 0 ? `Over by ${money(-b.remaining)}` : `${money(b.remaining)} left · ${b.pct}% used`}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
          {s?.savings.goals.length > 0 && (
            <Card title="Savings goals" icon={PiggyBank} actions={<Button size="sm" variant="ghost" onClick={() => setTab('savings')}>View all</Button>}>
              <div className="stack" style={{ gap: 12 }}>
                {s.savings.goals.map((g) => (
                  <div key={g._id} className="stack stack--sm" style={{ gap: 5 }}>
                    <div className="row row--between text-sm"><span className="truncate">{g.title}</span><span className="tabular weight-medium">{g.progress}%</span></div>
                    <ProgressBar value={g.progress} color={g.color} size="sm" label={`${g.title} progress`} />
                    <p className="text-xs muted">{money(g.currentAmount)} of {money(g.targetAmount)}{g.estimatedCompletion && g.remaining > 0 ? ` · on track for ${formatKey(g.estimatedCompletion, 'MMM yyyy')}` : ''}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>}

      <style>{`
        .budget-item { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 10px; margin: 0 -10px; border: 0; border-radius: var(--radius); background: none; text-align: left; cursor: pointer; width: calc(100% + 20px); transition: background-color var(--dur-fast); }
        .budget-item:hover { background: var(--surface-hover); }
        .fin-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 16px; border: 0; background: none; text-align: left; cursor: pointer; }
        .fin-row:hover { background: var(--surface-hover); }
        .fin-row + .fin-row { border-top: 1px solid var(--divider); }
      `}</style>
    </div>
  );
}

function AccountsTab({ money }) {
  const accounts = useAccounts();
  const openEditor = useEditor();
  const list = accounts.data?.data ?? [];
  const nw = accounts.data?.meta;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stat-grid">
        {!nw ? Array.from({ length: 3 }, (_, i) => <div key={i} className="card stat"><Skeleton width="40%" /><Skeleton height={24} width="50%" style={{ marginTop: 10 }} /></div>) : (
          <>
            <StatTile icon={Landmark} label="Net worth" value={<span className={clsx(nw.netWorth < 0 && 'text-danger')}>{money(nw.netWorth)}</span>} meta="Assets minus liabilities" />
            <StatTile icon={TrendingUp} label="Assets" value={money(nw.assets)} meta="Bank, cash, savings, investments" />
            <StatTile icon={TrendingDown} label="Liabilities" value={money(nw.liabilities)} meta="Credit cards and loans" />
          </>
        )}
      </div>
      <Card title="Accounts" icon={Wallet} subtitle="Balances update automatically from transactions linked to an account" flush actions={<Button size="sm" icon={Plus} onClick={() => openEditor('account')}>Add account</Button>}>
        {accounts.isPending ? <SkeletonList rows={4} /> : accounts.isError ? <ErrorState compact error={accounts.error} onRetry={() => accounts.refetch()} /> : !list.length ? (
          <EmptyState compact icon={Wallet} title="No accounts yet" description="Add your bank, cash, cards and investments to see your net worth." action={<Button size="sm" icon={Plus} onClick={() => openEditor('account')}>Add account</Button>} />
        ) : list.map((a) => (
          <button key={a._id} type="button" className="fin-row" onClick={() => openEditor('account', { item: a })}>
            <span className={`dot color-${a.color}`} aria-hidden="true" />
            <span className="grow"><span className="text-sm weight-medium" style={{ display: 'block' }}>{a.name}{a.archived && <Badge style={{ marginLeft: 6 }}>Archived</Badge>}</span><span className="text-xs muted">{ACCOUNT_META[a.type]?.label}</span></span>
            <span className={clsx('text-sm weight-medium tabular', ACCOUNT_META[a.type]?.liability && 'text-danger')}>{ACCOUNT_META[a.type]?.liability ? '−' : ''}{money(a.balance)}</span>
          </button>
        ))}
      </Card>
    </div>
  );
}

function SubscriptionsTab({ money }) {
  const subs = useSubscriptions();
  const openEditor = useEditor();
  const list = subs.data?.data ?? [];
  const meta = subs.data?.meta;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stat-grid">
        {!meta ? Array.from({ length: 2 }, (_, i) => <div key={i} className="card stat"><Skeleton width="40%" /><Skeleton height={24} width="50%" style={{ marginTop: 10 }} /></div>) : (
          <>
            <StatTile icon={Repeat} label="Monthly cost" value={money(meta.monthlyTotal)} meta={`${list.filter((s) => s.active).length} active subscriptions`} />
            <StatTile icon={TrendingDown} label="Yearly cost" value={money(meta.yearlyTotal)} meta="Normalised across billing cycles" />
          </>
        )}
      </div>
      <Card title="Subscriptions" icon={Repeat} flush actions={<Button size="sm" icon={Plus} onClick={() => openEditor('subscription')}>Add subscription</Button>}>
        {subs.isPending ? <SkeletonList rows={4} /> : subs.isError ? <ErrorState compact error={subs.error} onRetry={() => subs.refetch()} /> : !list.length ? (
          <EmptyState compact icon={Repeat} title="No subscriptions tracked" description="Track streaming, software, gym and insurance renewals in one place." action={<Button size="sm" icon={Plus} onClick={() => openEditor('subscription')}>Add subscription</Button>} />
        ) : list.map((s) => (
          <button key={s._id} type="button" className="fin-row" onClick={() => openEditor('subscription', { item: s })}>
            <span className="icon-tile icon-tile--sm" aria-hidden="true"><Repeat /></span>
            <span className="grow"><span className="text-sm weight-medium" style={{ display: 'block' }}>{s.name}{!s.active && <Badge style={{ marginLeft: 6 }}>Paused</Badge>}</span><span className="text-xs muted">{s.category} · {FREQ_LABEL[s.frequency]}{s.active && ` · renews ${countdown(s.nextPayment)}`}</span></span>
            <span className="text-sm weight-medium tabular">{money(s.amount)}<span className="muted text-xs"> / {s.frequency === 'monthly' ? 'mo' : s.frequency === 'yearly' ? 'yr' : s.frequency === 'weekly' ? 'wk' : 'qtr'}</span></span>
          </button>
        ))}
      </Card>
    </div>
  );
}

function ContributeModal({ goal, money, onClose }) {
  const contribute = useContributeSavings();
  const accounts = useAccounts();
  const toast = useToast();
  const [amount, setAmount] = useState(String(goal.monthlyContribution || ''));
  const [account, setAccount] = useState('');
  const [error, setError] = useState(null);
  const submit = async () => {
    if (!(Number(amount) > 0)) return setError('Enter an amount greater than 0');
    try {
      await contribute.mutateAsync({ id: goal._id, amount: Number(amount), account: account || null });
      toast.success(`Added ${money(Number(amount))} to ${goal.title}`);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <FormModal title={`Contribute to ${goal.title}`} description="Recorded as a Savings expense so your cash flow stays accurate." size="sm" onClose={onClose} onSubmit={submit} submitLabel="Add contribution" submitting={contribute.isPending}>
      <Field label="Amount" error={error}><Input type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} data-autofocus /></Field>
      <Field label="From account" optional><Select value={account} onChange={(e) => setAccount(e.target.value)} placeholder="No account" options={(accounts.data?.data ?? []).filter((a) => !a.archived).map((a) => ({ value: a._id, label: a.name }))} /></Field>
    </FormModal>
  );
}

function SavingsTab({ money }) {
  const goals = useSavingsGoals();
  const openEditor = useEditor();
  const [contributing, setContributing] = useState(null);
  const list = goals.data ?? [];
  const addContribution = (g) => setContributing(g);
  return (
    <div className="stack" style={{ gap: 16 }}>
      {contributing && <ContributeModal goal={contributing} money={money} onClose={() => setContributing(null)} />}
      {goals.isPending ? <Card><SkeletonList rows={3} /></Card> : goals.isError ? <Card><ErrorState error={goals.error} onRetry={() => goals.refetch()} /></Card> : !list.length ? (
        <Card><EmptyState icon={PiggyBank} title="No savings goals yet" description="Set a target, add what you've saved, and see when you'll get there." action={<Button variant="primary" icon={Plus} onClick={() => openEditor('savings')}>New savings goal</Button>} /></Card>
      ) : (
        <>
          <div className="row row--between"><p className="text-sm muted">{list.length} goal{list.length === 1 ? '' : 's'}</p><Button size="sm" icon={Plus} onClick={() => openEditor('savings')}>New savings goal</Button></div>
          <div className="goal-grid">
            {list.map((g) => (
              <div key={g._id} className={`card project-card color-${g.color}`}>
                <div className="row row--between">
                  <span className="row text-xs muted" style={{ gap: 6 }}><span className="dot" aria-hidden="true" />{g.goal?.title ?? 'Savings'}</span>
                  {g.completedAt && <Badge tone="success">Reached</Badge>}
                </div>
                <h3 className="goal-card__title">{g.title}</h3>
                <div className="goal-card__progress">
                  <div className="row row--between text-xs"><span className="muted">{money(g.currentAmount)} of {money(g.targetAmount)}</span><span className="weight-semibold tabular">{g.progress}%</span></div>
                  <ProgressBar value={g.progress} color={g.color} label={`${g.title} progress`} />
                </div>
                <p className="text-xs muted">
                  {g.remaining > 0 ? `${money(g.remaining)} to go` : 'Target reached'}
                  {g.monthlyContribution > 0 && g.remaining > 0 && ` · ${money(g.monthlyContribution)}/mo`}
                  {g.estimatedCompletion && g.remaining > 0 && ` · est. ${formatKey(g.estimatedCompletion, 'MMM yyyy')}`}
                  {g.deadline && ` · deadline ${relativeDay(g.deadline)}`}
                </p>
                <div className="row" style={{ gap: 6 }}>
                  <Button size="sm" variant="primary" icon={Plus} onClick={() => addContribution(g)}>Contribute</Button>
                  <Button size="sm" variant="ghost" onClick={() => openEditor('savings', { item: g })}>Edit</Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RecurringTab({ money }) {
  const rules = useRecurring();
  const openEditor = useEditor();
  const list = rules.data ?? [];
  return (
    <Card title="Recurring transactions" icon={Repeat} subtitle="Salary, rent, EMIs and transfers are posted automatically when due" flush actions={<Button size="sm" icon={Plus} onClick={() => openEditor('recurring')}>Add rule</Button>}>
      {rules.isPending ? <SkeletonList rows={4} /> : rules.isError ? <ErrorState compact error={rules.error} onRetry={() => rules.refetch()} /> : !list.length ? (
        <EmptyState compact icon={Repeat} title="No recurring transactions" description="Add your salary, rent or EMI once and let LifeOS post them on schedule." action={<Button size="sm" icon={Plus} onClick={() => openEditor('recurring')}>Add rule</Button>} />
      ) : list.map((r) => (
        <button key={r._id} type="button" className="fin-row" onClick={() => openEditor('recurring', { item: r })}>
          <span className="icon-tile icon-tile--sm" aria-hidden="true"><Repeat /></span>
          <span className="grow"><span className="text-sm weight-medium" style={{ display: 'block' }}>{r.description || r.category}{!r.active && <Badge style={{ marginLeft: 6 }}>Paused</Badge>}</span><span className="text-xs muted">{r.category} · {FREQ_LABEL[r.frequency]} · next {relativeDay(r.nextDate)}{r.account?.name ? ` · ${r.account.name}` : ''}{!r.autoPost ? ' · manual' : ''}</span></span>
          <span className={clsx('text-sm weight-medium tabular', r.type === 'income' && 'text-success')}>{r.type === 'income' ? '+' : '−'}{money(r.amount)}</span>
        </button>
      ))}
    </Card>
  );
}
