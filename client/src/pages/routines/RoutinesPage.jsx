import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Check, CheckCheck, CheckCircle2, Clock, Moon, Pause, Pencil, Play, Plus, Power, Repeat, RotateCcw, SkipForward, Sun, Trash2 } from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, ErrorState, Menu, Modal, PageHeader, ProgressBar, Skeleton,
} from '../../components/ui';
import { useCompleteRoutine, useResetRoutine, useRoutines, useToggleRoutineStep, useUpdateRoutine } from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { WEEKDAYS } from '../../lib/constants';
import { formatKey, formatTimeHM } from '../../lib/dates';
import { formatDuration } from '../../lib/format';

const TYPE_ICON = { morning: Sun, evening: Moon, custom: Repeat };

const daysLabel = (days) => (!days.length || days.length === 7 ? 'Every day' : days.map((d) => WEEKDAYS[d]).join(', '));

export default function RoutinesPage() {
  const routines = useRoutines();
  const openEditor = useEditor();
  const [runningId, setRunningId] = useState(null);

  const list = routines.data ?? [];
  const active = list.filter((r) => r.active);
  const paused = list.filter((r) => !r.active);
  const today = active.filter((r) => r.today.scheduled && r.steps.length);
  const avg = today.length ? Math.round(today.reduce((s, r) => s + r.today.pct, 0) / today.length) : 0;
  const running = list.find((r) => r._id === runningId);

  return (
    <div className="page page--wide">
      <PageHeader
        title="Routines"
        subtitle={routines.data ? `${today.length} scheduled today · ${avg}% complete` : 'Repeatable sequences for your mornings, evenings and more.'}
        actions={<Button variant="primary" icon={Plus} onClick={() => openEditor('routine')}>New routine</Button>}
      />

      {routines.isPending ? (
        <div className="routine-grid">
          {Array.from({ length: 3 }, (_, i) => <Card key={i}><Skeleton height={20} width="50%" /><Skeleton height={120} style={{ marginTop: 16 }} /></Card>)}
        </div>
      ) : routines.isError && !routines.data ? (
        <Card><ErrorState error={routines.error} onRetry={() => routines.refetch()} /></Card>
      ) : !list.length ? (
        <Card>
          <EmptyState
            icon={Repeat}
            title="Create your first routine"
            description="Bundle small steps into a morning or evening routine and check them off each day."
            action={
              <>
                <Button variant="primary" icon={Sun} onClick={() => openEditor('routine', { defaults: { type: 'morning' } })}>Morning routine</Button>
                <Button icon={Moon} onClick={() => openEditor('routine', { defaults: { type: 'evening' } })}>Evening routine</Button>
              </>
            }
          />
        </Card>
      ) : (
        <>
          <div className="routine-grid stagger">
            {active.map((r) => <RoutineCard key={r._id} routine={r} onStart={() => setRunningId(r._id)} />)}
          </div>
          {paused.length > 0 && (
            <>
              <h2 className="dash-section__title" style={{ margin: '28px 0 10px' }}>Paused</h2>
              <div className="routine-grid">{paused.map((r) => <RoutineCard key={r._id} routine={r} onStart={() => setRunningId(r._id)} />)}</div>
            </>
          )}
        </>
      )}

      <Modal open={!!running} onClose={() => setRunningId(null)} title={running?.name} size="sm">
        {running && <RoutineRunner routine={running} onClose={() => setRunningId(null)} />}
      </Modal>

      <style>{`
        .routine-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; align-items: start; }
        .routine-step { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 36px; padding: 4px 8px; margin: 0 -8px; width: calc(100% + 16px); border: 0; border-radius: var(--radius-sm); background: none; text-align: left; cursor: pointer; font-size: var(--text-sm); }
        .routine-step:hover { background: var(--surface-hover); }
        .routine-step.is-done .routine-step__title { color: var(--text-muted); text-decoration: line-through; text-decoration-color: var(--text-faint); }
        .routine-history { display: flex; gap: 6px; }
        .routine-history__day { display: flex; flex-direction: column; align-items: center; gap: 3px; color: var(--text-faint); font-size: 10px; }
        .routine-history__dot { width: 14px; height: 14px; border-radius: 4px; background: var(--heat-0); }
        .routine-history__dot.l1 { background: var(--heat-1); }
        .routine-history__dot.l2 { background: var(--heat-2); }
        .routine-history__dot.l3 { background: var(--heat-3); }
        .routine-history__dot.off { background: transparent; box-shadow: inset 0 0 0 1px var(--divider); }
        .runner { text-align: center; padding: 8px 0; }
        .runner__step { font-size: var(--text-xl); font-weight: 650; letter-spacing: -0.02em; margin: 6px 0 14px; }
        .runner__timer { font-size: 2.75rem; font-weight: 600; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
        .runner__dots { display: flex; justify-content: center; gap: 6px; margin: 18px 0; }
        .runner__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border-strong); }
        .runner__dot.is-done { background: var(--success); }
        .runner__dot.is-current { background: var(--accent); transform: scale(1.3); }
      `}</style>
    </div>
  );
}

