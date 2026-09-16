import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FolderKanban, Pencil, Play, Plus, Sparkles, Target, Timer } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, ProgressRing, SectionLabel, Skeleton, SkeletonList } from '../../components/ui';
import { ConnectionsPanel } from '../../components/ConnectionsPanel';
import { TaskRow } from '../../features/tasks/TaskRow';
import { QuickAddTask } from '../../features/tasks/QuickAddTask';
import { useProject, useStartFocus, useUpdateProject } from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { PROJECT_STATUSES } from '../../lib/constants';
import { countdown, formatKey, todayKey } from '../../lib/dates';
import { formatDuration } from '../../lib/format';
import '../goals/goals.css';

const STATUS_LABEL = Object.fromEntries(PROJECT_STATUSES.map((s) => [s.value, s.label]));

export default function ProjectDetailPage() {
  const { id } = useParams();
  const project = useProject(id);
  if (project.isPending) {
    return <div className="page"><Skeleton width={120} /><Skeleton width="50%" height={30} style={{ margin: '12px 0 24px' }} /><div className="split"><Card flush><SkeletonList rows={5} /></Card><Card><SkeletonList rows={3} /></Card></div></div>;
  }
  if (project.isError) {
    return (
      <div className="page"><Card>{project.error.status === 404 ? <EmptyState icon={FolderKanban} title="Project not found" action={<Link to="/projects" className="btn btn--secondary"><span className="btn__content">Back to projects</span></Link>} /> : <ErrorState error={project.error} onRetry={() => project.refetch()} />}</Card></div>
    );
  }
  return <ProjectDetail project={project.data} />;
}

function ProjectDetail({ project }) {
  const openEditor = useEditor();
  const update = useUpdateProject();
  const startFocus = useStartFocus();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = todayKey();
  const open = project.tasks.filter((t) => t.status !== 'done');
  const done = project.tasks.filter((t) => t.status === 'done');

  const focusNow = () =>
    startFocus.mutate(
      { plannedMinutes: user?.preferences?.focusMinutes ?? 25, label: project.title, project: project._id, goal: project.goal?._id ?? null, task: open[0]?._id ?? null },
      { onSuccess: () => navigate('/focus'), onError: (err) => toast.apiError(err, "Couldn't start focus session") },
    );

  return (
    <div className="page">
      <Link to="/projects" className="btn btn--ghost btn--sm" style={{ marginLeft: -8, marginBottom: 8 }}><span className="btn__content"><ArrowLeft aria-hidden="true" />Projects</span></Link>
      <PageHeader
        eyebrow={
          <span className="row" style={{ gap: 8 }}>
            <span className={`dot color-${project.color}`} aria-hidden="true" />
            {project.goal ? <Link to={`/goals/${project.goal._id}`} className="row" style={{ gap: 4 }}><Target size={13} aria-hidden="true" />{project.goal.title}</Link> : 'Standalone project'}
            {project.status !== 'active' && <Badge tone={project.status === 'completed' ? 'success' : undefined}>{STATUS_LABEL[project.status]}</Badge>}
          </span>
        }
        title={project.title}
        subtitle={project.description}
        actions={
          <>
            <Button icon={Play} onClick={focusNow} loading={startFocus.isPending}>Focus on this</Button>
            <Button icon={Sparkles} onClick={() => navigate(`/ai?context=project:${project._id}`)}>Ask AI</Button>
            {project.status === 'completed' ? (
              <Button onClick={() => update.mutate({ id: project._id, status: 'active' }, { onSuccess: () => toast.success('Project reopened') })}>Reopen</Button>
            ) : (
              <Button icon={CheckCircle2} onClick={() => update.mutate({ id: project._id, status: 'completed' }, { onSuccess: () => toast.success('Project completed') })} loading={update.isPending}>Mark complete</Button>
            )}
            <Button variant="primary" icon={Pencil} onClick={() => openEditor('project', { item: project })}>Edit</Button>
          </>
        }
      />
      <div className="split">
        <Card title="Tasks" icon={CheckCircle2} subtitle={`${project.stats.tasksDone} of ${project.stats.tasks} complete`} flush actions={<Button size="sm" icon={Plus} onClick={() => openEditor('task', { defaults: { project: project._id, goal: project.goal?._id ?? null } })}>Add task</Button>}>
          <QuickAddTask defaults={{ project: project._id, goal: project.goal?._id ?? null }} placeholder="Add a task to this project…" />
          {!project.tasks.length ? (
            <EmptyState compact icon={CheckCircle2} title="No tasks yet" description="Break the project into concrete next actions." />
          ) : (
            <>
              {open.length > 0 && <><SectionLabel count={open.length}>Open</SectionLabel><div className="list">{open.map((t) => <TaskRow key={t._id} task={t} />)}</div></>}
              {done.length > 0 && <><SectionLabel count={done.length}>Completed</SectionLabel><div className="list">{done.map((t) => <TaskRow key={t._id} task={t} />)}</div></>}
            </>
          )}
        </Card>
        <div className="stack" style={{ gap: 16 }}>
          <Card title="Progress" icon={FolderKanban}>
            <div className={`goal-hero color-${project.color}`}>
              <ProgressRing value={project.progress} size={96} stroke={8} color={project.color} label={`${project.progress}% complete`}>{project.progress}%</ProgressRing>
              <div className="stack stack--sm">
                <p className="text-sm"><strong>{project.stats.tasksDone}</strong> <span className="muted">of {project.stats.tasks} tasks</span></p>
                <p className="text-sm row" style={{ gap: 4 }}><Timer size={14} className="muted" aria-hidden="true" /><strong>{formatDuration(project.stats.focusMinutes)}</strong> <span className="muted">focused</span></p>
                {project.dueDate && <p className={`text-sm ${project.dueDate < today && project.status === 'active' ? 'text-danger' : 'muted'}`}>Due {countdown(project.dueDate)} · {formatKey(project.dueDate)}</p>}
              </div>
            </div>
          </Card>
          <ConnectionsPanel type="project" id={project._id} compact />
        </div>
      </div>
    </div>
  );
}
