import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  Archive, ArrowLeft, CalendarClock, CheckCircle2, Flag, FolderKanban, Pause, Pencil, PiggyBank, Play, Plus, RotateCcw, Sparkles, Target, Timer, Trash2,
} from 'lucide-react';
import { ConnectionsPanel } from '../../components/ConnectionsPanel';
import { useStartFocus } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { formatDuration } from '../../lib/format';
import {
  Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, Menu, PageHeader, ProgressRing, SectionLabel, Skeleton, SkeletonList,
} from '../../components/ui';
import { FormModal } from '../../components/FormModal';
import { TaskRow } from '../../features/tasks/TaskRow';
import { useAddMilestone, useDeleteMilestone, useGoal, useUpdateGoal, useUpdateMilestone } from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFormState } from '../../hooks/useFormState';
import { GOAL_CATEGORIES } from '../../lib/constants';
import { countdown, daysBetween, formatKey, relativeDay, todayKey } from '../../lib/dates';
import './goals.css';

const CATEGORY_LABEL = Object.fromEntries(GOAL_CATEGORIES.map((c) => [c.value, c.label]));

export default function GoalDetailPage() {
  const { id } = useParams();
  const goal = useGoal(id);

  if (goal.isPending) {
    return (
      <div className="page">
        <Skeleton width={120} />
        <Skeleton width="50%" height={30} style={{ margin: '12px 0 24px' }} />
        <div className="split"><Card flush><SkeletonList rows={6} /></Card><Card><SkeletonList rows={3} /></Card></div>
      </div>
    );
  }

  if (goal.isError) {
    return (
      <div className="page">
        <Card>
          {goal.error.status === 404 ? (
            <EmptyState icon={Target} title="Goal not found" description="It may have been deleted." action={<Link to="/goals" className="btn btn--secondary"><span className="btn__content">Back to goals</span></Link>} />
          ) : (
            <ErrorState error={goal.error} onRetry={() => goal.refetch()} />
          )}
        </Card>
      </div>
    );
  }

  return <GoalDetail goal={goal.data} />;
}

