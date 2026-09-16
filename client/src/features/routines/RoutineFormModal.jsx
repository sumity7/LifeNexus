import { useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { FormModal } from '../../components/FormModal';
import { Field, FormError, IconButton, Input, Segmented, Switch, Textarea, WeekdayPicker } from '../../components/ui';
import { useCreateRoutine, useDeleteRoutine, useHabits, useUpdateRoutine } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { useFormState } from '../../hooks/useFormState';
import { ROUTINE_TYPES } from '../../lib/constants';
import { formatDuration } from '../../lib/format';

let localKey = 0;

export function RoutineFormModal(props) {
  return props.open ? <RoutineForm {...props} /> : null;
}

function RoutineForm({ onClose, item: routine, defaults = {} }) {
  const isEdit = !!routine;
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const create = useCreateRoutine();
  const update = useUpdateRoutine();
  const remove = useDeleteRoutine();
  const habits = useHabits();
  const [draft, setDraft] = useState('');

  const form = useFormState(() => ({
    name: routine?.name ?? '',
    type: routine?.type ?? defaults.type ?? 'morning',
    timeOfDay: routine?.timeOfDay ?? '',
    days: routine?.days ?? [],
    description: routine?.description ?? '',
    active: routine?.active ?? true,
    steps: (routine?.steps ?? []).map((s) => ({ ...s, key: s._id })),
  }));
  const { values, set, errors } = form;

  const updateStep = (i, patch) => set('steps', (list) => list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const moveStep = (i, delta) =>
    set('steps', (list) => {
      const next = [...list];
      const [step] = next.splice(i, 1);
      next.splice(i + delta, 0, step);
      return next;
    });
  const addStep = () => {
    if (!draft.trim()) return;
    set('steps', (list) => [...list, { key: `new-${++localKey}`, title: draft.trim(), durationMin: 5 }]);
    setDraft('');
  };

  const totalMinutes = values.steps.reduce((sum, s) => sum + (Number(s.durationMin) || 0), 0);

  const submit = async () => {
    const steps = [...values.steps, ...(draft.trim() ? [{ title: draft.trim(), durationMin: 5 }] : [])];
    const valid = form.validate({
      name: (v) => (!v.trim() ? 'Name your routine' : null),
      steps: () => (steps.some((s) => !s.title.trim()) ? 'Every step needs a title' : null),
    });
    if (!valid) return;
    const body = {
      name: values.name.trim(),
      type: values.type,
      timeOfDay: values.timeOfDay || null,
      days: values.days,
      description: values.description,
      active: values.active,
      steps: steps.map(({ _id, title, durationMin, habit }) => ({ ...(_id && { _id }), title: title.trim(), durationMin: Math.max(0, Math.round(Number(durationMin) || 0)), habit: habit || null })),
    };
    try {
      if (isEdit) await update.mutateAsync({ id: routine._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Routine updated' : 'Routine created');
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this routine?', description: `"${routine.name}" and its completion history will be removed.` }))) return;
    try {
      await remove.mutateAsync(routine._id);
      toast.success('Routine deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete routine");
    }
  };

  return (
    <FormModal
      title={isEdit ? 'Edit routine' : 'New routine'}
      size="lg"
      onClose={onClose}
      onSubmit={submit}
      submitLabel={isEdit ? 'Save changes' : 'Create routine'}
      submitting={create.isPending || update.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={remove.isPending}
    >
      <FormError error={form.formError} />
      <Field label="Name" error={errors.name}>
        <Input {...form.bind('name')} placeholder="e.g. Morning kickstart" maxLength={80} data-autofocus autoComplete="off" />
      </Field>
      <div className="form-row">
        <Field label="Type">
          <Segmented label="Routine type" value={values.type} onChange={(v) => set('type', v)} options={ROUTINE_TYPES} />
        </Field>
        <Field label="Start time" optional>
          <Input type="time" {...form.bind('timeOfDay')} />
        </Field>
      </div>
      <Field label="Days" hint={values.days.length ? undefined : 'No days selected means every day'}>
        <WeekdayPicker value={values.days} onChange={(d) => set('days', d)} weekStartsOn={user?.preferences?.weekStartsOn ?? 1} />
      </Field>

      <Field label={`Steps${values.steps.length ? ` · ${formatDuration(totalMinutes)} total` : ''}`} error={errors.steps} hint="Link a step to a habit and checking it off also records the habit for the day.">
        <div className="subtasks-editor">
          {values.steps.map((step, i) => (
            <div key={step.key ?? step._id} className="subtasks-editor__row">
              <span className="milestone-index">{i + 1}</span>
              <input
                className="subtasks-editor__input"
                value={step.title}
                maxLength={120}
                aria-label={`Step ${i + 1} title`}
                onChange={(e) => updateStep(i, { title: e.target.value })}
              />
              <input
                className="subtasks-editor__input step-duration"
                type="number"
                min={0}
                max={600}
                value={step.durationMin}
                aria-label={`Step ${i + 1} duration in minutes`}
                onChange={(e) => updateStep(i, { durationMin: e.target.value })}
              />
              <span className="text-xs muted">min</span>
              <select
                className="input input--sm"
                style={{ width: 120, flexShrink: 0 }}
                value={step.habit ?? ''}
                aria-label={`Habit linked to step ${i + 1}`}
                title="Checking this step also checks in the linked habit"
                onChange={(e) => updateStep(i, { habit: e.target.value || null })}
              >
                <option value="">No habit</option>
                {(habits.data ?? []).map((h) => <option key={h._id} value={h._id}>{h.icon} {h.name}</option>)}
              </select>
              <IconButton icon={ArrowUp} label="Move step up" size="xs" disabled={i === 0} onClick={() => moveStep(i, -1)} />
              <IconButton icon={ArrowDown} label="Move step down" size="xs" disabled={i === values.steps.length - 1} onClick={() => moveStep(i, 1)} />
              <IconButton icon={X} label="Remove step" size="xs" onClick={() => set('steps', (list) => list.filter((_, idx) => idx !== i))} />
            </div>
          ))}
          <input
            className="subtasks-editor__input subtasks-editor__new"
            placeholder="+ Add a step and press Enter"
            value={draft}
            maxLength={120}
            aria-label="New step"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                addStep();
              }
            }}
          />
        </div>
      </Field>

      <Field label="Description" optional>
        <Textarea {...form.bind('description')} rows={2} maxLength={500} />
      </Field>
      {isEdit && (
        <label className="row" style={{ gap: 10, cursor: 'pointer', width: 'fit-content' }}>
          <Switch checked={values.active} onChange={(v) => set('active', v)} label="Routine active" />
          <span className="text-sm">Active</span>
        </label>
      )}
    </FormModal>
  );
}
