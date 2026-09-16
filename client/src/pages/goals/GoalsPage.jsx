import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarClock, CheckCircle2, Flag, Plus, Target, TrendingUp } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton, StatTile, Tabs } from '../../components/ui';
import { useGoals } from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { GOAL_CATEGORIES } from '../../lib/constants';
import { countdown, daysBetween, formatKey, todayKey } from '../../lib/dates';
import './goals.css';

const CATEGORY_LABEL = Object.fromEntries(GOAL_CATEGORIES.map((c) => [c.value, c.label]));
const STATUS_TABS = ['active', 'paused', 'completed', 'archived', 'all'];

export default function GoalsPage() {
  const [params, setParams] = useSearchParams();
  const status = STATUS_TABS.includes(params.get('status')) ? params.get('status') : 'active';
  const goals = useGoals('all');
  const openEditor = useEditor();
  const today = todayKey();

  const all = goals.data ?? [];
  const visible = status === 'all' ? all : all.filter((g) => g.status === status);
  const count = (s) => all.filter((g) => g.status === s).length;

  const summary = useMemo(() => {
    const active = all.filter((g) => g.status === 'active');
    return {
      active: active.length,
      avg: active.length ? Math.round(active.reduce((s, g) => s + g.progress, 0) / active.length) : 0,
      milestones: all.reduce((s, g) => s + g.stats.milestonesDone, 0),
      dueSoon: active.filter((g) => g.deadline && daysBetween(today, g.deadline) <= 30 && g.deadline >= today).length,
    };
  }, [all, today]);

  return (
    <div className="page page--wide">
      <PageHeader
        title="Goals"
        subtitle="Long-term outcomes, broken into milestones and tasks."
        actions={<Button variant="primary" icon={Plus} onClick={() => openEditor('goal')}>New goal</Button>}
      />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {goals.isPending ? (
          Array.from({ length: 4 }, (_, i) => <div key={i} className="card stat"><Skeleton width="50%" /><Skeleton height={24} width="30%" style={{ marginTop: 10 }} /></div>)
        ) : (
          <>
            <StatTile icon={Target} label="Active goals" value={summary.active} />
            <StatTile icon={TrendingUp} label="Average progress" value={`${summary.avg}%`} meta="Across active goals" />
            <StatTile icon={Flag} label="Milestones reached" value={summary.milestones} />
            <StatTile icon={CalendarClock} label="Due in 30 days" value={summary.dueSoon} />
          </>
        )}
      </div>

      <Tabs
        label="Goal status"
        value={status}
        onChange={(v) => setParams(v === 'active' ? {} : { status: v }, { replace: true })}
        options={[
          { value: 'active', label: 'Active', count: goals.data ? count('active') : undefined },
          { value: 'paused', label: 'Paused', count: goals.data ? count('paused') : undefined },
          { value: 'completed', label: 'Completed', count: goals.data ? count('completed') : undefined },
          { value: 'archived', label: 'Archived', count: goals.data ? count('archived') : undefined },
          { value: 'all', label: 'All' },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        {goals.isPending ? (
          <div className="goal-grid">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="card goal-card"><Skeleton width="40%" /><Skeleton height={20} width="80%" /><Skeleton height={6} /></div>
            ))}
          </div>
        ) : goals.isError && !goals.data ? (
          <Card><ErrorState error={goals.error} onRetry={() => goals.refetch()} /></Card>
        ) : !visible.length ? (
          <Card>
            <EmptyState
              icon={status === 'completed' ? CheckCircle2 : Target}
              title={status === 'active' ? 'No active goals' : `No ${status === 'all' ? '' : status} goals`}
              description={status === 'active' ? 'Define something meaningful you want to achieve, then break it into milestones.' : 'Goals will show up here as their status changes.'}
              action={status === 'active' && <Button variant="primary" icon={Plus} onClick={() => openEditor('goal')}>Create a goal</Button>}
            />
          </Card>
        ) : (
          <div className="goal-grid stagger">
            {visible.map((goal) => {
              const overdue = goal.status === 'active' && goal.deadline && goal.deadline < today;
              return (
                <Link key={goal._id} to={`/goals/${goal._id}`} className={clsx('card card--interactive goal-card', `color-${goal.color}`)}>
                  <div className="row row--between">
                    <span className="row text-xs muted" style={{ gap: 6 }}>
                      <span className="dot" aria-hidden="true" />
                      {CATEGORY_LABEL[goal.category]}
                    </span>
                    {goal.status !== 'active' && <Badge tone={goal.status === 'completed' ? 'success' : undefined}>{goal.status}</Badge>}
                  </div>
                  <h3 className="goal-card__title">{goal.title}</h3>
                  {goal.description && <p className="goal-card__description">{goal.description}</p>}
                  <div className="goal-card__progress">
                    <div className="row row--between text-xs">
                      <span className="muted">Progress</span>
                      <span className="weight-semibold tabular">{goal.progress}%</span>
                    </div>
                    <ProgressBar value={goal.progress} color={goal.color} label={`${goal.title} progress`} />
                  </div>
                  <div className="goal-card__footer">
                    <span>{goal.stats.milestonesDone}/{goal.stats.milestones} milestones</span>
                    <span>{goal.stats.tasksDone}/{goal.stats.tasks} tasks</span>
                    {goal.deadline && (
                      <span className={clsx(overdue && 'text-danger')} title={formatKey(goal.deadline)}>
                        {overdue ? `Overdue ${countdown(goal.deadline)}` : goal.status === 'active' ? `Due ${countdown(goal.deadline)}` : formatKey(goal.deadline, 'MMM d, yyyy')}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
