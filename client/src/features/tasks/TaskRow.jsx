import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { AlignLeft, ArrowRight, CalendarClock, CalendarPlus, Flag, FolderKanban, ListChecks, Pencil, Play, Repeat, Target, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStartFocus } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { Badge, Checkbox, Menu } from '../../components/ui';
import { useDeleteTask, useToggleTask, useUpdateTask } from '../../api/hooks';
import { request } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useEditor } from '../../context/EditorContext';
import { addDaysKey, formatTimeHM, relativeDay, todayKey } from '../../lib/dates';

export function DueLabel({ dueDate, dueTime, done }) {
  if (!dueDate) return null;
  const today = todayKey();
  const tone = done ? '' : dueDate < today ? 'due--overdue' : dueDate === today ? 'due--today' : '';
  return (
    <span className={clsx('due', tone)} title={dueDate}>
      <CalendarClock aria-hidden="true" />
      {relativeDay(dueDate)}
      {dueTime && ` · ${formatTimeHM(dueTime)}`}
    </span>
  );
}

export function TaskRow({ task, showGoal = true, showDue = true }) {
  const toggle = useToggleTask();
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const toast = useToast();
  const confirm = useConfirm();
  const openEditor = useEditor();
  const queryClient = useQueryClient();
  const startFocus = useStartFocus();
  const navigate = useNavigate();
  const { user } = useAuth();

  const done = task.status === 'done';
  const focusOn = () =>
    startFocus.mutate(
      { plannedMinutes: user?.preferences?.focusMinutes ?? 25, label: task.title, task: task._id, goal: task.goal?._id ?? null, project: task.project?._id ?? null },
      { onSuccess: () => navigate('/focus'), onError: (err) => toast.apiError(err, "Couldn't start focus session") },
    );
  const checked = toggle.isPending ? !done : done;
  const subDone = task.subtasks?.filter((s) => s.done).length ?? 0;
  const edit = () => openEditor('task', { item: task });

  const onToggle = () =>
    toggle.mutate(
      { id: task._id },
      {
        onSuccess: (payload) => {
          if (done) return;
          const next = payload?.meta?.next;
          toast.success('Task completed', {
            description: next ? `Next one scheduled for ${relativeDay(next.dueDate).toLowerCase()}` : task.title,
            action: {
              label: 'Undo',
              onClick: () =>
                request(`/tasks/${task._id}/toggle`, { method: 'POST', body: { date: todayKey() } })
                  .then(() => queryClient.invalidateQueries())
                  .catch((err) => toast.apiError(err, "Couldn't undo")),
            },
          });
        },
        onError: (err) => toast.apiError(err, "Couldn't update task"),
      },
    );

  const reschedule = (dueDate) =>
    update.mutate(
      { id: task._id, dueDate },
      { onSuccess: () => toast.success(`Moved to ${relativeDay(dueDate).toLowerCase()}`), onError: (err) => toast.apiError(err, "Couldn't reschedule") },
    );

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this task?', description: `"${task.title}" will be permanently removed.` }))) return;
    remove.mutate(task._id, { onSuccess: () => toast.success('Task deleted'), onError: (err) => toast.apiError(err, "Couldn't delete task") });
  };

  const today = todayKey();
  const goal = task.goal && typeof task.goal === 'object' ? task.goal : null;
  const project = task.project && typeof task.project === 'object' ? task.project : null;

  return (
    <div className={clsx('list-row list-row--interactive task-row', done && 'is-done')} onClick={edit}>
      <Checkbox checked={checked} onChange={onToggle} priority={task.priority} label={done ? `Mark "${task.title}" as not done` : `Complete "${task.title}"`} />
      <div className="task-row__main">
        <button type="button" className="task-row__title" onClick={(e) => { e.stopPropagation(); edit(); }}>
          {task.title}
        </button>
        {(task.subtasks?.length > 0 || task.notes || task.recurrence?.freq !== 'none' || (showGoal && (goal || project)) || task.tags?.length > 0) && (
          <div className="task-row__meta">
            {task.subtasks?.length > 0 && (
              <span className="task-row__meta-item"><ListChecks aria-hidden="true" />{subDone}/{task.subtasks.length}</span>
            )}
            {task.recurrence?.freq && task.recurrence.freq !== 'none' && (
              <span className="task-row__meta-item" title={`Repeats ${task.recurrence.freq}`}><Repeat aria-hidden="true" />{task.recurrence.freq}</span>
            )}
            {task.notes && <span className="task-row__meta-item" title="Has notes"><AlignLeft aria-hidden="true" /></span>}
            {showGoal && goal && <Badge color={goal.color} icon={Target}>{goal.title}</Badge>}
            {showGoal && project && <Badge color={project.color} icon={FolderKanban}>{project.title}</Badge>}
            {task.tags?.slice(0, 3).map((tag) => <span key={tag} className="task-row__tag">#{tag}</span>)}
          </div>
        )}
      </div>
      <div className="task-row__side">
        {(task.priority === 'urgent' || task.priority === 'high') && !done && (
          <span className={clsx('priority-flag', `priority-flag--${task.priority}`)} title={`${task.priority} priority`}>
            <Flag aria-label={`${task.priority} priority`} />
          </span>
        )}
        {showDue && <DueLabel dueDate={task.dueDate} dueTime={task.dueTime} done={done} />}
        <div className="list-row__actions" onClick={(e) => e.stopPropagation()}>
          <Menu
            label={`Actions for ${task.title}`}
            items={[
              { label: 'Edit', icon: Pencil, onSelect: edit },
              ...(!done
                ? [
                    { label: 'Start focus session', icon: Play, onSelect: focusOn },
                    { label: 'Move to today', icon: ArrowRight, onSelect: () => reschedule(today), disabled: task.dueDate === today },
                    { label: 'Move to tomorrow', icon: CalendarPlus, onSelect: () => reschedule(addDaysKey(today, 1)) },
                  ]
                : []),
              { separator: true },
              { label: 'Delete', icon: Trash2, danger: true, onSelect: onDelete },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
