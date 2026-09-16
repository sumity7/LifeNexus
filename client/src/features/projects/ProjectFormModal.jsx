import { useNavigate } from 'react-router-dom';
import { FormModal } from '../../components/FormModal';
import { ColorPicker, Field, FormError, Input, Select, Textarea } from '../../components/ui';
import { useCreateProject, useDeleteProject, useGoals, useUpdateProject } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useFormState } from '../../hooks/useFormState';
import { PROJECT_STATUSES } from '../../lib/constants';

export function ProjectFormModal(props) {
  return props.open ? <ProjectForm {...props} /> : null;
}

function ProjectForm({ onClose, item: project, defaults = {}, onSaved }) {
  const isEdit = !!project;
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const create = useCreateProject();
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const goals = useGoals();

  const form = useFormState(() => ({
    title: project?.title ?? '',
    description: project?.description ?? '',
    goal: (project?.goal && typeof project.goal === 'object' ? project.goal._id : project?.goal) ?? defaults.goal ?? '',
    status: project?.status ?? 'active',
    color: project?.color ?? 'indigo',
    startDate: project?.startDate ?? '',
    dueDate: project?.dueDate ?? '',
  }));
  const { values, set, errors } = form;

  const submit = async () => {
    const valid = form.validate({
      title: (v) => (!v.trim() ? 'Name your project' : null),
      dueDate: (v, all) => (v && all.startDate && v < all.startDate ? 'Due date must be after the start date' : null),
    });
    if (!valid) return;
    const body = { ...values, title: values.title.trim(), goal: values.goal || null, startDate: values.startDate || null, dueDate: values.dueDate || null };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: project._id, ...body });
        toast.success('Project updated');
        onClose();
      } else {
        const { status, ...createBody } = body;
        const created = await create.mutateAsync(createBody);
        toast.success('Project created');
        onSaved?.(created);
        onClose();
        if (!onSaved) navigate(`/projects/${created._id}`);
      }
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this project?', description: 'Tasks stay in your list but are unlinked from the project.' }))) return;
    try {
      await remove.mutateAsync(project._id);
      toast.success('Project deleted');
      onClose();
      navigate('/projects');
    } catch (err) {
      toast.apiError(err, "Couldn't delete project");
    }
  };

  return (
    <FormModal
      title={isEdit ? 'Edit project' : 'New project'}
      onClose={onClose}
      onSubmit={submit}
      submitLabel={isEdit ? 'Save changes' : 'Create project'}
      submitting={create.isPending || update.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={remove.isPending}
    >
      <FormError error={form.formError} />
      <Field label="Project" error={errors.title}>
        <Input {...form.bind('title')} placeholder="e.g. Portfolio website build" maxLength={200} data-autofocus autoComplete="off" />
      </Field>
      <Field label="Description" optional>
        <Textarea {...form.bind('description')} rows={2} maxLength={2000} placeholder="What does done look like?" />
      </Field>
      <div className="form-row">
        <Field label="Goal" optional hint="Projects roll up into a goal's progress context">
          <Select {...form.bind('goal')} placeholder="No goal" options={(goals.data ?? []).map((g) => ({ value: g._id, label: g.title }))} />
        </Field>
        {isEdit && (
          <Field label="Status">
            <Select {...form.bind('status')} options={PROJECT_STATUSES} />
          </Field>
        )}
      </div>
      <div className="form-row">
        <Field label="Start date" optional>
          <Input type="date" {...form.bind('startDate')} />
        </Field>
        <Field label="Due date" optional error={errors.dueDate}>
          <Input type="date" {...form.bind('dueDate')} min={values.startDate || undefined} />
        </Field>
      </div>
      <Field label="Color">
        <ColorPicker value={values.color} onChange={(c) => set('color', c)} />
      </Field>
    </FormModal>
  );
}
