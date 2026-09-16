import { useState } from 'react';
import { X } from 'lucide-react';
import { FormModal } from '../../components/FormModal';
import { Checkbox, Field, FormError, IconButton, Input, Select, TagInput, Textarea } from '../../components/ui';
import { useCreateTask, useDeleteTask, useGoals, useProjects, useUpdateTask } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFormState } from '../../hooks/useFormState';
import { PRIORITIES, RECURRENCE_OPTIONS, TASK_STATUSES } from '../../lib/constants';

const idOf = (ref) => (ref && typeof ref === 'object' ? ref._id : ref) ?? '';
let localKey = 0;

export function TaskFormModal(props) {
  return props.open ? <TaskForm {...props} /> : null;
}

function TaskForm({ onClose, item: task, defaults = {}, onSaved }) {
  const isEdit = !!task;
  const toast = useToast();
  const confirm = useConfirm();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const goals = useGoals();
  const projects = useProjects();
  const [subtaskDraft, setSubtaskDraft] = useState('');

  const form = useFormState(() => ({
    title: task?.title ?? defaults.title ?? '',
    notes: task?.notes ?? '',
    dueDate: task?.dueDate ?? defaults.dueDate ?? '',
    dueTime: task?.dueTime ?? '',
    priority: task?.priority ?? defaults.priority ?? 'medium',
    status: task?.status ?? 'todo',
    freq: task?.recurrence?.freq ?? 'none',
    interval: task?.recurrence?.interval ?? 1,
    tags: task?.tags ?? [],
    goal: idOf(task?.goal) || defaults.goal || '',
    milestone: idOf(task?.milestone) || defaults.milestone || '',
    project: idOf(task?.project) || defaults.project || '',
    subtasks: (task?.subtasks ?? []).map((s) => ({ ...s, key: s._id })),
  }));
  const { values, set, errors } = form;

  const goalOptions = [...(goals.data ?? [])];
  if (task?.goal && typeof task.goal === 'object' && !goalOptions.some((g) => g._id === task.goal._id)) goalOptions.push(task.goal);
  const selectedGoal = goalOptions.find((g) => g._id === values.goal);
  const milestones = selectedGoal?.milestones ?? [];

  const updateSubtask = (index, patch) => set('subtasks', (list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const removeSubtask = (index) => set('subtasks', (list) => list.filter((_, i) => i !== index));
  const addSubtask = () => {
    if (!subtaskDraft.trim()) return;
    set('subtasks', (list) => [...list, { key: `new-${++localKey}`, title: subtaskDraft.trim(), done: false }]);
    setSubtaskDraft('');
  };

  const submit = async () => {
    if (!form.validate({ title: (v) => (!v.trim() ? 'Give the task a title' : null) })) return;
    const subtasks = [...values.subtasks, ...(subtaskDraft.trim() ? [{ title: subtaskDraft, done: false }] : [])]
      .filter((s) => s.title.trim())
      .map(({ _id, title, done }) => ({ ...(_id && { _id }), title: title.trim(), done: !!done }));

    const body = {
      title: values.title.trim(),
      notes: values.notes,
      dueDate: values.dueDate || null,
      dueTime: values.dueDate && values.dueTime ? values.dueTime : null,
      priority: values.priority,
      recurrence: { freq: values.freq, interval: Math.max(1, Number(values.interval) || 1) },
      tags: values.tags,
      goal: values.goal || null,
      milestone: values.goal && values.milestone ? values.milestone : null,
      project: values.project || null,
      subtasks,
      ...(isEdit ? { status: values.status } : defaults.status && { status: defaults.status }),
    };

    try {
      const saved = isEdit ? await updateTask.mutateAsync({ id: task._id, ...body }) : await createTask.mutateAsync(body);
      toast.success(isEdit ? 'Task updated' : 'Task created');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({ title: 'Delete this task?', description: `"${task.title}" will be permanently removed.` });
    if (!ok) return;
    try {
      await deleteTask.mutateAsync(task._id);
      toast.success('Task deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete task");
    }
  };

  const unit = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }[values.freq];

  return (
    <FormModal
      title={isEdit ? 'Edit task' : 'New task'}
      size="lg"
      onClose={onClose}
      onSubmit={submit}
      submitLabel={isEdit ? 'Save changes' : 'Create task'}
      submitting={createTask.isPending || updateTask.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={deleteTask.isPending}
    >
      <FormError error={form.formError} />
      <Field label="Title" error={errors.title}>
        <Input {...form.bind('title')} placeholder="What needs to be done?" maxLength={200} data-autofocus autoComplete="off" />
      </Field>

      <div className="form-row">
        <Field label="Due date" optional error={errors.dueDate}>
          <Input type="date" {...form.bind('dueDate')} />
        </Field>
        <Field label="Time" optional error={errors.dueTime}>
          <Input type="time" {...form.bind('dueTime')} disabled={!values.dueDate} />
        </Field>
        <Field label="Priority">
          <Select {...form.bind('priority')} options={PRIORITIES} />
        </Field>
        {isEdit && (
          <Field label="Status">
            <Select {...form.bind('status')} options={TASK_STATUSES} />
          </Field>
        )}
      </div>

      <div className="form-row">
        <Field label="Repeat">
          <Select {...form.bind('freq')} options={RECURRENCE_OPTIONS} />
        </Field>
        {values.freq !== 'none' && (
          <Field label={`Every (${unit}s)`} error={errors.recurrence}>
            <Input type="number" min={1} max={365} {...form.bind('interval')} />
          </Field>
        )}
      </div>

      <Field label="Subtasks" optional>
        <div className="subtasks-editor">
          {values.subtasks.map((s, i) => (
            <div key={s.key ?? s._id} className="subtasks-editor__row">
              <Checkbox square checked={s.done} onChange={(done) => updateSubtask(i, { done })} label={`Mark "${s.title}" done`} />
              <input
                className="subtasks-editor__input"
                value={s.title}
                aria-label={`Subtask ${i + 1}`}
                maxLength={200}
                onChange={(e) => updateSubtask(i, { title: e.target.value })}
              />
              <IconButton icon={X} label="Remove subtask" size="xs" onClick={() => removeSubtask(i)} />
            </div>
          ))}
          <input
            className="subtasks-editor__input subtasks-editor__new"
            placeholder="+ Add a subtask and press Enter"
            value={subtaskDraft}
            maxLength={200}
            aria-label="New subtask"
            onChange={(e) => setSubtaskDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                addSubtask();
              }
            }}
          />
        </div>
      </Field>

      <div className="form-row">
        <Field label="Goal" optional>
          <Select
            value={values.goal}
            onChange={(e) => {
              set('goal', e.target.value);
              set('milestone', '');
            }}
            placeholder="No goal"
            options={goalOptions.map((g) => ({ value: g._id, label: g.title }))}
          />
        </Field>
        {milestones.length > 0 && (
          <Field label="Milestone" optional>
            <Select {...form.bind('milestone')} placeholder="No milestone" options={milestones.map((m) => ({ value: m._id, label: m.title }))} />
          </Field>
        )}
        <Field label="Project" optional>
          <Select {...form.bind('project')} placeholder="No project" options={(projects.data ?? []).map((p) => ({ value: p._id, label: p.title }))} />
        </Field>
      </div>

      <Field label="Tags" optional>
        <TagInput value={values.tags} onChange={(tags) => set('tags', tags)} />
      </Field>

      <Field label="Notes" optional error={errors.notes}>
        <Textarea {...form.bind('notes')} rows={3} maxLength={5000} placeholder="Add details, links or context…" />
      </Field>
    </FormModal>
  );
}
