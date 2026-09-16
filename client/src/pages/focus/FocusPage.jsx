import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Clock, Flame, Pause, Play, Plus, Square, Target, Timer, Trash2 } from 'lucide-react';
import {
  Button, Card, EmptyState, ErrorState, Field, IconButton, Input, PageHeader, ProgressRing, Select, Skeleton, SkeletonList, StatTile, Textarea,
} from '../../components/ui';
import { ChartCard } from '../../components/ChartCard';
import { FormModal } from '../../components/FormModal';
import { BAR_PROPS, ChartTooltip, useChartTheme } from '../../components/charts';
import { useActiveFocus, useDeleteFocus, useFocusCommand, useFocusSessions, useFocusSummary, useGoals, useLogFocus, useProjects, useStartFocus, useTasks } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFormState } from '../../hooks/useFormState';
import { addDaysKey, formatKey, fromKey, relativeDay, todayKey } from '../../lib/dates';
import { formatDuration, pluralize } from '../../lib/format';
import { mmss, useFocusClock } from '../../features/focus/FocusPill';

const PRESETS = [
  { value: 25, label: '25 · Pomodoro' },
  { value: 45, label: '45' },
  { value: 50, label: '50' },
  { value: 90, label: '90 · Deep' },
];

export default function FocusPage() {
  const active = useActiveFocus();
  const summary = useFocusSummary(30);
  const sessions = useFocusSessions({ from: addDaysKey(todayKey(), -13), limit: 40 });
  const theme = useChartTheme();
  const [logging, setLogging] = useState(false);
  const s = summary.data;

  const series = useMemo(() => (s?.series ?? []).slice(-14).map((d) => ({ ...d, label: format(fromKey(d.date), 'EEE d') })), [s]);

  return (
    <div className="page page--wide">
      <PageHeader title="Focus" subtitle="Protected time for the work that matters." actions={<Button icon={Plus} onClick={() => setLogging(true)}>Log past session</Button>} />

      <div className="split" style={{ marginBottom: 16 }}>
        <Card>
          {active.isPending ? <Skeleton height={220} /> : active.isError ? <ErrorState compact error={active.error} onRetry={() => active.refetch()} /> : active.data ? <ActiveSession session={active.data} /> : <StartSession />}
        </Card>
        <div className="stack" style={{ gap: 12 }}>
          {!s ? (
            Array.from({ length: 3 }, (_, i) => <div key={i} className="card stat"><Skeleton width="40%" /><Skeleton height={24} width="50%" style={{ marginTop: 10 }} /></div>)
          ) : (
            <>
              <StatTile icon={Timer} label="Today" value={formatDuration(s.todayMinutes)} meta={pluralize(s.todaySessions, 'session')} />
              <StatTile icon={Clock} label="This week" value={formatDuration(s.weekMinutes)} meta={`${formatDuration(s.totalMinutes)} in the last 30 days`} />
              <StatTile icon={Flame} label="Focus streak" value={pluralize(s.streak, 'day')} meta="Consecutive days with a session" />
            </>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <ChartCard title="Focus minutes" subtitle="Last 14 days" height={200} table={{ columns: [{ key: 'label', label: 'Day' }, { key: 'minutes', label: 'Minutes', numeric: true }, { key: 'sessions', label: 'Sessions', numeric: true }], rows: series }}>
          {!s ? <Skeleton height="100%" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid vertical={false} stroke={theme.chartGrid} />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: theme.chartBaseline }} tick={theme.axisTick} interval="preserveStartEnd" minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} tick={theme.axisTick} width={40} allowDecimals={false} />
                <Tooltip cursor={theme.cursorFill} content={<ChartTooltip valueFormatter={(v) => `${v} min`} />} />
                <Bar dataKey="minutes" name="Focus" fill={theme.chart1} {...BAR_PROPS} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
        <Card title="Where your focus went" subtitle="Last 30 days, by goal or project">
          {!s ? <SkeletonList rows={4} /> : !s.targets.length ? (
            <EmptyState compact icon={Target} title="No sessions yet" description="Link sessions to a task, project or goal to see where your time goes." />
          ) : (
            <div className="stack stack--sm">
              {s.targets.map((t, i) => (
                <div key={i} className="row row--between text-sm">
                  <span className="row" style={{ gap: 8, minWidth: 0 }}>
                    {t.color && <span className={`dot color-${t.color}`} aria-hidden="true" />}
                    <span className="truncate">{t.title}</span>
                    <span className="text-xs faint">{t.type !== 'none' ? t.type : ''}</span>
                  </span>
                  <span className="tabular weight-medium">{formatDuration(t.minutes)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Recent sessions" icon={Timer} flush>
        {sessions.isPending ? <SkeletonList rows={4} /> : sessions.isError ? <ErrorState compact error={sessions.error} onRetry={() => sessions.refetch()} /> : !sessions.data.length ? (
          <EmptyState compact icon={Timer} title="No sessions in the last two weeks" description="Start a timer above, or log a session you did offline." />
        ) : (
          <div className="list">{sessions.data.map((x) => <SessionRow key={x._id} session={x} />)}</div>
        )}
      </Card>

      {logging && <LogSessionModal onClose={() => setLogging(false)} />}
    </div>
  );
}

function useTargets() {
  const tasks = useTasks({ view: 'open' });
  const goals = useGoals();
  const projects = useProjects();
  return {
    tasks: (tasks.data ?? []).map((t) => ({ value: t._id, label: t.title })),
    goals: (goals.data ?? []).map((g) => ({ value: g._id, label: g.title })),
    projects: (projects.data ?? []).map((p) => ({ value: p._id, label: p.title })),
  };
}

function StartSession() {
  const { user } = useAuth();
  const [minutes, setMinutes] = useState(user?.preferences?.focusMinutes ?? 25);
  const [custom, setCustom] = useState('');
  const [label, setLabel] = useState('');
  const [task, setTask] = useState('');
  const [goal, setGoal] = useState('');
  const [project, setProject] = useState('');
  const targets = useTargets();
  const start = useStartFocus();
  const toast = useToast();
  const planned = custom ? Math.min(480, Math.max(1, Number(custom) || 0)) : minutes;

  return (
    <div className="focus-timer">
      <ProgressRing value={0} size={168} stroke={10} label="Timer ready"><span className="focus-timer__ring-text" style={{ fontSize: '2.25rem', fontWeight: 600, letterSpacing: '-0.03em' }}>{mmss(planned * 60)}</span></ProgressRing>
      <div className="focus-presets" role="radiogroup" aria-label="Session length">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" role="radio" aria-checked={!custom && minutes === p.value} className="choice" onClick={() => { setMinutes(p.value); setCustom(''); }}>{p.label}</button>
        ))}
        <input className="input input--sm" style={{ width: 90 }} type="number" min={1} max={480} placeholder="Custom" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom minutes" />
      </div>
      <div className="stack" style={{ width: '100%', maxWidth: 420, gap: 8 }}>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What are you focusing on?" maxLength={200} aria-label="Session label" />
        <div className="form-row">
          <Select size="sm" value={task} onChange={(e) => setTask(e.target.value)} placeholder="Link task" options={targets.tasks} aria-label="Link task" />
          <Select size="sm" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Link project" options={targets.projects} aria-label="Link project" />
          <Select size="sm" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Link goal" options={targets.goals} aria-label="Link goal" />
        </div>
      </div>
      <Button
        variant="primary"
        size="lg"
        icon={Play}
        loading={start.isPending}
        onClick={() => start.mutate({ mode: planned === 25 ? 'pomodoro' : 'custom', plannedMinutes: planned, label: label.trim() || (targets.tasks.find((t) => t.value === task)?.label ?? ''), task: task || null, goal: goal || null, project: project || null }, { onError: (err) => toast.apiError(err, "Couldn't start session") })}
      >
        Start {planned}-minute session
      </Button>
    </div>
  );
}

function ActiveSession({ session }) {
  const clock = useFocusClock(session);
  const command = useFocusCommand();
  const toast = useToast();
  const confirm = useConfirm();
  const notifiedRef = useRef(false);
  const paused = session.status === 'paused';

  useEffect(() => {
    document.title = `${mmss(clock.remaining)} · Focus · LifeNexus`;
    return () => { document.title = 'LifeNexus'; };
  }, [clock.remaining]);

  useEffect(() => {
    if (clock.remaining === 0 && !notifiedRef.current && !paused) {
      notifiedRef.current = true;
      toast.info("Time's up", { description: 'Wrap up and mark the session complete.' });
      try {
        if ('Notification' in window && Notification.permission === 'granted') new Notification('Focus session complete', { body: session.label || 'Nice work.' });
      } catch { /* notifications unsupported */ }
    }
  }, [clock.remaining, paused, session.label, toast]);

  const run = (cmd, body) => command.mutate({ id: session._id, command: cmd, ...body }, { onError: (err) => toast.apiError(err, `Couldn't ${cmd} session`) });

  return (
    <div className="focus-timer">
      <ProgressRing value={clock.pct} size={168} stroke={10} label={`${Math.round(clock.pct)}% of session elapsed`}>
        <span style={{ fontSize: '2.25rem', fontWeight: 600, letterSpacing: '-0.03em' }}>{clock.overtime ? `+${mmss(clock.elapsed - clock.total)}` : mmss(clock.remaining)}</span>
      </ProgressRing>
      <div>
        <p className="weight-semibold">{session.label || session.task?.title || 'Focus session'}</p>
        <p className="focus-timer__label">
          {paused ? 'Paused' : clock.overtime ? 'Overtime — finish when ready' : `${session.plannedMinutes} min planned`}
          {session.goal && ` · ${session.goal.title}`}
          {session.project && ` · ${session.project.title}`}
        </p>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {paused ? <Button variant="primary" icon={Play} onClick={() => run('resume')} loading={command.isPending}>Resume</Button> : <Button icon={Pause} onClick={() => run('pause')} loading={command.isPending}>Pause</Button>}
        <Button variant="primary" icon={CheckCircle2} onClick={() => run('complete')} loading={command.isPending}>Complete</Button>
        <Button
          variant="ghost"
          icon={Square}
          onClick={async () => (await confirm({ title: 'Abandon this session?', description: 'It will be recorded as abandoned and not counted.', confirmLabel: 'Abandon' })) && run('abandon')}
        >
          Abandon
        </Button>
      </div>
    </div>
  );
}

function SessionRow({ session }) {
  const remove = useDeleteFocus();
  const confirm = useConfirm();
  const minutes = Math.round(session.focusedSeconds / 60);
  return (
    <div className="list-row">
      <span className={`icon-tile icon-tile--sm ${session.status === 'abandoned' ? '' : 'color-indigo'}`} aria-hidden="true"><Timer /></span>
      <div className="grow">
        <p className="text-sm weight-medium">{session.label || session.task?.title || 'Focus session'}{session.status === 'abandoned' && <span className="muted"> · abandoned</span>}</p>
        <p className="text-xs muted">{relativeDay(session.date)} · {formatKey(session.date, 'MMM d')}{session.goal && ` · ${session.goal.title}`}{session.project && ` · ${session.project.title}`}</p>
      </div>
      <span className="text-sm weight-medium tabular">{formatDuration(minutes)}<span className="muted"> / {session.plannedMinutes}m</span></span>
      <IconButton icon={Trash2} size="sm" label="Delete session" onClick={async () => (await confirm({ title: 'Delete this session?' })) && remove.mutate(session._id)} />
    </div>
  );
}

function LogSessionModal({ onClose }) {
  const log = useLogFocus();
  const toast = useToast();
  const targets = useTargets();
  const form = useFormState({ date: todayKey(), focusedMinutes: '45', label: '', task: '', goal: '', project: '', notes: '' });
  const submit = async () => {
    if (!form.validate({ focusedMinutes: (v) => (!(Number(v) >= 1) ? 'At least 1 minute' : null), date: (v) => (!v || v > todayKey() ? 'Pick a past date' : null) })) return;
    const m = Math.round(Number(form.values.focusedMinutes));
    try {
      await log.mutateAsync({ date: form.values.date, plannedMinutes: m, focusedMinutes: m, label: form.values.label, task: form.values.task || null, goal: form.values.goal || null, project: form.values.project || null, notes: form.values.notes });
      toast.success('Session logged');
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };
  return (
    <FormModal title="Log a focus session" size="sm" onClose={onClose} onSubmit={submit} submitLabel="Log session" submitting={log.isPending}>
      <div className="form-row">
        <Field label="Date" error={form.errors.date}><Input type="date" {...form.bind('date')} max={todayKey()} /></Field>
        <Field label="Minutes" error={form.errors.focusedMinutes}><Input type="number" min={1} max={480} {...form.bind('focusedMinutes')} data-autofocus /></Field>
      </div>
      <Field label="What did you work on?" optional><Input {...form.bind('label')} maxLength={200} /></Field>
      <Field label="Link to" optional>
        <div className="form-row">
          <Select size="sm" {...form.bind('task')} placeholder="Task" options={targets.tasks} />
          <Select size="sm" {...form.bind('project')} placeholder="Project" options={targets.projects} />
          <Select size="sm" {...form.bind('goal')} placeholder="Goal" options={targets.goals} />
        </div>
      </Field>
      <Field label="Notes" optional><Textarea {...form.bind('notes')} rows={2} maxLength={1000} /></Field>
    </FormModal>
  );
}
