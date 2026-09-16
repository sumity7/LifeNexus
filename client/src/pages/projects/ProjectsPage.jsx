import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCircle2, FolderKanban, Plus, Timer } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton, Tabs } from '../../components/ui';
import { useProjects } from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { PROJECT_STATUSES } from '../../lib/constants';
import { countdown, todayKey } from '../../lib/dates';
import { formatDuration } from '../../lib/format';

const STATUS_LABEL = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.value, s.label]));
const TABS = ['active', 'on_hold', 'completed', 'archived', 'all'];

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const status = TABS.includes(params.get('status')) ? params.get('status') : 'active';
  const projects = useProjects({ status: 'all' });
  const openEditor = useEditor();
  const today = todayKey();
  const all = projects.data ?? [];
  const visible = status === 'all' ? all : all.filter((p) => p.status === status);
  const count = (s) => all.filter((p) => p.status === s).length;

  return (
    <div className="page page--wide">
      <PageHeader
        title="Projects"
        subtitle="Concrete bodies of work that move your goals forward."
        actions={<Button variant="primary" icon={Plus} onClick={() => openEditor('project')}>New project</Button>}
      />
      <Tabs
        label="Project status"
        value={status}
        onChange={(v) => setParams(v === 'active' ? {} : { status: v }, { replace: true })}
        options={[
          { value: 'active', label: 'Active', count: projects.data ? count('active') : undefined },
          { value: 'on_hold', label: 'On hold', count: projects.data ? count('on_hold') : undefined },
          { value: 'completed', label: 'Completed', count: projects.data ? count('completed') : undefined },
          { value: 'archived', label: 'Archived' },
          { value: 'all', label: 'All' },
        ]}
      />
      <div style={{ marginTop: 16 }}>
        {projects.isPending ? (
          <div className="goal-grid">{Array.from({ length: 3 }, (_, i) => <div key={i} className="card project-card"><Skeleton width="40%" /><Skeleton height={20} width="80%" /><Skeleton height={6} /></div>)}</div>
        ) : projects.isError && !projects.data ? (
          <Card><ErrorState error={projects.error} onRetry={() => projects.refetch()} /></Card>
        ) : !visible.length ? (
          <Card>
            <EmptyState
              icon={status === 'completed' ? CheckCircle2 : FolderKanban}
              title={status === 'active' ? 'No active projects' : `No ${STATUS_LABEL[status]?.toLowerCase() ?? ''} projects`}
              description="Group related tasks under a project and link it to a goal to track real progress."
              action={status === 'active' && <Button variant="primary" icon={Plus} onClick={() => openEditor('project')}>Create a project</Button>}
            />
          </Card>
        ) : (
          <div className="goal-grid stagger">
            {visible.map((p) => {
              const overdue = p.status === 'active' && p.dueDate && p.dueDate < today;
              return (
                <Link key={p._id} to={`/projects/${p._id}`} className={clsx('card card--interactive project-card', `color-${p.color}`)}>
                  <div className="row row--between">
                    <span className="row text-xs muted" style={{ gap: 6, minWidth: 0 }}>
                      <span className="dot" aria-hidden="true" />
                      <span className="truncate">{p.goal?.title ?? 'Standalone'}</span>
                    </span>
                    {p.status !== 'active' && <Badge tone={p.status === 'completed' ? 'success' : undefined}>{STATUS_LABEL[p.status]}</Badge>}
                  </div>
                  <h3 className="goal-card__title">{p.title}</h3>
                  {p.description && <p className="goal-card__description">{p.description}</p>}
                  <div className="goal-card__progress">
                    <div className="row row--between text-xs"><span className="muted">{p.stats.tasksDone}/{p.stats.tasks} tasks</span><span className="weight-semibold tabular">{p.progress}%</span></div>
                    <ProgressBar value={p.progress} color={p.color} label={`${p.title} progress`} />
                  </div>
                  <div className="goal-card__footer">
                    {p.stats.focusMinutes > 0 && <span className="row" style={{ gap: 4 }}><Timer size={12} aria-hidden="true" />{formatDuration(p.stats.focusMinutes)} focused</span>}
                    {p.dueDate && <span className={clsx(overdue && 'text-danger')}>{overdue ? `Overdue ${countdown(p.dueDate)}` : `Due ${countdown(p.dueDate)}`}</span>}
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
