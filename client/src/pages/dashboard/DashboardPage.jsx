import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { addDays, format, startOfDay } from 'date-fns';
import clsx from 'clsx';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpRight, Bell, CalendarDays, CalendarPlus, Check, CheckSquare, Droplet, Dumbbell, FileText, Flame, Moon,
  NotebookPen, Play, Plus, RefreshCw, Repeat, SlidersHorizontal, Sparkles, Target, Timer, TrendingUp, Wallet, Zap,
} from 'lucide-react';
import { Markdown } from '../../components/Markdown';
import { openQuickCapture } from '../../components/layout/AppShell';
import {
  Badge, Button, Card, Checkbox, EmptyState, ErrorState, IconButton, Modal, ProgressBar, ProgressRing, SectionLabel, Skeleton, SkeletonList, Switch,
} from '../../components/ui';
import { BAR_PROPS, ChartTooltip, useChartTheme } from '../../components/charts';
import { TaskRow } from '../../features/tasks/TaskRow';
import { QuickAddTask } from '../../features/tasks/QuickAddTask';
import {
  useAddWater, useCompleteReminder, useDailyBrief, useDashboard, useEvents, useRefreshInsight, useStartFocus, useToggleHabit, useToggleRoutineStep,
} from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { useReveal } from '../../hooks/useUtils';
import { AI_WITHHELD_REASON, DASHBOARD_SECTIONS, DASHBOARD_WIDGETS, REMINDER_META } from '../../lib/constants';
import { countdown, expandEvents, formatTimeHM, fromKey, greeting, occursOnDay, relativeDay, toKey, todayKey } from '../../lib/dates';
import { formatCurrency, formatDuration, formatLiters, percent, pluralize } from '../../lib/format';
import './dashboard.css';

const SPANS = { brief: 12, focus: 7, schedule: 5, habits: 6, routines: 6, upcoming: 7, reminders: 5, documents: 5, goals: 6, finance: 6, health: 6, productivity: 6, focusTime: 6 };
const FULL_WIDTH = new Set(['brief']);
const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];

function normalizeWidgets(saved) {
  const list = (saved ?? []).filter((w) => DASHBOARD_WIDGETS[w.id]);
  const seen = new Set(list.map((w) => w.id));
  return [...list, ...Object.keys(DASHBOARD_WIDGETS).filter((id) => !seen.has(id)).map((id) => ({ id, visible: true }))];
}

