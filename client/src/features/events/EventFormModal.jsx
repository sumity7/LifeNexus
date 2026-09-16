import { addHours, format, startOfHour } from 'date-fns';
import { FormModal } from '../../components/FormModal';
import { ColorPicker, Field, FormError, Input, Select, Switch, Textarea } from '../../components/ui';
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFormState } from '../../hooks/useFormState';
import { RECURRENCE_OPTIONS } from '../../lib/constants';

export function EventFormModal(props) {
  return props.open ? <EventForm {...props} /> : null;
}

function EventForm({ onClose, item, defaults = {}, onSaved }) {
  const event = item?.source ?? item;
  const isEdit = !!event;
  const toast = useToast();
  const confirm = useConfirm();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();

  const start = event ? new Date(event.start) : defaults.start ?? addHours(startOfHour(new Date()), 1);
  const end = event ? new Date(event.end) : defaults.end ?? addHours(start, 1);

  const form = useFormState(() => ({
    title: event?.title ?? '',
    allDay: event?.allDay ?? defaults.allDay ?? false,
    startDate: format(start, 'yyyy-MM-dd'),
    startTime: format(start, 'HH:mm'),
    endDate: format(end, 'yyyy-MM-dd'),
    endTime: format(end, 'HH:mm'),
    location: event?.location ?? '',
    description: event?.description ?? '',
    color: event?.color ?? 'blue',
    freq: event?.recurrence?.freq ?? 'none',
    until: event?.recurrence?.until ? format(new Date(event.recurrence.until), 'yyyy-MM-dd') : '',
  }));
  const { values, set, errors } = form;

  const submit = async () => {
    if (!form.validate({ title: (v) => (!v.trim() ? 'Give the event a title' : null) })) return;
    const startAt = values.allDay ? new Date(`${values.startDate}T00:00`) : new Date(`${values.startDate}T${values.startTime}`);
    const endAt = values.allDay ? new Date(`${values.endDate}T23:59:59.999`) : new Date(`${values.endDate}T${values.endTime}`);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      form.setErrors({ startDate: 'Enter a valid date and time' });
      return;
    }
    if (endAt < startAt) {
      form.setErrors({ endDate: 'End must be after start' });
      return;
    }
    const body = {
      title: values.title.trim(),
      allDay: values.allDay,
      start: startAt.toISOString(),
      end: endAt.toISOString(),
      location: values.location,
      description: values.description,
      color: values.color,
      recurrence: {
        freq: values.freq,
        interval: 1,
        until: values.freq !== 'none' && values.until ? new Date(`${values.until}T23:59:59.999`).toISOString() : null,
      },
    };
    try {
      const saved = isEdit ? await updateEvent.mutateAsync({ id: event._id, ...body }) : await createEvent.mutateAsync(body);
      toast.success(isEdit ? 'Event updated' : 'Event added to calendar');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    const recurring = event.recurrence?.freq && event.recurrence.freq !== 'none';
    const ok = await confirm({
      title: recurring ? 'Delete this recurring event?' : 'Delete this event?',
      description: recurring ? 'All occurrences in the series will be removed.' : `"${event.title}" will be removed from your calendar.`,
    });
    if (!ok) return;
    try {
      await deleteEvent.mutateAsync(event._id);
      toast.success('Event deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete event");
    }
  };

  return (
    <FormModal
      title={isEdit ? 'Edit event' : 'New event'}
      description={isEdit && event.recurrence?.freq !== 'none' ? 'Changes apply to every occurrence in this series.' : undefined}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={isEdit ? 'Save changes' : 'Add event'}
      submitting={createEvent.isPending || updateEvent.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={deleteEvent.isPending}
    >
      <FormError error={form.formError} />
      <Field label="Title" error={errors.title}>
        <Input {...form.bind('title')} placeholder="Event name" maxLength={200} data-autofocus autoComplete="off" />
      </Field>

      <label className="row" style={{ gap: 10, cursor: 'pointer', width: 'fit-content' }}>
        <Switch checked={values.allDay} onChange={(v) => set('allDay', v)} label="All-day event" />
        <span className="text-sm">All day</span>
      </label>

      <div className="form-row">
        <Field label="Starts" error={errors.startDate}>
          <Input
            type="date"
            value={values.startDate}
            onChange={(e) => {
              const next = e.target.value;
              set('startDate', next);
              if (values.endDate < next) set('endDate', next);
            }}
          />
        </Field>
        {!values.allDay && (
          <Field label="Time">
            <Input type="time" {...form.bind('startTime')} />
          </Field>
        )}
      </div>
      <div className="form-row">
        <Field label="Ends" error={errors.endDate}>
          <Input type="date" {...form.bind('endDate')} min={values.startDate} />
        </Field>
        {!values.allDay && (
          <Field label="Time">
            <Input type="time" {...form.bind('endTime')} />
          </Field>
        )}
      </div>

      <div className="form-row">
        <Field label="Repeat">
          <Select {...form.bind('freq')} options={RECURRENCE_OPTIONS} />
        </Field>
        {values.freq !== 'none' && (
          <Field label="Until" optional>
            <Input type="date" {...form.bind('until')} min={values.startDate} />
          </Field>
        )}
      </div>

      <Field label="Location" optional>
        <Input {...form.bind('location')} placeholder="Add a place or link" maxLength={200} />
      </Field>
      <Field label="Color">
        <ColorPicker value={values.color} onChange={(c) => set('color', c)} />
      </Field>
      <Field label="Description" optional>
        <Textarea {...form.bind('description')} rows={3} maxLength={2000} />
      </Field>
    </FormModal>
  );
}
