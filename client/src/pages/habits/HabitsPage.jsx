import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { addDays, format, getDay, startOfWeek, subWeeks } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Archive, ArchiveRestore, Check, Flame, Pencil, Plus, Target, TrendingUp, Trophy } from 'lucide-react';
import {
  Button, Card, EmptyState, ErrorState, PageHeader, Segmented, Skeleton, SkeletonList, StatTile,
} from '../../components/ui';
import { BAR_PROPS, ChartTooltip, cssVar, useChartTheme } from '../../components/charts';
import { useHabits, useToggleHabit, useUpdateHabit } from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { WEEKDAYS } from '../../lib/constants';
import { addDaysKey, formatKey, fromKey, toKey, todayKey } from '../../lib/dates';
import { pluralize } from '../../lib/format';
import './habits.css';

const isScheduled = (habit, key) => habit.frequency === 'weekly' || !habit.days.length || habit.days.includes(getDay(fromKey(key)));

function frequencyLabel(habit) {
  if (habit.frequency === 'weekly') return `${habit.timesPerWeek}× per week`;
  if (!habit.days.length || habit.days.length === 7) return 'Every day';
  return habit.days.map((d) => WEEKDAYS[d]).join(', ');
}

function DayToggle({ habit, date, today }) {
  const toggle = useToggleHabit();
  const toast = useToast();
  const done = habit.logs.includes(date);
  const shown = toggle.isPending ? !done : done;
  const scheduled = isScheduled(habit, date);
  return (
    <button
      type="button"
      className={clsx('habit-day', `color-${habit.color}`, shown && 'is-done', !scheduled && 'is-off', date === today && 'is-today')}
      aria-pressed={shown}
      aria-label={`${habit.name}, ${formatKey(date, 'EEEE MMM d')}: ${shown ? 'done' : scheduled ? 'not done' : 'not scheduled'}`}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ id: habit._id, date }, { onError: (err) => toast.apiError(err, "Couldn't update habit") });
      }}
    >
      {shown ? <Check aria-hidden="true" /> : !scheduled && <span aria-hidden="true">–</span>}
    </button>
  );
}