function RoutineCard({ routine, onStart }) {
  const toggleStep = useToggleRoutineStep();
  const complete = useCompleteRoutine();
  const reset = useResetRoutine();
  const update = useUpdateRoutine();
  const openEditor = useEditor();
  const toast = useToast();
  const Icon = TYPE_ICON[routine.type];
  const totalMin = routine.steps.reduce((s, step) => s + step.durationMin, 0);
  const done = routine.today.pct === 100 && routine.steps.length > 0;
  const onError = (message) => (err) => toast.apiError(err, message);

  return (
    <Card
      className={clsx(!routine.active && 'is-paused')}
      title={
        <span className="row" style={{ gap: 10 }}>
          <span className="icon-tile icon-tile--sm" aria-hidden="true"><Icon /></span>
          {routine.name}
        </span>
      }
      subtitle={[routine.timeOfDay && formatTimeHM(routine.timeOfDay), daysLabel(routine.days), totalMin > 0 && formatDuration(totalMin)].filter(Boolean).join(' · ')}
      actions={
        <>
          {!routine.today.scheduled && routine.active && <Badge>Not today</Badge>}
          {done && <Badge tone="success" icon={CheckCircle2}>Done</Badge>}
          <Menu
            label={`Actions for ${routine.name}`}
            items={[
              { label: 'Edit routine', icon: Pencil, onSelect: () => openEditor('routine', { item: routine }) },
              { label: 'Mark all steps done', icon: CheckCheck, disabled: done || !routine.steps.length, onSelect: () => complete.mutate(routine._id, { onSuccess: () => toast.success('Routine completed'), onError: onError("Couldn't complete routine") }) },
              { label: "Reset today's progress", icon: RotateCcw, disabled: routine.today.completed === 0, onSelect: () => reset.mutate(routine._id, { onError: onError("Couldn't reset routine") }) },
              {
                label: routine.active ? 'Pause routine' : 'Activate routine',
                icon: Power,
                onSelect: () => update.mutate({ id: routine._id, active: !routine.active }, { onSuccess: () => toast.success(routine.active ? 'Routine paused' : 'Routine activated'), onError: onError("Couldn't update routine") }),
              },
              { separator: true },
              { label: 'Delete…', icon: Trash2, danger: true, onSelect: () => openEditor('routine', { item: routine }) },
            ]}
          />
        </>
      }
    >
      <div className="row row--between text-xs muted" style={{ marginBottom: 6 }}>
        <span>{routine.today.completed} of {routine.today.total} steps</span>
        <span className="tabular">{routine.today.pct}%</span>
      </div>
      <ProgressBar value={routine.today.pct} tone={done ? 'success' : undefined} label={`${routine.name} progress today`} />

      <div style={{ margin: '12px 0' }}>
        {routine.steps.length === 0 ? (
          <p className="text-sm muted">No steps yet — edit the routine to add some.</p>
        ) : (
          routine.steps.map((step) => {
            const isDone = routine.today.completedSteps.includes(step._id);
            const pending = toggleStep.isPending && toggleStep.variables?.stepId === step._id;
            const shown = pending ? !isDone : isDone;
            return (
              <button
                key={step._id}
                type="button"
                role="checkbox"
                aria-checked={shown}
                className={clsx('routine-step', shown && 'is-done')}
                onClick={() => toggleStep.mutate({ id: routine._id, stepId: step._id }, { onError: onError("Couldn't update step") })}
              >
                <span className="check check--square" aria-checked={shown} aria-hidden="true"><Check /></span>
                <span className="routine-step__title grow">{step.title}{step.habit && <span className="text-xs muted" title="Linked habit — checking this step records the habit"> · 🔥 habit</span>}</span>
                {step.durationMin > 0 && <span className="text-xs muted tabular">{formatDuration(step.durationMin)}</span>}
              </button>
            );
          })
        )}
      </div>

      <div className="row row--between" style={{ paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
        <div className="routine-history" aria-label="Last 7 days">
          {routine.history.map((h) => (
            <span key={h.date} className="routine-history__day" title={`${formatKey(h.date, 'EEE, MMM d')}: ${h.scheduled ? `${h.pct}%` : 'not scheduled'}`}>
              <span className={clsx('routine-history__dot', !h.scheduled ? 'off' : h.pct === 100 ? 'l3' : h.pct >= 50 ? 'l2' : h.pct > 0 ? 'l1' : '')} />
              {formatKey(h.date, 'EEEEE')}
            </span>
          ))}
        </div>
        <Button size="sm" icon={Play} onClick={onStart} disabled={!routine.steps.length || done}>Start</Button>
      </div>
    </Card>
  );
}

function RoutineRunner({ routine, onClose }) {
  const toggleStep = useToggleRoutineStep();
  const toast = useToast();
  const [skipped, setSkipped] = useState([]);
  const remaining = routine.steps.filter((s) => !routine.today.completedSteps.includes(s._id));
  const current = remaining.find((s) => !skipped.includes(s._id));
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setSeconds((current?.durationMin ?? 0) * 60);
    setPaused(false);
  }, [current?._id, current?.durationMin]);

  useEffect(() => {
    if (paused || seconds <= 0) return undefined;
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [paused, seconds]);

  if (!current) {
    const allDone = remaining.length === 0;
    return (
      <div className="runner">
        <EmptyState
          icon={allDone ? CheckCircle2 : SkipForward}
          title={allDone ? 'Routine complete' : 'End of routine'}
          description={allDone ? 'Every step is checked off for today. Great work.' : `${remaining.length} skipped step${remaining.length === 1 ? '' : 's'} left unchecked.`}
          action={<Button variant="primary" onClick={onClose}>Close</Button>}
        />
      </div>
    );
  }

  const index = routine.steps.findIndex((s) => s._id === current._id);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div className="runner">
      <p className="text-xs muted">Step {index + 1} of {routine.steps.length}</p>
      <p className="runner__step">{current.title}</p>
      {current.durationMin > 0 && (
        <>
          <p className="runner__timer" role="timer" aria-live="off">{mm}:{ss}</p>
          <p className="text-xs muted row" style={{ justifyContent: 'center', gap: 4 }}>
            <Clock size={12} aria-hidden="true" />{seconds === 0 ? "Time's up" : `${formatDuration(current.durationMin)} planned`}
          </p>
        </>
      )}
      <div className="runner__dots" aria-hidden="true">
        {routine.steps.map((s) => (
          <span key={s._id} className={clsx('runner__dot', routine.today.completedSteps.includes(s._id) && 'is-done', s._id === current._id && 'is-current')} />
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
        {current.durationMin > 0 && (
          <Button icon={paused ? Play : Pause} onClick={() => setPaused((p) => !p)} disabled={seconds === 0}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
        )}
        <Button variant="ghost" icon={SkipForward} onClick={() => setSkipped((list) => [...list, current._id])}>Skip</Button>
        <Button
          variant="primary"
          icon={CheckCircle2}
          loading={toggleStep.isPending}
          data-autofocus
          onClick={() => toggleStep.mutate({ id: routine._id, stepId: current._id }, { onError: (err) => toast.apiError(err, "Couldn't complete step") })}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
