import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, AlertTriangle, BedDouble, CheckSquare, Flame, Lightbulb, PiggyBank, Repeat, Target, TrendingDown, TrendingUp,
} from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, ProgressBar, Segmented, Skeleton, StatTile } from '../../components/ui';
import { ChartCard } from '../../components/ChartCard';
import { RankList } from '../../components/RankList';
import { BAR_PROPS, ChartLegend, ChartTooltip, LINE_PROPS, useChartTheme } from '../../components/charts';
import { useAnalytics } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { fromKey } from '../../lib/dates';
import { formatCurrency, formatDuration } from '../../lib/format';

const TONES = {
  positive: { icon: TrendingUp, label: 'Positive', className: 'text-success' },
  warning: { icon: AlertTriangle, label: 'Needs attention', className: 'text-warning' },
  info: { icon: Lightbulb, label: 'Insight', className: 'text-accent' },
};

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const analytics = useAnalytics(days);
  const theme = useChartTheme();
  const { user } = useAuth();
  const currency = user?.preferences?.currency ?? 'USD';
  const money = (v, opts) => formatCurrency(v, currency, opts);
  const d = analytics.data;

  const daily = useMemo(
    () => (d?.daily ?? []).map((row) => ({ ...row, label: format(fromKey(row.date), days <= 14 ? 'EEE d' : 'MMM d') })),
    [d, days],
  );
  const trend = useMemo(() => (d?.finance.trend ?? []).map((t) => ({ ...t, label: format(fromKey(`${t.month}-01`), 'MMM') })), [d]);

  const axis = {
    x: { dataKey: 'label', tickLine: false, axisLine: { stroke: theme.chartBaseline }, tick: theme.axisTick, interval: 'preserveStartEnd', minTickGap: 18 },
    y: { tickLine: false, axisLine: false, tick: theme.axisTick, width: 40 },
  };
  const dayLabel = (_, payload) => payload?.[0] && format(fromKey(payload[0].payload.date), 'EEEE, MMM d');

  const header = (
    <PageHeader
      title="Analytics"
      subtitle={d ? `${format(fromKey(d.range.from), 'MMM d')} – ${format(fromKey(d.range.to), 'MMM d, yyyy')}` : 'Trends across your productivity, habits, money and health.'}
      actions={
        <Segmented
          label="Date range"
          value={days}
          onChange={setDays}
          options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]}
        />
      }
    />
  );

  if (analytics.isError && !d) {
    return <div className="page page--wide">{header}<Card><ErrorState error={analytics.error} onRetry={() => analytics.refetch()} /></Card></div>;
  }

  if (!d) {
    return (
      <div className="page page--wide">
        {header}
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="card stat"><Skeleton width="50%" /><Skeleton height={24} width="40%" style={{ marginTop: 10 }} /></div>)}
        </div>
        <div className="grid-2">{Array.from({ length: 4 }, (_, i) => <Card key={i}><Skeleton height={220} /></Card>)}</div>
      </div>
    );
  }

  const change = d.tasks.previousCompleted ? Math.round(((d.tasks.completed - d.tasks.previousCompleted) / d.tasks.previousCompleted) * 100) : null;
  const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

  return (
    <div className="page page--wide" style={{ opacity: analytics.isPlaceholderData ? 0.7 : 1, transition: 'opacity 150ms' }}>
      {header}

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <StatTile
          icon={CheckSquare}
          label="Tasks completed"
          value={d.summary.tasksCompleted}
          meta={change === null ? `Last ${days} days` : (
            <span className={change >= 0 ? 'text-success' : 'text-danger'}>
              {change >= 0 ? <TrendingUp size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" /> : <TrendingDown size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" />}
              {' '}{Math.abs(change)}% vs previous {days} days
            </span>
          )}
        />
        <StatTile icon={Target} label="On-time completion" value={pct(d.summary.taskCompletionRate)} meta={`${d.tasks.missed} missed · ${d.tasks.overdue} overdue now`} />
        <StatTile icon={Flame} label="Habit consistency" value={pct(d.summary.habitConsistency)} meta="Daily habits done when scheduled" />
        <StatTile icon={Repeat} label="Routine consistency" value={pct(d.summary.routineConsistency)} meta="Average steps completed" />
        <StatTile icon={Target} label="Avg. goal progress" value={pct(d.summary.goalsAvgProgress)} meta={`${d.goals.active} active · ${d.goals.milestonesCompleted} milestones reached`} />
        <StatTile icon={PiggyBank} label="Net savings" value={<span className={clsx(d.summary.net < 0 && 'text-danger')}>{money(d.summary.net, { signed: true })}</span>} meta={d.finance.savingsRate !== null ? `${d.finance.savingsRate}% of income saved` : 'No income recorded'} />
        <StatTile icon={BedDouble} label="Average sleep" value={d.summary.avgSleep !== null ? `${d.summary.avgSleep}h` : '—'} meta={`Goal ${d.health.goals.sleepGoalHours}h`} />
        <StatTile icon={Activity} label="Workout time" value={formatDuration(d.summary.workoutMinutes)} meta={`${d.health.workouts.count} sessions`} />
      </div>

      <Card title="Insights" icon={Lightbulb} style={{ marginBottom: 16 }}>
        {d.insights.length ? (
          <ul className="insights">
            {d.insights.map((insight, i) => {
              const tone = TONES[insight.tone] ?? TONES.info;
              return (
                <li key={i} className="insight">
                  <span className={clsx('insight__icon', tone.className)}><tone.icon aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm weight-medium"><span className="sr-only">{tone.label}: </span>{insight.title}</p>
                    <p className="text-xs muted">{insight.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState compact icon={Lightbulb} title="Not enough data yet" description="Keep logging tasks, habits and expenses — insights appear as patterns emerge." />
        )}
      </Card>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <ChartCard
          title="Tasks completed"
          subtitle="Per day"
          table={{ columns: [{ key: 'label', label: 'Day' }, { key: 'tasksCompleted', label: 'Completed', numeric: true }], rows: daily }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke={theme.chartGrid} />
              <XAxis {...axis.x} />
              <YAxis {...axis.y} allowDecimals={false} />
              <Tooltip cursor={theme.cursorFill} content={<ChartTooltip labelFormatter={dayLabel} />} />
              <Bar dataKey="tasksCompleted" name="Completed" fill={theme.chart1} {...BAR_PROPS} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Consistency"
          subtitle="Share of scheduled habits and routine steps completed"
          legend={
            <ChartLegend
              items={[
                { label: `Habits · ${pct(d.summary.habitConsistency)} avg`, color: theme.chart1, line: true },
                { label: `Routines · ${pct(d.summary.routineConsistency)} avg`, color: theme.chart2, line: true },
              ]}
            />
          }
          height={196}
          table={{ columns: [{ key: 'label', label: 'Day' }, { key: 'habitsPct', label: 'Habits %', numeric: true }, { key: 'routinesPct', label: 'Routines %', numeric: true }], rows: daily }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid vertical={false} stroke={theme.chartGrid} />
              <XAxis {...axis.x} />
              <YAxis {...axis.y} width={44} domain={[0, 100]} ticks={[0, 50, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip cursor={{ stroke: theme.chartBaseline }} content={<ChartTooltip labelFormatter={dayLabel} valueFormatter={(v) => `${v}%`} />} />
              <Line type="monotone" dataKey="habitsPct" name="Habits" stroke={theme.chart1} connectNulls {...LINE_PROPS} activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }} />
              <Line type="monotone" dataKey="routinesPct" name="Routines" stroke={theme.chart2} connectNulls {...LINE_PROPS} activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <ChartCard
          title="Most productive days"
          subtitle="Tasks completed by weekday"
          height={200}
          table={{ columns: [{ key: 'day', label: 'Weekday' }, { key: 'count', label: 'Completed', numeric: true }], rows: d.tasks.byWeekday }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.tasks.byWeekday} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke={theme.chartGrid} />
              <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} />
              <YAxis {...axis.y} allowDecimals={false} />
              <Tooltip cursor={theme.cursorFill} content={<ChartTooltip />} />
              <Bar dataKey="count" name="Completed" fill={theme.chart1} {...BAR_PROPS} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card title="Habit consistency" subtitle="Per habit in this period">
          {d.habits.perHabit.length ? (
            <RankList items={d.habits.perHabit.map((h) => ({ key: h._id, label: `${h.icon} ${h.name}`, value: h.rate, color: h.color }))} formatValue={(v) => `${v}%`} showShare={false} max={100} />
          ) : (
            <EmptyState compact icon={Flame} title="No habits yet" action={<Link to="/habits" className="text-accent text-sm">Create a habit</Link>} />
          )}
        </Card>

        <Card title="Goal progress" subtitle={`${d.goals.active} active · ${d.goals.completed} completed`}>
          {d.goals.list.length ? (
            <div className="stack" style={{ gap: 12 }}>
              {d.goals.list.map((g) => (
                <Link key={g._id} to={`/goals/${g._id}`} className="stack stack--sm" style={{ gap: 5 }}>
                  <span className="row row--between text-sm">
                    <span className="truncate">{g.title}</span>
                    <span className="tabular weight-medium">{g.progress}%</span>
                  </span>
                  <ProgressBar value={g.progress} color={g.color} size="sm" label={`${g.title} progress`} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Target} title="No goals yet" action={<Link to="/goals" className="text-accent text-sm">Set a goal</Link>} />
          )}
        </Card>
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
            ],
            rows: trend,
          }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trend} barGap={2} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={theme.chartGrid} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} />
              <YAxis tickLine={false} axisLine={false} tick={theme.axisTick} width={56} tickFormatter={(v) => money(v, { compact: true })} />
              <Tooltip cursor={theme.cursorFill} content={<ChartTooltip valueFormatter={(v) => money(v)} />} />
              <Bar dataKey="income" name="Income" fill={theme.chart1} {...BAR_PROPS} />
              <Bar dataKey="expense" name="Expenses" fill={theme.chart2} {...BAR_PROPS} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <Card title="Spending by category" subtitle={`Last ${days} days · ${money(d.finance.expense)} total`}>
          {d.finance.byCategory.length ? (
            <RankList items={d.finance.byCategory.map((c) => ({ key: c.category, label: c.category, value: c.total }))} formatValue={(v) => money(v)} />
          ) : (
            <EmptyState compact icon={PiggyBank} title="No expenses in this period" />
          )}
        </Card>
      </div>

      <div className="grid-2">
        <ChartCard
          title="Sleep"
          subtitle="Hours per night"
          table={{ columns: [{ key: 'label', label: 'Day' }, { key: 'sleepHours', label: 'Hours', numeric: true }], rows: daily }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 12, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke={theme.chartGrid} />
              <XAxis {...axis.x} />
              <YAxis {...axis.y} domain={[0, 10]} tickFormatter={(v) => `${v}h`} />
              <Tooltip cursor={theme.cursorFill} content={<ChartTooltip labelFormatter={dayLabel} valueFormatter={(v) => `${v}h`} />} />
              <ReferenceLine y={d.health.goals.sleepGoalHours} stroke={theme.textSecondary} strokeWidth={1} label={{ value: 'Goal', position: 'insideTopRight', fill: theme.chartAxis, fontSize: 11 }} />
              <Bar dataKey="sleepHours" name="Sleep" fill={theme.chart1} {...BAR_PROPS} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Workout minutes"
          subtitle="Per day"
          table={{ columns: [{ key: 'label', label: 'Day' }, { key: 'workoutMin', label: 'Minutes', numeric: true }], rows: daily }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid vertical={false} stroke={theme.chartGrid} />
              <XAxis {...axis.x} />
              <YAxis {...axis.y} allowDecimals={false} />
              <Tooltip cursor={theme.cursorFill} content={<ChartTooltip labelFormatter={dayLabel} valueFormatter={(v) => `${v} min`} />} />
              <Bar dataKey="workoutMin" name="Workout" fill={theme.chart1} {...BAR_PROPS} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <style>{`
        .insights { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px 24px; list-style: none; }
        .insight { display: flex; gap: 10px; align-items: flex-start; }
        .insight__icon { display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; border-radius: var(--radius-sm); background: var(--bg-subtle); }
        .insight__icon svg { width: 15px; height: 15px; }
      `}</style>
    </div>
  );
}
