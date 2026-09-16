import { FormModal } from '../../components/FormModal';
import { ChoiceGroup, Field, FormError, Input, Segmented, Textarea } from '../../components/ui';
import { useCreateWorkout, useDeleteWorkout, useUpdateWorkout } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFormState } from '../../hooks/useFormState';
import { INTENSITIES, WORKOUT_TYPES } from '../../lib/constants';
import { todayKey } from '../../lib/dates';

const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

export function WorkoutFormModal(props) {
  return props.open ? <WorkoutForm {...props} /> : null;
}

function WorkoutForm({ onClose, item: workout, defaults = {} }) {
  const isEdit = !!workout;
  const toast = useToast();
  const confirm = useConfirm();
  const create = useCreateWorkout();
  const update = useUpdateWorkout();
  const remove = useDeleteWorkout();

  const form = useFormState(() => ({
    type: workout?.type ?? 'run',
    title: workout?.title ?? '',
    date: workout?.date ?? defaults.date ?? todayKey(),
    durationMin: workout?.durationMin?.toString() ?? '30',
    intensity: workout?.intensity ?? 'moderate',
    distanceKm: workout?.distanceKm?.toString() ?? '',
    calories: workout?.calories?.toString() ?? '',
    notes: workout?.notes ?? '',
  }));
  const { values, set, errors } = form;

  const submit = async () => {
    const valid = form.validate({
      durationMin: (v) => (!(Number(v) >= 1) ? 'Duration must be at least 1 minute' : null),
      date: (v) => (!v ? 'Pick a date' : null),
    });
    if (!valid) return;
    const body = {
      ...values,
      durationMin: Math.round(Number(values.durationMin)),
      distanceKm: numOrNull(values.distanceKm),
      calories: values.calories === '' ? null : Math.round(Number(values.calories)),
    };
    try {
      if (isEdit) await update.mutateAsync({ id: workout._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Workout updated' : 'Workout logged');
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this workout?' }))) return;
    try {
      await remove.mutateAsync(workout._id);
      toast.success('Workout deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete workout");
    }
  };

  const showDistance = ['run', 'walk', 'cycling', 'swim'].includes(values.type);

  return (
    <FormModal
      title={isEdit ? 'Edit workout' : 'Log workout'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={isEdit ? 'Save changes' : 'Log workout'}
      submitting={create.isPending || update.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={remove.isPending}
    >
      <FormError error={form.formError} />
      <Field label="Activity">
        <ChoiceGroup label="Activity type" value={values.type} onChange={(v) => set('type', v)} options={WORKOUT_TYPES} />
      </Field>
      <div className="form-row">
        <Field label="Date" error={errors.date}>
          <Input type="date" {...form.bind('date')} max={todayKey()} />
        </Field>
        <Field label="Duration (min)" error={errors.durationMin}>
          <Input type="number" min={1} max={1440} {...form.bind('durationMin')} data-autofocus />
        </Field>
      </div>
      <Field label="Intensity">
        <Segmented label="Intensity" value={values.intensity} onChange={(v) => set('intensity', v)} options={INTENSITIES} />
      </Field>
      <div className="form-row">
        {showDistance && (
          <Field label="Distance (km)" optional error={errors.distanceKm}>
            <Input type="number" min={0} step="0.1" {...form.bind('distanceKm')} />
          </Field>
        )}
        <Field label="Calories" optional error={errors.calories}>
          <Input type="number" min={0} {...form.bind('calories')} />
        </Field>
      </div>
      <Field label="Title" optional>
        <Input {...form.bind('title')} maxLength={100} placeholder="e.g. Morning tempo run" />
      </Field>
      <Field label="Notes" optional>
        <Textarea {...form.bind('notes')} rows={2} maxLength={1000} />
      </Field>
    </FormModal>
  );
}