export default function HabitsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'archived' ? 'archived' : 'active';
  const habits = useHabits({ archived: tab === 'archived' });
  const openEditor = useEditor();
  const today = todayKey();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysKey(today, i - 6)), [today]);

  const list = habits.data ?? [];
  const selectedId = params.get('habit');
  const selected = list.find((h) => h._id === selectedId) ?? (tab === 'active' ? list[0] : null);

  const updateParams = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  const stats = useMemo(() => {
    const scheduled = list.filter((h) => h.frequency === 'daily' && h.stats.scheduledToday);
    const best = [...list].sort((a, b) => b.stats.currentStreak - a.stats.currentStreak)[0];
    const avg = list.length ? Math.round(list.reduce((s, h) => s + h.stats.completionRate, 0) / list.length) : 0;
    const weekCheckins = list.reduce((s, h) => s + h.logs.filter((d) => d > addDaysKey(today, -7)).length, 0);
    return { scheduled: scheduled.length, done: scheduled.filter((h) => h.stats.doneToday).length, best, avg, weekCheckins };
  }, [list, today]);

  return (
    <div className="page page--wide">
      <PageHeader
        title="Habits"
        subtitle="Small, consistent actions that compound."
        actions={
          <>
            <Segmented label="Habit list" value={tab} onChange={(v) => updateParams({ tab: v === 'active' ? null : v, habit: null })} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
            <Button variant="primary" icon={Plus} onClick={() => openEditor('habit')}>New habit</Button>
          </>
        }
      />

      {habits.isError && !habits.data ? (
        <Card><ErrorState error={habits.error} onRetry={() => habits.refetch()} /></Card>
      ) : tab === 'archived' ? (
        <ArchivedList query={habits} />
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 16 }}>
            {habits.isPending ? (
              Array.from({ length: 4 }, (_, i) => <div key={i} className="card stat"><Skeleton width="50%" /><Skeleton height={24} width="40%" style={{ marginTop: 10 }} /></div>)
            ) : (
              <>
                <StatTile icon={Check} label="Done today" value={`${stats.done}/${stats.scheduled}`} meta="Daily habits scheduled today" />
                <StatTile icon={Flame} label="Longest active streak" value={stats.best ? pluralize(stats.best.stats.currentStreak, stats.best.stats.streakUnit) : '—'} meta={stats.best?.name ?? 'No habits yet'} />
                <StatTile icon={TrendingUp} label="30-day consistency" value={`${stats.avg}%`} meta="Average across habits" />
                <StatTile icon={Target} label="Check-ins this week" value={stats.weekCheckins} meta="Last 7 days" />
              </>
            )}
          </div>

          <Card flush title="This week" subtitle="Tap a day to check in or undo" className="habit-table-card">
            {habits.isPending ? (
              <SkeletonList rows={5} />
            ) : !list.length ? (
              <EmptyState icon={Flame} title="Build your first habit" description="Pick something small you can do every day — the streak will do the rest." action={<Button variant="primary" icon={Plus} onClick={() => openEditor('habit')}>Create a habit</Button>} />
            ) : (
              <div className="habit-table" role="table" aria-label="Habit check-ins for the last 7 days">
                <div className="habit-row habit-row--head" role="row">
                  <span role="columnheader">Habit</span>
                  <div className="habit-row__days" role="presentation">
                    {days.map((d) => (
                      <span key={d} role="columnheader" className={clsx('habit-dayhead', d === today && 'is-today')}>
                        <span>{formatKey(d, 'EEEEE')}</span>
                        <strong>{formatKey(d, 'd')}</strong>
                      </span>
                    ))}
                  </div>
                  <span role="columnheader" className="habit-row__num">Streak</span>
                  <span role="columnheader" className="habit-row__num desktop-only">30d</span>
                </div>
                {list.map((habit) => (
                  <div key={habit._id} role="row" className={clsx('habit-row', selected?._id === habit._id && 'is-selected')} onClick={() => updateParams({ habit: habit._id })}>
                    <div className="habit-row__name" role="cell">
                      <span className={`icon-tile icon-tile--sm color-${habit.color}`} aria-hidden="true">{habit.icon}</span>
                      <div className="grow">
                        <button type="button" className="habit-row__title truncate" onClick={(e) => { e.stopPropagation(); updateParams({ habit: habit._id }); }}>
                          {habit.name}
                        </button>
                        <div className="text-xs muted truncate">{frequencyLabel(habit)}</div>
                      </div>
                    </div>
                    <div className="habit-row__days" role="cell">
                      {days.map((d) => <DayToggle key={d} habit={habit} date={d} today={today} />)}
                    </div>
                    <div className="habit-row__num" role="cell">
                      <span className={clsx('streak', habit.stats.currentStreak > 0 && 'is-active')}>
                        <Flame aria-hidden="true" />
                        {habit.stats.currentStreak}
                        <span className="sr-only">{habit.stats.streakUnit} streak</span>
                      </span>
                    </div>
                    <div className="habit-row__num desktop-only tabular" role="cell">{habit.stats.completionRate}%</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {selected && <HabitDetail key={selected._id} habit={selected} />}
        </>
      )}
    </div>
  );
}

function HabitDetail({ habit }) {
  const { user } = useAuth();
  const weekStartsOn = user?.preferences?.weekStartsOn ?? 1;
  const openEditor = useEditor();
  const update = useUpdateHabit();
  const toggle = useToggleHabit();
  const toast = useToast();
  const theme = useChartTheme();
  const today = todayKey();
  const logs = useMemo(() => new Set(habit.logs), [habit.logs]);

  const weeks = useMemo(() => {
    const first = subWeeks(startOfWeek(fromKey(today), { weekStartsOn }), 25);
    return Array.from({ length: 26 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const key = toKey(addDays(first, w * 7 + d));
        return { key, future: key > today, done: logs.has(key), scheduled: isScheduled(habit, key) };
      }),
    );
  }, [today, weekStartsOn, logs, habit]);

  const weeklyCounts = weeks.slice(-12).map((week) => ({
    label: format(fromKey(week[0].key), 'MMM d'),
    count: week.filter((c) => c.done).length,
  }));

  const barColor = cssVar(`--c-${habit.color}`) || theme.chart1;

  const archive = () =>
    update.mutate(
      { id: habit._id, archived: !habit.archived },
      { onSuccess: () => toast.success(habit.archived ? 'Habit restored' : 'Habit archived', { description: habit.name }), onError: (err) => toast.apiError(err, "Couldn't update habit") },
    );

  return (
    <div className="habit-detail">
      <Card
        title={<><span aria-hidden="true">{habit.icon}</span> {habit.name}</>}
        subtitle={habit.description || frequencyLabel(habit)}
        actions={
          <>
            <Button size="sm" icon={Pencil} onClick={() => openEditor('habit', { item: habit })}>Edit</Button>
            <Button size="sm" variant="ghost" icon={Archive} onClick={archive} loading={update.isPending}>Archive</Button>
          </>
        }
      >
        <div className="habit-detail__stats">
          <div><p className="mini-stat__label">Current streak</p><p className="mini-stat__value">{pluralize(habit.stats.currentStreak, habit.stats.streakUnit)}</p></div>
          <div><p className="mini-stat__label">Best streak</p><p className="mini-stat__value row" style={{ gap: 6 }}><Trophy size={15} className="muted" aria-hidden="true" />{pluralize(habit.stats.bestStreak, habit.stats.streakUnit)}</p></div>
          <div><p className="mini-stat__label">30-day consistency</p><p className="mini-stat__value">{habit.stats.completionRate}%</p></div>
          <div><p className="mini-stat__label">Total check-ins</p><p className="mini-stat__value">{habit.stats.totalCompletions}</p></div>
        </div>

        <p className="text-xs muted" style={{ margin: '18px 0 8px' }}>Last 26 weeks · click a day to toggle it</p>
        <div className="heatmap-scroll">
          <div className={`heatmap color-${habit.color}`} role="grid" aria-label={`${habit.name} history`}>
            <div className="heatmap__weekdays" aria-hidden="true">
              {weeks[0].map((c, i) => <span key={c.key}>{i % 2 === 0 ? format(fromKey(c.key), 'EEE') : ''}</span>)}
            </div>
            {weeks.map((week, wi) => (
              <div key={week[0].key} className="heatmap__week" role="row">
                <span className="heatmap__month" aria-hidden="true">
                  {wi === 0 || fromKey(week[0].key).getMonth() !== fromKey(weeks[wi - 1][0].key).getMonth() ? format(fromKey(week[0].key), 'MMM') : ''}
                </span>
                {week.map((cell) => (
                  <button
                    key={cell.key}
                    type="button"
                    role="gridcell"
                    className={clsx('heatmap__cell', cell.done && 'is-done', !cell.scheduled && 'is-off')}
                    disabled={cell.future || toggle.isPending}
                    title={`${formatKey(cell.key, 'EEE, MMM d')} — ${cell.done ? 'done' : cell.scheduled ? 'missed' : 'not scheduled'}`}
                    aria-label={`${formatKey(cell.key, 'EEEE, MMMM d')}: ${cell.done ? 'done' : 'not done'}`}
                    aria-pressed={cell.done}
                    onClick={() => toggle.mutate({ id: habit._id, date: cell.key }, { onError: (err) => toast.apiError(err, "Couldn't update habit") })}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Check-ins per week" subtitle="Last 12 weeks">
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyCounts} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} stroke={theme.chartGrid} />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} interval="preserveStartEnd" minTickGap={12} />
              <YAxis allowDecimals={false} domain={[0, 7]} tickLine={false} axisLine={false} tick={theme.axisTick} width={40} />
              <Tooltip cursor={theme.cursorFill} content={<ChartTooltip labelFormatter={(l) => `Week of ${l}`} />} />
              <Bar dataKey="count" name="Check-ins" fill={barColor} {...BAR_PROPS} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function ArchivedList({ query }) {
  const update = useUpdateHabit();
  const openEditor = useEditor();
  const toast = useToast();
  if (query.isPending) return <Card flush><SkeletonList rows={3} /></Card>;
  if (!query.data.length) {
    return <Card><EmptyState icon={Archive} title="No archived habits" description="Archive habits you've paused to keep their history without cluttering your day." /></Card>;
  }
  return (
    <Card flush>
      <div className="list">
        {query.data.map((habit) => (
          <div key={habit._id} className="list-row">
            <span className={`icon-tile icon-tile--sm color-${habit.color}`} aria-hidden="true">{habit.icon}</span>
            <div className="grow">
              <p className="text-sm weight-medium">{habit.name}</p>
              <p className="text-xs muted">{habit.stats.totalCompletions} check-ins · best streak {pluralize(habit.stats.bestStreak, habit.stats.streakUnit)}</p>
            </div>
            <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEditor('habit', { item: habit })}>Edit</Button>
            <Button
              size="sm"
              icon={ArchiveRestore}
              onClick={() => update.mutate({ id: habit._id, archived: false }, { onSuccess: () => toast.success('Habit restored'), onError: (err) => toast.apiError(err, "Couldn't restore habit") })}
            >
              Restore
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