/** Pairs widgets into 12-column rows; a lone widget spans the full row. */
function withSpans(ids) {
  const out = [];
  const rest = ids.filter((id) => !FULL_WIDTH.has(id));
  for (const id of ids.filter((x) => FULL_WIDTH.has(x))) out.push({ id, span: 12 });
  for (let i = 0; i < rest.length; i += 2) {
    if (i + 1 < rest.length) {
      out.push({ id: rest[i], span: SPANS[rest[i]] }, { id: rest[i + 1], span: 12 - SPANS[rest[i]] });
    } else {
      out.push({ id: rest[i], span: 12 });
    }
  }
  return out;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const dashboard = useDashboard();
  const openEditor = useEditor();
  const addWater = useAddWater();
  const toast = useToast();
  const [customizing, setCustomizing] = useState(false);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const today = todayKey();

  useEffect(() => {
    if (params.get('customize')) {
      setCustomizing(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const rangeStart = useMemo(() => startOfDay(fromKey(today)), [today]);
  const rangeEnd = useMemo(() => addDays(rangeStart, 8), [rangeStart]);
  const events = useEvents(rangeStart, rangeEnd);
  const occurrences = useMemo(() => expandEvents(events.data ?? [], rangeStart, rangeEnd), [events.data, rangeStart, rangeEnd]);

  const widgets = normalizeWidgets(user?.preferences?.dashboardWidgets);
  const data = dashboard.data;
  const firstName = user?.name?.split(' ')[0] ?? '';

  const summary = data
    ? [
        pluralize(data.tasks.today.length + data.tasks.overdue.length, 'task') + ' due',
        pluralize(occurrences.filter((o) => occursOnDay(o, new Date())).length, 'event'),
        `${pluralize(data.habits.filter((h) => h.stats.scheduledToday && !h.stats.doneToday && h.frequency === 'daily').length, 'habit')} left`,
      ].join(' · ')
    : null;

  const logWater = () =>
    addWater.mutate(
      { deltaMl: 250 },
      { onSuccess: (log) => toast.success('+250 ml water', { description: `${formatLiters(log.waterMl)} today` }), onError: (err) => toast.apiError(err, "Couldn't log water") },
    );

  const quickActions = [
    { label: 'Quick capture', icon: Zap, run: openQuickCapture },
    { label: 'New task', icon: CheckSquare, run: () => openEditor('task', { defaults: { dueDate: today } }) },
    { label: 'New event', icon: CalendarPlus, run: () => openEditor('event') },
    { label: 'Log expense', icon: Wallet, run: () => openEditor('transaction', { defaults: { type: 'expense' } }) },
    { label: 'Write a note', icon: NotebookPen, run: () => openEditor('note') },
    { label: '+250 ml water', icon: Droplet, run: logWater, loading: addWater.isPending },
    { label: 'Log workout', icon: Dumbbell, run: () => openEditor('workout') },
    { label: 'Add reminder', icon: Bell, run: () => openEditor('reminder') },
    { label: 'Ask AI', icon: Sparkles, run: () => navigate('/ai') },
  ];

  const widgetProps = { query: dashboard, data, occurrences, eventsQuery: events };

  return (
    <div className="page page--wide">
      <header className="page-header">
        <div>
          <p className="page-header__eyebrow">{format(new Date(), 'EEEE, MMMM d')}</p>
          <h1 className="page-header__title">{greeting()}, {firstName}</h1>
          <p className="page-header__subtitle">{summary ?? <Skeleton width={260} height={16} style={{ marginTop: 6 }} />}</p>
        </div>
        <div className="page-header__actions">
          <Button icon={SlidersHorizontal} onClick={() => setCustomizing(true)}>Customize</Button>
        </div>
      </header>

      <div className="quick-actions" role="toolbar" aria-label="Quick actions">
        {quickActions.map((a) => (
          <button key={a.label} type="button" className="quick-action" onClick={a.run} disabled={a.loading}>
            <span className="quick-action__icon"><a.icon aria-hidden="true" /></span>
            {a.label}
          </button>
        ))}
      </div>

      {DASHBOARD_SECTIONS.map((section) => {
        const ids = widgets.filter((w) => w.visible && DASHBOARD_WIDGETS[w.id].section === section.id).map((w) => w.id);
        if (!ids.length) return null;
        return (
          <section key={section.id} className="dash-section" aria-labelledby={`section-${section.id}`}>
            <div className="dash-section__header">
              <h2 id={`section-${section.id}`} className="dash-section__title">{section.label}</h2>
            </div>
            <div className="dash-grid">
              {withSpans(ids).map(({ id, span }) => {
                const Widget = WIDGETS[id];
                return (
                  <RevealWidget key={id} span={span}>
                    <Widget {...widgetProps} />
                  </RevealWidget>
                );
              })}
            </div>
          </section>
        );
      })}

      {widgets.every((w) => !w.visible) && (
        <Card>
          <EmptyState icon={SlidersHorizontal} title="Your dashboard is empty" description="Turn widgets back on to see your day at a glance." action={<Button onClick={() => setCustomizing(true)}>Customize dashboard</Button>} />
        </Card>
      )}

      <CustomizeModal open={customizing} onClose={() => setCustomizing(false)} widgets={widgets} />
    </div>
  );
}

function RevealWidget({ span, children }) {
  const ref = useReveal();
  return (
    <div ref={ref} className="dash-widget reveal" style={{ '--span': span }}>
      {children}
    </div>
  );
}

/** Card that renders loading / error states for the shared dashboard query. */
function WidgetCard({ query, title, icon, subtitle, actions, flush = true, children, rows = 3 }) {
  return (
    <Card title={title} icon={icon} subtitle={query.data ? subtitle : undefined} actions={actions} flush={flush} className="widget">
      {query.isPending ? (
        <SkeletonList rows={rows} />
      ) : query.isError && !query.data ? (
        <ErrorState compact error={query.error} onRetry={() => query.refetch()} />
      ) : (
        children(query.data)
      )}
    </Card>
  );
}

const ViewAll = ({ to, label = 'View all' }) => (
  <Link to={to} className="btn btn--ghost btn--sm">
    <span className="btn__content">{label}<ArrowUpRight aria-hidden="true" /></span>
  </Link>
);

/* ───────── Today ───────── */

function BriefWidget() {
  const brief = useDailyBrief();
  const refresh = useRefreshInsight();
  const startFocus = useStartFocus();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const d = brief.data;

  const act = (s) => {
    if (s.kind === 'focus') startFocus.mutate({ plannedMinutes: user?.preferences?.focusMinutes ?? 25, task: s.taskId, label: s.title.replace(/^\d+-minute focus session on /, '').replace(/^"|"$/g, '') }, { onSuccess: () => navigate('/focus'), onError: (err) => toast.apiError(err, "Couldn't start focus") });
    else if (s.kind === 'goal') navigate(`/goals/${s.goalId}`);
    else if (s.kind === 'routine') navigate('/routines');
    else if (s.kind === 'habit') navigate(`/habits?habit=${s.habitId}`);
    else if (s.kind === 'document') navigate(`/documents?doc=${s.documentId}`);
  };

  return (
    <Card
      title="Daily brief"
      icon={Sparkles}
      subtitle={d ? (d.ai.enabled ? (d.narrative ? 'Written by your assistant from today’s data' : 'Computed from your data') : d.ai.configured ? 'AI brief is off in settings' : 'Computed from your data · connect an AI provider for a narrative') : undefined}
      className="widget"
      actions={d?.ai.enabled && <IconButton icon={RefreshCw} size="sm" label="Regenerate brief" loading={refresh.isPending} onClick={() => refresh.mutate({ kind: 'brief', date: today }, { onError: (err) => toast.apiError(err, "Couldn't regenerate") })} />}
    >
      {brief.isPending ? <SkeletonList rows={3} /> : brief.isError ? <ErrorState compact error={brief.error} onRetry={() => brief.refetch()} /> : (
        <div className="brief">
          <div className="brief__stats">
            <span className={clsx('brief__stat', d.counts.overdue && 'is-warn')}><CheckSquare size={12} aria-hidden="true" /><strong>{d.counts.important}</strong> important tasks{d.counts.overdue ? ` · ${d.counts.overdue} overdue` : ''}</span>
            <span className="brief__stat"><CalendarDays size={12} aria-hidden="true" /><strong>{d.counts.events}</strong> events</span>
            <span className="brief__stat"><Flame size={12} aria-hidden="true" /><strong>{d.counts.habitsLeft}</strong> habits left</span>
            {d.counts.deadlines > 0 && <span className="brief__stat is-warn"><Target size={12} aria-hidden="true" /><strong>{d.counts.deadlines}</strong> goal deadline{d.counts.deadlines === 1 ? '' : 's'} this week</span>}
            {d.counts.expiring > 0 && <span className="brief__stat is-warn"><FileText size={12} aria-hidden="true" /><strong>{d.counts.expiring}</strong> document{d.counts.expiring === 1 ? '' : 's'} expiring</span>}
            {d.summary.goals.behind.length > 0 && <span className="brief__stat is-warn"><AlertTriangle size={12} aria-hidden="true" />{d.summary.goals.behind[0].title} is behind schedule</span>}
          </div>
          {d.narrative ? <Markdown>{d.narrative}</Markdown> : d.narrativeWithheld ? <p className="text-xs muted">{AI_WITHHELD_REASON[d.narrativeWithheld] ?? AI_WITHHELD_REASON.error}</p> : null}
          {d.suggestions.length > 0 && (
            <div>
              <p className="text-2xs muted weight-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Suggested for today</p>
              <div className="brief__suggestions">
                {d.suggestions.map((s, i) => (
                  <div key={i} className="brief__suggestion">
                    <span className="brief__num">{i + 1}</span>
                    <span className="grow">{s.title}</span>
                    <Button size="xs" variant="ghost" icon={s.kind === 'focus' ? Play : ArrowUpRight} loading={s.kind === 'focus' && startFocus.isPending} onClick={() => act(s)}>{s.kind === 'focus' ? 'Start' : 'Open'}</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!d.suggestions.length && !d.narrative && !d.narrativeWithheld && <p className="text-sm muted">Nothing pressing today. Add tasks, habits or goals to get suggestions.</p>}
        </div>
      )}
    </Card>
  );
}

function FocusWidget({ query }) {
  const today = todayKey();
  return (
    <WidgetCard
      query={query}
      title="Focus"
      icon={Target}
      rows={5}
      subtitle={query.data && `${query.data.tasks.completedToday} completed today · ${query.data.tasks.openCount} open overall`}
      actions={
        query.data && (
          <>
            <ProgressRing
              size={28}
              stroke={3}
              value={percent(query.data.tasks.completedToday, query.data.tasks.completedToday + query.data.tasks.today.length + query.data.tasks.overdue.length)}
              label="Today's task progress"
            />
            <ViewAll to="/tasks" />
          </>
        )
      }
    >
      {({ tasks }) => (
        <>
          <QuickAddTask defaults={{ dueDate: today }} placeholder="Add a task for today…" />
          <div className="widget-scroll">
            {tasks.overdue.length > 0 && (
              <>
                <SectionLabel count={tasks.overdue.length}>Overdue</SectionLabel>
                <div className="list">{tasks.overdue.slice(0, 5).map((t) => <TaskRow key={t._id} task={t} />)}</div>
              </>
            )}
            <SectionLabel count={tasks.today.length}>Today</SectionLabel>
            {tasks.today.length ? (
              <div className="list">{tasks.today.map((t) => <TaskRow key={t._id} task={t} showDue={!!t.dueTime} />)}</div>
            ) : (
              <EmptyState compact icon={Check} title="Nothing due today" description={tasks.completedToday ? 'Nice work — you cleared your list.' : 'Add a task above to plan your day.'} />
            )}
            {tasks.priority.length > 0 && (
              <>
                <SectionLabel count={tasks.priority.length}>High priority · no date</SectionLabel>
                <div className="list">{tasks.priority.map((t) => <TaskRow key={t._id} task={t} />)}</div>
              </>
            )}
          </div>
        </>
      )}
    </WidgetCard>
  );
}

function ScheduleWidget({ occurrences, eventsQuery }) {
  const openEditor = useEditor();
  const now = new Date();
  const todays = occurrences.filter((o) => occursOnDay(o, now));

  return (
    <Card title="Today's schedule" icon={CalendarDays} flush className="widget" actions={<ViewAll to={`/calendar?view=day&date=${todayKey()}`} label="Calendar" />}>
      {eventsQuery.isPending ? (
        <SkeletonList rows={3} />
      ) : eventsQuery.isError && !eventsQuery.data ? (
        <ErrorState compact error={eventsQuery.error} onRetry={() => eventsQuery.refetch()} />
      ) : todays.length === 0 ? (
        <EmptyState compact icon={CalendarDays} title="Nothing scheduled" description="Your calendar is clear today." action={<Button size="sm" icon={Plus} onClick={() => openEditor('event')}>Add event</Button>} />
      ) : (
        <div className="widget-scroll">
          {todays.map((o) => {
            const past = !o.allDay && o.end < now;
            const current = !o.allDay && o.start <= now && o.end > now;
            return (
              <button key={o.key} type="button" className={clsx('schedule-item', `color-${o.color}`, past && 'is-past')} onClick={() => openEditor('event', { item: o })}>
                <span className="schedule-item__time">{o.allDay ? 'All day' : format(o.start, 'p')}</span>
                <span className="schedule-item__bar" aria-hidden="true" />
                <span className="schedule-item__body">
                  <span className="schedule-item__title">
                    {o.title}
                    {current && <Badge tone="accent">Now</Badge>}
                  </span>
                  <span className="schedule-item__sub">
                    {[!o.allDay && `${format(o.start, 'p')} – ${format(o.end, 'p')}`, o.location, o.isRecurring && 'Repeats'].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function HabitCheckRow({ habit }) {
  const toggle = useToggleHabit();
  const toast = useToast();
  const done = habit.stats.doneToday;
  const shown = toggle.isPending ? !done : done;
  const weekly = habit.frequency === 'weekly';
  return (
    <div className="list-row">
      <Checkbox
        size="lg"
        color={habit.color}
        checked={shown}
        label={`${habit.name}: ${shown ? 'done' : 'not done'} today`}
        onChange={() =>
          toggle.mutate(
            { id: habit._id },
            {
              onSuccess: (payload) => payload?.meta?.done && payload.data.stats.currentStreak > 1 && toast.success(`${payload.data.stats.currentStreak}-${payload.data.stats.streakUnit} streak`, { description: habit.name }),
              onError: (err) => toast.apiError(err, "Couldn't update habit"),
            },
          )
        }
      />
      <span className="habit-emoji" aria-hidden="true">{habit.icon}</span>
      <Link to={`/habits?habit=${habit._id}`} className="grow truncate text-sm weight-medium">{habit.name}</Link>
      <span className="text-xs muted tabular">
        {weekly ? `${habit.stats.weekCount}/${habit.stats.weekTarget} this week` : habit.stats.currentStreak > 0 ? (
          <span className="row" style={{ gap: 3 }}><Flame size={12} aria-hidden="true" />{habit.stats.currentStreak}d</span>
        ) : 'Start today'}
      </span>
    </div>
  );
}

function HabitsWidget({ query }) {
  const openEditor = useEditor();
  return (
    <WidgetCard
      query={query}
      title="Habits"
      icon={Flame}
      subtitle={query.data && (() => {
        const scheduled = query.data.habits.filter((h) => h.stats.scheduledToday && h.frequency === 'daily');
        return `${scheduled.filter((h) => h.stats.doneToday).length} of ${scheduled.length} daily habits done`;
      })()}
      actions={<ViewAll to="/habits" />}
    >
      {({ habits }) => {
        const todays = habits.filter((h) => h.stats.scheduledToday);
        if (!habits.length) {
          return <EmptyState compact icon={Flame} title="No habits yet" description="Small daily actions compound into big results." action={<Button size="sm" icon={Plus} onClick={() => openEditor('habit')}>Create a habit</Button>} />;
        }
        if (!todays.length) return <EmptyState compact icon={Check} title="Rest day" description="No habits are scheduled for today." />;
        return <div className="list widget-scroll">{todays.map((h) => <HabitCheckRow key={h._id} habit={h} />)}</div>;
      }}
    </WidgetCard>
  );
}

function RoutineRow({ routine }) {
  const toggleStep = useToggleRoutineStep();
  const toast = useToast();
  const next = routine.steps.find((s) => !routine.today.completedSteps.includes(s._id));
  return (
    <div className="routine-mini">
      <div className="row row--between">
        <Link to="/routines" className="row" style={{ gap: 8 }}>
          {routine.type === 'evening' ? <Moon size={14} className="muted" aria-hidden="true" /> : <Repeat size={14} className="muted" aria-hidden="true" />}
          <span className="text-sm weight-medium truncate">{routine.name}</span>
        </Link>
        <span className="text-xs muted tabular">
          {routine.timeOfDay && `${formatTimeHM(routine.timeOfDay)} · `}{routine.today.completed}/{routine.today.total}
        </span>
      </div>
      <ProgressBar value={routine.today.pct} size="sm" tone={routine.today.pct === 100 ? 'success' : undefined} label={`${routine.name} progress`} />
      {next ? (
        <button
          type="button"
          className="routine-mini__next"
          disabled={toggleStep.isPending}
          onClick={() => toggleStep.mutate({ id: routine._id, stepId: next._id }, { onError: (err) => toast.apiError(err, "Couldn't update routine") })}
        >
          <span className="check check--square" aria-hidden="true" />
          <span className="truncate">Next: {next.title}</span>
          {next.durationMin > 0 && <span className="muted">{formatDuration(next.durationMin)}</span>}
        </button>
      ) : (
        routine.steps.length > 0 && <p className="text-xs text-success">Completed for today</p>
      )}
    </div>
  );
}

function RoutinesWidget({ query }) {
  const openEditor = useEditor();
  return (
    <WidgetCard query={query} title="Routines" icon={Repeat} flush={false} actions={<ViewAll to="/routines" />}>
      {({ routines }) =>
        routines.length ? (
          <div className="stack">{routines.map((r) => <RoutineRow key={r._id} routine={r} />)}</div>
        ) : (
          <EmptyState compact icon={Repeat} title="No routines today" description="Design a morning or evening routine to run on autopilot." action={<Button size="sm" icon={Plus} onClick={() => openEditor('routine')}>New routine</Button>} />
        )
      }
    </WidgetCard>
  );
}

/* ───────── Upcoming ───────── */

function UpcomingWidget({ query, occurrences }) {
  const openEditor = useEditor();
  const today = todayKey();
  return (
    <WidgetCard query={query} title="Next 7 days" icon={CalendarDays} actions={<ViewAll to="/calendar?view=week" label="Week" />} rows={4}>
      {({ tasks }) => {
        const days = Array.from({ length: 7 }, (_, i) => {
          const date = addDays(fromKey(today), i + 1);
          const key = toKey(date);
          return {
            key,
            date,
            events: occurrences.filter((o) => occursOnDay(o, date)),
            tasks: tasks.upcoming.filter((t) => t.dueDate === key),
          };
        }).filter((d) => d.events.length || d.tasks.length);

        if (!days.length) return <EmptyState compact icon={CalendarDays} title="A quiet week ahead" description="No events or due tasks in the next 7 days." />;
        return (
          <div className="widget-scroll">
            {days.slice(0, 5).map((day) => (
              <div key={day.key} className="day-group">
                <SectionLabel>{relativeDay(day.key)} · {format(day.date, 'MMM d')}</SectionLabel>
                {day.events.map((o) => (
                  <button key={o.key} type="button" className={clsx('upcoming-item', `color-${o.color}`)} onClick={() => openEditor('event', { item: o })}>
                    <span className="dot" aria-hidden="true" />
                    <span className="grow truncate">{o.title}</span>
                    <span className="text-xs muted tabular">{o.allDay ? 'All day' : format(o.start, 'p')}</span>
                  </button>
                ))}
                {day.tasks.map((t) => (
                  <button key={t._id} type="button" className="upcoming-item" onClick={() => openEditor('task', { item: t })}>
                    <CheckSquare size={13} className="muted" aria-hidden="true" />
                    <span className="grow truncate">{t.title}</span>
                    {t.dueTime && <span className="text-xs muted tabular">{formatTimeHM(t.dueTime)}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        );
      }}
    </WidgetCard>
  );
}

function ReminderRow({ reminder }) {
  const complete = useCompleteReminder();
  const toast = useToast();
  const openEditor = useEditor();
  const { daysUntil } = reminder;
  const tone = daysUntil < 0 ? 'danger' : daysUntil <= reminder.leadDays ? 'warning' : undefined;
  return (
    <div className="list-row list-row--interactive" onClick={() => openEditor('reminder', { item: reminder })}>
      <span className="icon-tile icon-tile--sm" aria-hidden="true">{REMINDER_META[reminder.category]?.emoji}</span>
      <div className="grow">
        <div className="text-sm weight-medium truncate">{reminder.title}</div>
        <div className="text-xs muted">{relativeDay(reminder.date)}{reminder.recurrence !== 'none' && ` · ${reminder.recurrence}`}</div>
      </div>
      <Badge tone={tone}>{daysUntil < 0 ? 'Overdue' : countdown(reminder.date)}</Badge>
      <IconButton
        icon={Check}
        size="sm"
        label={`Complete ${reminder.title}`}
        loading={complete.isPending}
        onClick={(e) => {
          e.stopPropagation();
          complete.mutate(reminder._id, {
            onSuccess: (payload) => toast.success(payload.meta.advanced ? 'Done — rescheduled' : 'Reminder completed', { description: payload.meta.advanced ? `Next on ${relativeDay(payload.data.date)}` : reminder.title }),
            onError: (err) => toast.apiError(err, "Couldn't complete reminder"),
          });
        }}
      />
    </div>
  );
}

function RemindersWidget({ query }) {
  const openEditor = useEditor();
  return (
    <WidgetCard query={query} title="Reminders" icon={Bell} actions={<ViewAll to="/reminders" />}>
      {({ reminders }) =>
        reminders.length ? (
          <div className="list widget-scroll">{reminders.slice(0, 7).map((r) => <ReminderRow key={r._id} reminder={r} />)}</div>
        ) : (
          <EmptyState compact icon={Bell} title="No upcoming reminders" description="Birthdays, renewals and deadlines show up here." action={<Button size="sm" icon={Plus} onClick={() => openEditor('reminder')}>Add reminder</Button>} />
        )
      }
    </WidgetCard>
  );
}

/* ───────── Progress ───────── */

function GoalsWidget({ query }) {
  const openEditor = useEditor();
  const today = todayKey();
  return (
    <WidgetCard query={query} title="Goals" icon={Target} flush={false} actions={<ViewAll to="/goals" />}>
      {({ goals }) =>
        goals.length ? (
          <div className="stack" style={{ gap: 14 }}>
            {goals.map((g) => (
              <Link key={g._id} to={`/goals/${g._id}`} className="goal-mini">
                <div className="row row--between">
                  <span className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span className={`dot color-${g.color}`} aria-hidden="true" />
                    <span className="text-sm weight-medium truncate">{g.title}</span>
                  </span>
                  <span className="text-sm weight-semibold tabular">{g.progress}%</span>
                </div>
                <ProgressBar value={g.progress} color={g.color} size="sm" label={`${g.title} progress`} />
                <div className="text-xs muted">
                  {g.stats.milestonesDone}/{g.stats.milestones} milestones
                  {g.deadline && <span className={g.deadline < today ? 'text-danger' : ''}> · due {countdown(g.deadline)}</span>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState compact icon={Target} title="No active goals" description="Set a long-term goal and break it into milestones." action={<Button size="sm" icon={Plus} onClick={() => openEditor('goal')}>New goal</Button>} />
        )
      }
    </WidgetCard>
  );
}

function FinanceWidget({ query }) {
  const { user } = useAuth();
  const openEditor = useEditor();
  const currency = user?.preferences?.currency ?? 'USD';
  return (
    <WidgetCard
      query={query}
      title="Finance"
      icon={Wallet}
      flush={false}
      subtitle={query.data && format(fromKey(`${query.data.finance.month}-01`), 'MMMM yyyy')}
      actions={<><IconButton icon={Plus} size="sm" label="Log expense" onClick={() => openEditor('transaction', { defaults: { type: 'expense' } })} /><ViewAll to="/finance" /></>}
    >
      {({ finance }) => {
        const spentChange = finance.previous.expense ? Math.round(((finance.expense - finance.previous.expense) / finance.previous.expense) * 100) : null;
        return (
          <>
            <div className="mini-stats">
              <div><p className="mini-stat__label">Income</p><p className="mini-stat__value">{formatCurrency(finance.income, currency, { compact: true })}</p></div>
              <div>
                <p className="mini-stat__label">Spent</p>
                <p className="mini-stat__value">{formatCurrency(finance.expense, currency, { compact: true })}</p>
                {spentChange !== null && (
                  <p className="text-xs muted row" style={{ gap: 2 }}>
                    {spentChange > 0 ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />}
                    {Math.abs(spentChange)}% vs last month
                  </p>
                )}
              </div>
              <div><p className="mini-stat__label">Net</p><p className={clsx('mini-stat__value', finance.net < 0 && 'text-danger')}>{formatCurrency(finance.net, currency, { compact: true, signed: true })}</p></div>
            </div>
            {finance.budgets.length ? (
              finance.budgets.map((b) => (
                <div key={b._id} className="budget-line">
                  <div className="budget-line__head">
                    <span>{b.category}</span>
                    <span className="tabular muted">{formatCurrency(b.spent, currency, { compact: true })} / {formatCurrency(b.limit, currency, { compact: true })}</span>
                  </div>
                  <ProgressBar value={b.pct} size="sm" tone={b.pct > 100 ? 'danger' : b.pct > 85 ? 'warning' : undefined} label={`${b.category} budget used`} />
                </div>
              ))
            ) : (
              <p className="text-sm muted">No budgets yet. <Link to="/finance" className="text-accent">Set one up</Link> to track spending.</p>
            )}
          </>
        );
      }}
    </WidgetCard>
  );
}

function HealthWidget({ query }) {
  const addWater = useAddWater();
  const toast = useToast();
  return (
    <WidgetCard query={query} title="Wellness" icon={Droplet} flush={false} actions={<ViewAll to="/health" />}>
      {({ health }) => {
        const water = health.log?.waterMl ?? 0;
        return (
          <div className="wellness">
            <div className="wellness__water">
              <ProgressRing value={percent(water, health.waterGoalMl)} size={76} stroke={6} label={`Water ${percent(water, health.waterGoalMl)}% of goal`}>
                <span className="tabular">{formatLiters(water)}</span>
              </ProgressRing>
              <div>
                <p className="text-sm weight-medium">Water</p>
                <p className="text-xs muted">Goal {formatLiters(health.waterGoalMl)}</p>
                <Button
                  size="sm"
                  icon={Plus}
                  className="mt"
                  loading={addWater.isPending}
                  onClick={() => addWater.mutate({ deltaMl: 250 }, { onError: (err) => toast.apiError(err, "Couldn't log water") })}
                >
                  250 ml
                </Button>
              </div>
            </div>
            <div className="wellness__stats">
              <div>
                <p className="mini-stat__label">Sleep</p>
                <p className="mini-stat__value">{health.log?.sleepHours != null ? `${health.log.sleepHours}h` : '—'}</p>
                <p className="text-xs muted">Goal {health.sleepGoalHours}h</p>
              </div>
              <div>
                <p className="mini-stat__label">Mood</p>
                <p className="mini-stat__value">{health.log?.mood ? MOODS[health.log.mood - 1] : '—'}</p>
                <p className="text-xs muted">{health.log?.energy ? `Energy ${health.log.energy}/5` : 'Not logged'}</p>
              </div>
              <div>
                <p className="mini-stat__label">Workouts</p>
                <p className="mini-stat__value">{health.workouts.count}</p>
                <p className="text-xs muted">{formatDuration(health.workouts.minutes)} · 7 days</p>
              </div>
            </div>
          </div>
        );
      }}
    </WidgetCard>
  );
}

function ProductivityWidget({ query }) {
  const theme = useChartTheme();
  return (
    <WidgetCard query={query} title="This week" icon={TrendingUp} flush={false} actions={<ViewAll to="/analytics" label="Analytics" />}>
      {({ productivity }) => {
        const rows = productivity.map((d) => ({ ...d, label: format(fromKey(d.date), 'EEE') }));
        const total = rows.reduce((s, d) => s + d.tasksCompleted, 0);
        const habitDays = rows.filter((d) => d.habitsPct !== null);
        const habitAvg = habitDays.length ? Math.round(habitDays.reduce((s, d) => s + d.habitsPct, 0) / habitDays.length) : null;
        return (
          <>
            <div className="mini-stats" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <div><p className="mini-stat__label">Tasks completed</p><p className="mini-stat__value">{total}</p></div>
              <div><p className="mini-stat__label">Habit consistency</p><p className="mini-stat__value">{habitAvg === null ? '—' : `${habitAvg}%`}</p></div>
            </div>
            <div style={{ height: 150 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke={theme.chartGrid} />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={theme.axisTick} width={40} />
                  <Tooltip cursor={theme.cursorFill} content={<ChartTooltip labelFormatter={(_, p) => p?.[0] && format(fromKey(p[0].payload.date), 'EEEE, MMM d')} />} />
                  <Bar dataKey="tasksCompleted" name="Tasks completed" fill={theme.chart1} {...BAR_PROPS} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        );
      }}
    </WidgetCard>
  );
}

function DocumentsWidget({ query }) {
  const navigate = useNavigate();
  return (
    <WidgetCard query={query} title="Document alerts" icon={FileText} actions={<ViewAll to="/documents?view=expiring" />}>
      {({ documents }) =>
        documents.length ? (
          <div className="list">
            {documents.map((d) => (
              <button key={d._id} type="button" className="list-row list-row--interactive" style={{ width: '100%', border: 0, background: 'none', textAlign: 'left' }} onClick={() => navigate(`/documents?doc=${d._id}`)}>
                <span className="icon-tile icon-tile--sm" aria-hidden="true">{DOCUMENT_META_EMOJI[d.category] ?? '📄'}</span>
                <div className="grow"><p className="text-sm weight-medium truncate">{d.title}</p><p className="text-xs muted">Expires {formatKeyShort(d.expiryDate)}</p></div>
                <Badge tone={d.daysToExpiry < 0 ? 'danger' : d.daysToExpiry <= (d.remindDaysBefore ?? 30) ? 'warning' : undefined}>{d.daysToExpiry < 0 ? 'Expired' : countdown(d.expiryDate)}</Badge>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState compact icon={FileText} title="No expiring documents" description="Documents with an expiry date in the next 90 days appear here." action={<Button size="sm" icon={Plus} onClick={() => navigate('/documents?upload=1')}>Upload</Button>} />
        )
      }
    </WidgetCard>
  );
}

function FocusTimeWidget({ query }) {
  const theme = useChartTheme();
  const navigate = useNavigate();
  return (
    <WidgetCard query={query} title="Focus time" icon={Timer} flush={false} actions={<ViewAll to="/focus" />}>
      {({ focus }) => {
        const rows = focus.series.map((d) => ({ ...d, label: format(fromKey(d.date), 'EEE') }));
        return (
          <>
            <div className="mini-stats">
              <div><p className="mini-stat__label">Today</p><p className="mini-stat__value">{formatDuration(focus.todayMinutes)}</p></div>
              <div><p className="mini-stat__label">This week</p><p className="mini-stat__value">{formatDuration(focus.weekMinutes)}</p></div>
              <div><p className="mini-stat__label">Streak</p><p className="mini-stat__value">{focus.streak}d</p></div>
            </div>
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} stroke={theme.chartGrid} />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={theme.axisTick} width={40} />
                  <Tooltip cursor={theme.cursorFill} content={<ChartTooltip valueFormatter={(v) => `${v} min`} />} />
                  <Bar dataKey="minutes" name="Focus" fill={theme.chart1} {...BAR_PROPS} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {focus.targets.length > 0 && <p className="text-xs muted" style={{ marginTop: 8 }}>Mostly on: {focus.targets.map((t) => `${t.title} (${formatDuration(t.minutes)})`).join(', ')}</p>}
            <Button size="sm" icon={Play} className="mt" onClick={() => navigate('/focus')}>Start a session</Button>
          </>
        );
      }}
    </WidgetCard>
  );
}

const DOCUMENT_META_EMOJI = { identity: '🪪', education: '🎓', finance: '🏦', insurance: '🛡️', health: '🩺', legal: '⚖️', travel: '✈️', work: '💼', property: '🏠', vehicle: '🚗', bills: '🧾', other: '📄' };
const formatKeyShort = (key) => format(fromKey(key), 'MMM d, yyyy');

const WIDGETS = {
  brief: BriefWidget,
  focus: FocusWidget,
  documents: DocumentsWidget,
  focusTime: FocusTimeWidget,
  schedule: ScheduleWidget,
  habits: HabitsWidget,
  routines: RoutinesWidget,
  upcoming: UpcomingWidget,
  reminders: RemindersWidget,
  goals: GoalsWidget,
  finance: FinanceWidget,
  health: HealthWidget,
  productivity: ProductivityWidget,
};

/* ───────── Customization ───────── */

function CustomizeModal({ open, onClose, widgets }) {
  return open ? <CustomizeBody onClose={onClose} widgets={widgets} /> : null;
}

function CustomizeBody({ onClose, widgets }) {
  const { updateProfile } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(widgets);
  const [saving, setSaving] = useState(false);

  const move = (id, delta) =>
    setList((current) => {
      const section = DASHBOARD_WIDGETS[id].section;
      const sectionIds = current.filter((w) => DASHBOARD_WIDGETS[w.id].section === section).map((w) => w.id);
      const pos = sectionIds.indexOf(id);
      const swapWith = sectionIds[pos + delta];
      if (!swapWith) return current;
      const next = [...current];
      const a = next.findIndex((w) => w.id === id);
      const b = next.findIndex((w) => w.id === swapWith);
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({ preferences: { dashboardWidgets: list } });
      toast.success('Dashboard updated');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't save layout");
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Customize dashboard"
      description="Choose which widgets appear and in what order."
      footer={
        <>
          <Button variant="ghost" className="modal__footer-start" onClick={() => setList(Object.keys(DASHBOARD_WIDGETS).map((id) => ({ id, visible: true })))}>
            Reset to default
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving}>Save layout</Button>
        </>
      }
    >
      {DASHBOARD_SECTIONS.map((section) => {
        const items = list.filter((w) => DASHBOARD_WIDGETS[w.id].section === section.id);
        return (
          <div key={section.id} className="customize-section">
            <p className="customize-section__title">{section.label}</p>
            {items.map((w, i) => {
              const meta = DASHBOARD_WIDGETS[w.id];
              return (
                <div key={w.id} className={clsx('customize-row', !w.visible && 'is-hidden')}>
                  <Switch checked={w.visible} label={`Show ${meta.label}`} onChange={(visible) => setList((l) => l.map((x) => (x.id === w.id ? { ...x, visible } : x)))} />
                  <div className="grow">
                    <p className="text-sm weight-medium">{meta.label}</p>
                    <p className="text-xs muted">{meta.description}</p>
                  </div>
                  <IconButton icon={ArrowUp} size="xs" label={`Move ${meta.label} up`} disabled={i === 0} onClick={() => move(w.id, -1)} />
                  <IconButton icon={ArrowDown} size="xs" label={`Move ${meta.label} down`} disabled={i === items.length - 1} onClick={() => move(w.id, 1)} />
                </div>
              );
            })}
          </div>
        );
      })}
    </Modal>
  );
}
