import { FormModal } from '../../components/FormModal';
import { ChoiceGroup, Field, FormError, Input, Select, Switch, Textarea } from '../../components/ui';
import { useCreateReminder, useDeleteReminder, useUpdateReminder } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFormState } from '../../hooks/useFormState';
import { REMINDER_CATEGORIES, REMINDER_RECURRENCE } from '../../lib/constants';
import { addDaysKey, todayKey } from '../../lib/dates';

export function ReminderFormModal(props) {
  return props.open ? <ReminderForm {...props} /> : null;
}

function ReminderForm({ onClose, item: reminder, defaults = {} }) {
  const isEdit = !!reminder;
  const toast = useToast();
  const confirm = useConfirm();
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const remove = useDeleteReminder();

  const form = useFormState(() => ({
    title: reminder?.title ?? '',
    date: reminder?.date ?? defaults.date ?? addDaysKey(todayKey(), 7),
    time: reminder?.time ?? '',
    category: reminder?.category ?? defaults.category ?? 'other',
    recurrence: reminder?.recurrence ?? 'none',
    leadDays: reminder?.leadDays ?? 3,
    important: reminder?.important ?? false,
    notes: reminder?.notes ?? '',
  }));
  const { values, set, errors } = form;

  const submit = async () => {
    const valid = form.validate({
      title: (v) => (!v.trim() ? 'Give the reminder a title' : null),
      date: (v) => (!v ? 'Pick a date' : null),
    });
    if (!valid) return;
    const body = { ...values, title: values.title.trim(), time: values.time || null, leadDays: Math.min(60, Math.max(0, Number(values.leadDays) || 0)) };
    try {
      if (isEdit) await update.mutateAsync({ id: reminder._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Reminder updated' : 'Reminder set');
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this reminder?', description: `"${reminder.title}" will be permanently removed.` }))) return;
    try {
      await remove.mutateAsync(reminder._id);
      toast.success('Reminder deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete reminder");
    }
  };

  return (
    <FormModal
      title={isEdit ? 'Edit reminder' : 'New reminder'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={isEdit ? 'Save changes' : 'Set reminder'}
      submitting={create.isPending || update.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={remove.isPending}
    >
      <FormError error={form.formError} />
      <Field label="What should we remind you about?" error={errors.title}>
        <Input {...form.bind('title')} placeholder="e.g. Car insurance renewal" maxLength={200} data-autofocus autoComplete="off" />
      </Field>
      <Field label="Type">
        <ChoiceGroup label="Reminder type" value={values.category} onChange={(v) => set('category', v)} options={REMINDER_CATEGORIES} />
      </Field>
      <div className="form-row">
        <Field label="Date" error={errors.date}>
          <Input type="date" {...form.bind('date')} />
        </Field>
        <Field label="Time" optional>
          <Input type="time" {...form.bind('time')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Repeat">
          <Select {...form.bind('recurrence')} options={REMINDER_RECURRENCE} />
        </Field>
        <Field label="Heads-up (days before)" hint="Shows on your dashboard early">
          <Input type="number" min={0} max={60} {...form.bind('leadDays')} />
        </Field>
      </div>
      <label className="row" style={{ gap: 10, cursor: 'pointer', width: 'fit-content' }}>
        <Switch checked={values.important} onChange={(v) => set('important', v)} label="Mark as important" />
        <span className="text-sm">Important</span>
      </label>
      <Field label="Notes" optional>
        <Textarea {...form.bind('notes')} rows={2} maxLength={2000} />
      </Field>
    </FormModal>
  );
}
