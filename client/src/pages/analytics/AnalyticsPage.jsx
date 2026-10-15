import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, CheckSquare, Flame, Lightbulb, PiggyBank, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, StatTile } from '../../components/ui';
import { ChartCard } from '../../components/ChartCard';
import { BAR_PROPS, ChartLegend, ChartTooltip, LINE_PROPS, useChartTheme } from '../../components/charts';
import { useAnalytics } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { fromKey } from '../../lib/dates';
import { formatCurrency } from '../../lib/format';

// The page stays a summary: the per-module detail (cash flow, per-habit and per-goal progress,
// sleep) lives on Finance, Habits, Goals and Health.
const MAX_INSIGHTS = 4;

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
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="card stat"><Skeleton width="50%" /><Skeleton height={24} width="40%" style={{ marginTop: 10 }} /></div>)}
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
        <StatTile icon={Flame} label="Habit consistency" value={pct(d.summary.habitConsistency)} meta="Daily habits done when scheduled" />
        <StatTile icon={Target} label="Avg. goal progress" value={pct(d.summary.goalsAvgProgress)} meta={`${d.goals.active} active · ${d.goals.milestonesCompleted} milestones reached`} />
        <StatTile icon={PiggyBank} label="Net savings" value={<span className={clsx(d.summary.net < 0 && 'text-danger')}>{money(d.summary.net, { signed: true })}</span>} meta={d.finance.savingsRate !== null ? `${d.finance.savingsRate}% of income saved` : 'No income recorded'} />
      </div>

      <Card title="Insights" icon={Lightbulb} style={{ marginBottom: 16 }}>
        {d.insights.length ? (
          <ul className="insights">
            {d.insights.slice(0, MAX_INSIGHTS).map((insight, i) => {
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

      <div className="grid-2">
        <ChartCard
          title="Most productive days"
          subtitle="Tasks completed by weekday"
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
        .insights { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 12px 24px; list-style: none; }
        .insight { display: flex; gap: 10px; align-items: flex-start; }
        .insight__icon { display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; border-radius: var(--radius-sm); background: var(--bg-subtle); }
        .insight__icon svg { width: 15px; height: 15px; }
      `}</style>
    </div>
  );
}