function GoalDetail({ goal }) {
  const openEditor = useEditor();
  const updateGoal = useUpdateGoal();
  const startFocus = useStartFocus();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const today = todayKey();
  const [editingMilestone, setEditingMilestone] = useState(null);
  const focusNow = () =>
    startFocus.mutate(
      { plannedMinutes: user?.preferences?.focusMinutes ?? 25, label: goal.title, goal: goal._id, task: goal.tasks.find((t) => t.status !== 'done')?._id ?? null },
      { onSuccess: () => navigate('/focus'), onError: (err) => toast.apiError(err, "Couldn't start focus session") },
    );

  const setStatus = (status, message) =>
    updateGoal.mutate({ id: goal._id, status }, { onSuccess: () => toast.success(message), onError: (err) => toast.apiError(err, "Couldn't update goal") });

  const unassigned = goal.tasks.filter((t) => !t.milestone || !goal.milestones.some((m) => m._id === t.milestone));

  let timeline = null;
  if (goal.startDate && goal.deadline && goal.deadline > goal.startDate) {
    const total = daysBetween(goal.startDate, goal.deadline);
    const elapsed = Math.min(total, Math.max(0, daysBetween(goal.startDate, today)));
    const elapsedPct = Math.round((elapsed / total) * 100);
    timeline = { elapsedPct, onTrack: goal.progress >= elapsedPct - 10 };
  }

  return (
    <div className="page">
      <Link to="/goals" className="btn btn--ghost btn--sm" style={{ marginLeft: -8, marginBottom: 8 }}>
        <span className="btn__content"><ArrowLeft aria-hidden="true" />Goals</span>
      </Link>
      <PageHeader
        eyebrow={
          <span className="row" style={{ gap: 8 }}>
            <span className={`dot color-${goal.color}`} aria-hidden="true" />
            {CATEGORY_LABEL[goal.category]}
            {goal.status !== 'active' && <Badge tone={goal.status === 'completed' ? 'success' : undefined}>{goal.status}</Badge>}
          </span>
        }
        title={goal.title}
        subtitle={goal.description}
        actions={
          <>
            <Button icon={Play} onClick={focusNow} loading={startFocus.isPending}>Focus</Button>
            <Button icon={Sparkles} onClick={() => navigate(`/ai?context=goal:${goal._id}&prompt=${encodeURIComponent(`How am I progressing toward "${goal.title}"? What should I do next?`)}`)}>Ask AI</Button>
            {goal.status === 'completed' ? (
              <Button icon={RotateCcw} onClick={() => setStatus('active', 'Goal reopened')} loading={updateGoal.isPending}>Reopen</Button>
            ) : (
              <Button icon={CheckCircle2} onClick={() => setStatus('completed', 'Goal completed — congratulations!')} loading={updateGoal.isPending}>Mark complete</Button>
            )}
            <Button variant="primary" icon={Pencil} onClick={() => openEditor('goal', { item: goal })}>Edit</Button>
            <Menu
              label="More goal actions"
              size="md"
              items={[
                goal.status === 'paused'
                  ? { label: 'Resume', icon: Play, onSelect: () => setStatus('active', 'Goal resumed') }
                  : { label: 'Pause', icon: Pause, onSelect: () => setStatus('paused', 'Goal paused'), disabled: goal.status !== 'active' },
                { label: goal.status === 'archived' ? 'Unarchive' : 'Archive', icon: Archive, onSelect: () => setStatus(goal.status === 'archived' ? 'active' : 'archived', goal.status === 'archived' ? 'Goal restored' : 'Goal archived') },
                { separator: true },
                { label: 'Delete goal…', icon: Trash2, danger: true, onSelect: () => openEditor('goal', { item: goal }) },
              ]}
            />
          </>
        }
      />

      <div className="split">
        <div className="stack" style={{ gap: 16 }}>
          <MilestonesCard goal={goal} onEdit={setEditingMilestone} />

          <Card title="Projects" icon={FolderKanban} subtitle={goal.projects?.length ? `${goal.projects.length} project${goal.projects.length === 1 ? '' : 's'} working toward this goal` : undefined} flush actions={<Button size="sm" icon={Plus} onClick={() => openEditor('project', { defaults: { goal: goal._id }, onSaved: (p) => navigate(`/projects/${p._id}`) })}>Add project</Button>}>
            {goal.projects?.length ? (
              <div className="list">
                {goal.projects.map((p) => (
                  <Link key={p._id} to={`/projects/${p._id}`} className="list-row list-row--interactive">
                    <span className={`dot color-${p.color}`} aria-hidden="true" />
                    <div className="grow"><p className="text-sm weight-medium">{p.title}</p><p className="text-xs muted">{p.stats.tasksDone}/{p.stats.tasks} tasks{p.stats.focusMinutes ? ` · ${formatDuration(p.stats.focusMinutes)} focused` : ''}{p.status !== 'active' ? ` · ${p.status.replace('_', ' ')}` : ''}</p></div>
                    <span className="text-sm weight-semibold tabular">{p.progress}%</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState compact icon={FolderKanban} title="No projects yet" description="Group the work for this goal into projects." />
            )}
          </Card>

          <Card
            title="Tasks"
            icon={CheckCircle2}
            subtitle={`${goal.stats.tasksDone} of ${goal.stats.tasks} complete`}
            flush
            actions={<Button size="sm" icon={Plus} onClick={() => openEditor('task', { defaults: { goal: goal._id } })}>Add task</Button>}
          >
            {goal.tasks.length === 0 ? (
              <EmptyState compact icon={CheckCircle2} title="No tasks linked yet" description="Break milestones into concrete next actions." />
            ) : (
              <>
                {goal.milestones.map((m) => {
                  const tasks = goal.tasks.filter((t) => t.milestone === m._id);
                  if (!tasks.length) return null;
                  return (
                    <div key={m._id}>
                      <SectionLabel count={`${tasks.filter((t) => t.status === 'done').length}/${tasks.length}`}>{m.title}</SectionLabel>
                      <div className="list">{tasks.map((t) => <TaskRow key={t._id} task={{ ...t, goal: { _id: goal._id, title: goal.title, color: goal.color } }} showGoal={false} />)}</div>
                    </div>
                  );
                })}
                {unassigned.length > 0 && (
                  <div>
                    <SectionLabel count={unassigned.length}>{goal.milestones.length ? 'No milestone' : 'All tasks'}</SectionLabel>
                    <div className="list">{unassigned.map((t) => <TaskRow key={t._id} task={{ ...t, goal: { _id: goal._id, title: goal.title, color: goal.color } }} showGoal={false} />)}</div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Card title="Progress" icon={Target}>
            <div className={`goal-hero color-${goal.color}`}>
              <ProgressRing value={goal.progress} size={96} stroke={8} color={goal.color} label={`${goal.progress}% complete`}>
                {goal.progress}%
              </ProgressRing>
              <div className="stack stack--sm">
                <p className="text-sm"><strong>{goal.stats.milestonesDone}</strong> <span className="muted">of {goal.stats.milestones} milestones</span></p>
                <p className="text-sm"><strong>{goal.stats.tasksDone}</strong> <span className="muted">of {goal.stats.tasks} tasks</span></p>
                {goal.focus?.minutes > 0 && <p className="text-sm row" style={{ gap: 4 }}><Timer size={14} className="muted" aria-hidden="true" /><strong>{formatDuration(goal.focus.minutes)}</strong> <span className="muted">in {goal.focus.sessions} focus sessions</span></p>}
                {goal.savingsGoals?.length > 0 && <p className="text-sm row" style={{ gap: 4 }}><PiggyBank size={14} className="muted" aria-hidden="true" /><strong>{Math.round((goal.savingsGoals.reduce((s, g) => s + g.currentAmount, 0) / Math.max(1, goal.savingsGoals.reduce((s, g) => s + g.targetAmount, 0))) * 100)}%</strong> <span className="muted">of linked savings</span></p>}
                {goal.completedAt && <p className="text-xs text-success">Completed {relativeDay(goal.completedAt.slice(0, 10))}</p>}
              </div>
            </div>
          </Card>

          <ConnectionsPanel type="goal" id={goal._id} compact />

          <Card title="Timeline" icon={CalendarClock}>
            {goal.deadline || goal.startDate ? (
              <div className={`color-${goal.color}`}>
                <div className="row row--between text-xs muted">
                  <span>{goal.startDate ? formatKey(goal.startDate, 'MMM d, yyyy') : 'No start date'}</span>
                  <span>{goal.deadline ? formatKey(goal.deadline, 'MMM d, yyyy') : 'No deadline'}</span>
                </div>
                {timeline && (
                  <>
                    <div className="goal-timeline" aria-hidden="true">
                      <div className="goal-timeline__elapsed" style={{ width: `${timeline.elapsedPct}%` }} />
                      <div className="goal-timeline__progress" style={{ left: `calc(${goal.progress}% - 1px)` }} />
                    </div>
                    <p className="text-xs muted">{timeline.elapsedPct}% of time elapsed · {goal.progress}% done</p>
                  </>
                )}
                {goal.deadline && goal.status === 'active' && (
                  <p className="text-sm" style={{ marginTop: 10 }}>
                    {goal.deadline < today ? <span className="text-danger">Deadline passed {countdown(goal.deadline)}</span> : <>Due <strong>{countdown(goal.deadline)}</strong></>}
                    {timeline && goal.deadline >= today && (
                      <Badge tone={timeline.onTrack ? 'success' : 'warning'} className="" style={{ marginLeft: 8 }}>
                        {timeline.onTrack ? 'On track' : 'Behind'}
                      </Badge>
                    )}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm muted">Add a start date and deadline to see whether you're on track.</p>
            )}
          </Card>
        </div>
      </div>

      <MilestoneModal goalId={goal._id} milestone={editingMilestone} onClose={() => setEditingMilestone(null)} />
    </div>
  );
}

function MilestonesCard({ goal, onEdit }) {
  const [title, setTitle] = useState('');
  const add = useAddMilestone();
  const update = useUpdateMilestone();
  const remove = useDeleteMilestone();
  const toast = useToast();
  const confirm = useConfirm();
  const openEditor = useEditor();
  const today = todayKey();

  const submit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    add.mutate({ goalId: goal._id, title: title.trim() }, { onSuccess: () => setTitle(''), onError: (err) => toast.apiError(err, "Couldn't add milestone") });
  };

  return (
    <Card title="Milestones" icon={Flag} subtitle={`${goal.stats.milestonesDone} of ${goal.stats.milestones} reached`} flush>
      {goal.milestones.length === 0 && <EmptyState compact icon={Flag} title="No milestones yet" description="Milestones mark meaningful checkpoints on the way to your goal." />}
      <div>
        {goal.milestones.map((m) => {
          const taskCount = goal.tasks.filter((t) => t.milestone === m._id).length;
          return (
            <div key={m._id} className={clsx('milestone-row', m.done && 'is-done')}>
              <Checkbox
                checked={m.done}
                color={goal.color}
                label={`Mark milestone "${m.title}" ${m.done ? 'not done' : 'done'}`}
                onChange={(done) =>
                  update.mutate(
                    { goalId: goal._id, milestoneId: m._id, done },
                    { onSuccess: () => done && toast.success('Milestone reached', { description: m.title }), onError: (err) => toast.apiError(err, "Couldn't update milestone") },
                  )
                }
              />
              <div className="grow">
                <p className="milestone-row__title">{m.title}</p>
                <p className="text-xs muted">
                  {[m.dueDate && (m.dueDate < today && !m.done ? `Overdue · ${formatKey(m.dueDate, 'MMM d')}` : `Due ${relativeDay(m.dueDate)}`), taskCount && `${taskCount} task${taskCount === 1 ? '' : 's'}`]
                    .filter(Boolean)
                    .join(' · ') || 'No due date'}
                </p>
              </div>
              <Menu
                label={`Actions for milestone ${m.title}`}
                items={[
                  { label: 'Add task to milestone', icon: Plus, onSelect: () => openEditor('task', { defaults: { goal: goal._id, milestone: m._id } }) },
                  { label: 'Edit milestone', icon: Pencil, onSelect: () => onEdit(m) },
                  { separator: true },
                  {
                    label: 'Delete',
                    icon: Trash2,
                    danger: true,
                    onSelect: async () => {
                      if (!(await confirm({ title: 'Delete this milestone?', description: 'Linked tasks stay on the goal without a milestone.' }))) return;
                      remove.mutate({ goalId: goal._id, milestoneId: m._id }, { onSuccess: () => toast.success('Milestone deleted'), onError: (err) => toast.apiError(err, "Couldn't delete milestone") });
                    },
                  },
                ]}
              />
            </div>
          );
        })}
      </div>
      <form className="add-inline" onSubmit={submit}>
        <Input size="sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone…" aria-label="New milestone" maxLength={200} />
        <Button size="sm" type="submit" icon={Plus} loading={add.isPending} disabled={!title.trim()}>Add</Button>
      </form>
    </Card>
  );
}

function MilestoneModal({ goalId, milestone, onClose }) {
  return milestone ? <MilestoneForm goalId={goalId} milestone={milestone} onClose={onClose} /> : null;
}

function MilestoneForm({ goalId, milestone, onClose }) {
  const update = useUpdateMilestone();
  const toast = useToast();
  const form = useFormState({ title: milestone.title, dueDate: milestone.dueDate ?? '' });

  const submit = async () => {
    if (!form.validate({ title: (v) => (!v.trim() ? 'Title is required' : null) })) return;
    try {
      await update.mutateAsync({ goalId, milestoneId: milestone._id, title: form.values.title.trim(), dueDate: form.values.dueDate || null });
      toast.success('Milestone updated');
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  return (
    <FormModal title="Edit milestone" size="sm" onClose={onClose} onSubmit={submit} submitting={update.isPending}>
      <Field label="Title" error={form.errors.title}>
        <Input {...form.bind('title')} maxLength={200} data-autofocus />
      </Field>
      <Field label="Due date" optional>
        <Input type="date" {...form.bind('dueDate')} />
      </Field>
    </FormModal>
  );
}
