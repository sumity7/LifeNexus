import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { FormModal } from '../../components/FormModal';
import { ColorPicker, Field, FormError, IconButton, Input, Select, Textarea } from '../../components/ui';
import { useCreateGoal, useDeleteGoal, useUpdateGoal } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFormState } from '../../hooks/useFormState';
import { GOAL_CATEGORIES, GOAL_STATUSES } from '../../lib/constants';

export function GoalFormModal(props) {
  return props.open ? <GoalForm {...props} /> : null;
}

function GoalForm({ onClose, item: goal }) {
  const isEdit = !!goal;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();
  const [milestoneDraft, setMilestoneDraft] = useState('');

  const form = useFormState(() => ({
    title: goal?.title ?? '',
    description: goal?.description ?? '',
    category: goal?.category ?? 'personal',
    status: goal?.status ?? 'active',
    color: goal?.color ?? 'indigo',
    startDate: goal?.startDate ?? '',
    deadline: goal?.deadline ?? '',
    milestones: [],
  }));
  const { values, set, errors } = form;

  const addMilestone = () => {
    if (!milestoneDraft.trim()) return;
    set('milestones', (list) => [...list, milestoneDraft.trim()]);
    setMilestoneDraft('');
  };

  const submit = async () => {
    const valid = form.validate({
      title: (v) => (!v.trim() ? 'Name your goal' : null),
      deadline: (v, all) => (v && all.startDate && v < all.startDate ? 'Deadline must be after the start date' : null),
    });
    if (!valid) return;
    const { milestones, ...rest } = values;
    const body = { ...rest, title: rest.title.trim(), startDate: rest.startDate || null, deadline: rest.deadline || null };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: goal._id, ...body });
        toast.success('Goal updated');
        onClose();
      } else {
        const titles = [...milestones, ...(milestoneDraft.trim() ? [milestoneDraft.trim()] : [])];
        const { status, ...createBody } = body;
        const created = await create.mutateAsync({ ...createBody, milestones: titles.map((title) => ({ title })) });
        toast.success('Goal created', { description: 'Break it down into milestones and tasks.' });
        onClose();
        navigate(`/goals/${created._id}`);
      }
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this goal?', description: 'Milestones are deleted. Linked tasks are kept but unlinked from the goal.' }))) return;
    try {
      await remove.mutateAsync(goal._id);
      toast.success('Goal deleted');
      onClose();
      navigate('/goals');
    } catch (err) {
      toast.apiError(err, "Couldn't delete goal");
    }
  };

  return (
    <FormModal
      title={isEdit ? 'Edit goal' : 'New goal'}
      size="lg"
      onClose={onClose}
      onSubmit={submit}
      submitLabel={isEdit ? 'Save changes' : 'Create goal'}
      submitting={create.isPending || update.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={remove.isPending}
    >
      <FormError error={form.formError} />
      <Field label="Goal" error={errors.title}>
        <Input {...form.bind('title')} placeholder="e.g. Run a half marathon" maxLength={200} data-autofocus autoComplete="off" />
      </Field>
      <Field label="Description" optional>
        <Textarea {...form.bind('description')} rows={2} maxLength={2000} placeholder="Why does this matter? What does success look like?" />
      </Field>
      <div className="form-row">
        <Field label="Category">
          <Select {...form.bind('category')} options={GOAL_CATEGORIES} />
        </Field>
        {isEdit && (
          <Field label="Status">
            <Select {...form.bind('status')} options={GOAL_STATUSES} />
          </Field>
        )}
      </div>
      <div className="form-row">
        <Field label="Start date" optional>
          <Input type="date" {...form.bind('startDate')} />
        </Field>
        <Field label="Deadline" optional error={errors.deadline}>
          <Input type="date" {...form.bind('deadline')} min={values.startDate || undefined} />
        </Field>
      </div>
      <Field label="Color">
        <ColorPicker value={values.color} onChange={(c) => set('color', c)} />
      </Field>
      {!isEdit && (
        <Field label="Milestones" optional hint="You can add more later">
          <div className="subtasks-editor">
            {values.milestones.map((title, i) => (
              <div key={`${title}-${i}`} className="subtasks-editor__row">
                <span className="milestone-index">{i + 1}</span>
                <span className="grow text-sm">{title}</span>
                <IconButton icon={X} label="Remove milestone" size="xs" onClick={() => set('milestones', (list) => list.filter((_, idx) => idx !== i))} />
              </div>
            ))}
            <input
              className="subtasks-editor__input subtasks-editor__new"
              placeholder="+ Add a milestone and press Enter"
              value={milestoneDraft}
              maxLength={200}
              aria-label="New milestone"
              onChange={(e) => setMilestoneDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  addMilestone();
                }
              }}
            />
          </div>
        </Field>
      )}
    </FormModal>
  );
}
