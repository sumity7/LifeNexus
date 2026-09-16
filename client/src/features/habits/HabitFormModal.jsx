import { FormModal } from '../../components/FormModal';
import { ChoiceGroup, ColorPicker, Field, FormError, Input, Segmented, Textarea, WeekdayPicker } from '../../components/ui';
import { useCreateHabit, useDeleteHabit, useUpdateHabit } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { useFormState } from '../../hooks/useFormState';
import { HABIT_ICONS } from '../../lib/constants';

export function HabitFormModal(props) {
  return props.open ? <HabitForm {...props} /> : null;
}

function HabitForm({ onClose, item: habit }) {
  const isEdit = !!habit;
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const remove = useDeleteHabit();

  const form = useFormState(() => ({
    name: habit?.name ?? '',
    icon: habit?.icon ?? '✨',
    color: habit?.color ?? 'indigo',
    frequency: habit?.frequency ?? 'daily',
    days: habit?.days ?? [],
    timesPerWeek: habit?.timesPerWeek ?? 3,
    description: habit?.description ?? '',
  }));
  const { values, set, errors } = form;

  const submit = async () => {
    if (!form.validate({ name: (v) => (!v.trim() ? 'Name your habit' : null) })) return;
    const body = { ...values, name: values.name.trim() };
    try {
      if (isEdit) await update.mutateAsync({ id: habit._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Habit updated' : 'Habit created', { description: isEdit ? undefined : 'Check it off each day to build a streak.' });
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'Delete this habit?',
      description: `"${habit.name}" and its entire check-in history will be permanently deleted. Archive it instead to keep the history.`,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(habit._id);
      toast.success('Habit deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete habit");
    }
  };

  return (
    <FormModal
      title={isEdit ? 'Edit habit' : 'New habit'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={isEdit ? 'Save changes' : 'Create habit'}
      submitting={create.isPending || update.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={remove.isPending}
    >
      <FormError error={form.formError} />
      <Field label="Name" error={errors.name}>
        <Input {...form.bind('name')} placeholder="e.g. Read for 20 minutes" maxLength={100} data-autofocus autoComplete="off" />
      </Field>
      <Field label="Icon">
        <ChoiceGroup label="Habit icon" value={values.icon} onChange={(v) => set('icon', v)} options={HABIT_ICONS.map((emoji) => ({ value: emoji, emoji, title: emoji }))} />
      </Field>
      <Field label="Color">
        <ColorPicker value={values.color} onChange={(c) => set('color', c)} />
      </Field>
      <Field label="Frequency">
        <Segmented
          label="Frequency"
          value={values.frequency}
          onChange={(v) => set('frequency', v)}
          options={[{ value: 'daily', label: 'Specific days' }, { value: 'weekly', label: 'Times per week' }]}
        />
      </Field>
      {values.frequency === 'daily' ? (
        <Field label="On these days" hint={values.days.length ? undefined : 'No days selected means every day'}>
          <WeekdayPicker value={values.days} onChange={(d) => set('days', d)} weekStartsOn={user?.preferences?.weekStartsOn ?? 1} />
        </Field>
      ) : (
        <Field label="Target per week">
          <ChoiceGroup
            label="Times per week"
            value={values.timesPerWeek}
            onChange={(v) => set('timesPerWeek', v)}
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: `${n}×` }))}
          />
        </Field>
      )}
      <Field label="Why it matters" optional>
        <Textarea {...form.bind('description')} rows={2} maxLength={500} placeholder="A short note to keep you motivated" />
      </Field>
    </FormModal>
  );
}
