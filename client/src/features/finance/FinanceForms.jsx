import { useState } from 'react';
import { FormModal } from '../../components/FormModal';
import { Field, FormError, Input, Segmented, Select } from '../../components/ui';
import {
  useCreateBudget, useCreateTransaction, useDeleteBudget, useDeleteTransaction, useUpdateBudget, useUpdateTransaction,
} from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { useFormState } from '../../hooks/useFormState';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../lib/constants';
import { formatCurrency } from '../../lib/format';
import { todayKey } from '../../lib/dates';

const CUSTOM = '__custom__';

function CategoryField({ type, value, onChange, error }) {
  const options = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const [custom, setCustom] = useState(() => !!value && !options.includes(value));
  return (
    <div className="form-row">
      <Field label="Category" error={!custom ? error : undefined}>
        <Select
          value={custom ? CUSTOM : value}
          onChange={(e) => {
            if (e.target.value === CUSTOM) {
              setCustom(true);
              onChange('');
            } else {
              setCustom(false);
              onChange(e.target.value);
            }
          }}
          placeholder="Choose a category"
          options={[...options, { value: CUSTOM, label: 'Custom…' }]}
        />
      </Field>
      {custom && (
        <Field label="Custom category" error={error}>
          <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={40} placeholder="e.g. Pets" autoFocus />
        </Field>
      )}
    </div>
  );
}

export function TransactionFormModal(props) {
  return props.open ? <TransactionForm {...props} /> : null;
}

function TransactionForm({ onClose, item: tx, defaults = {} }) {
  const isEdit = !!tx;
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const currency = user?.preferences?.currency ?? 'USD';
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  const form = useFormState(() => ({
    type: tx?.type ?? defaults.type ?? 'expense',
    amount: tx?.amount?.toString() ?? '',
    category: tx?.category ?? defaults.category ?? '',
    description: tx?.description ?? '',
    date: tx?.date ?? defaults.date ?? todayKey(),
  }));
  const { values, set, errors } = form;

  const submit = async () => {
    const valid = form.validate({
      amount: (v) => (!(Number(v) > 0) ? 'Enter an amount greater than 0' : null),
      category: (v) => (!v.trim() ? 'Choose a category' : null),
      date: (v) => (!v ? 'Pick a date' : null),
    });
    if (!valid) return;
    const body = { ...values, amount: Math.round(Number(values.amount) * 100) / 100, category: values.category.trim() };
    try {
      if (isEdit) await update.mutateAsync({ id: tx._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Transaction updated' : `${values.type === 'income' ? 'Income' : 'Expense'} of ${formatCurrency(body.amount, currency)} recorded`);
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this transaction?', description: `${tx.description || tx.category} · ${formatCurrency(tx.amount, currency)}` }))) return;
    try {
      await remove.mutateAsync(tx._id);
      toast.success('Transaction deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete transaction");
    }
  };

  return (
    <FormModal
      title={isEdit ? 'Edit transaction' : 'Add transaction'}
      size="sm"
      onClose={onClose}
      onSubmit={submit}
      submitLabel={isEdit ? 'Save changes' : 'Add'}
      submitting={create.isPending || update.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={remove.isPending}
    >
      <FormError error={form.formError} />
      <Segmented
        label="Transaction type"
        value={values.type}
        onChange={(type) => {
          set('type', type);
          set('category', '');
        }}
        options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]}
      />
      <div className="form-row">
        <Field label={`Amount (${currency})`} error={errors.amount}>
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" {...form.bind('amount')} placeholder="0.00" data-autofocus />
        </Field>
        <Field label="Date" error={errors.date}>
          <Input type="date" {...form.bind('date')} />
        </Field>
      </div>
      <CategoryField key={values.type} type={values.type} value={values.category} onChange={(v) => set('category', v)} error={errors.category} />
      <Field label="Description" optional>
        <Input {...form.bind('description')} maxLength={200} placeholder={values.type === 'income' ? 'e.g. Freelance project' : 'e.g. Weekly groceries'} />
      </Field>
    </FormModal>
  );
}

export function BudgetFormModal(props) {
  return props.open ? <BudgetForm {...props} /> : null;
}

function BudgetForm({ onClose, item: budget }) {
  const isEdit = !!budget;
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const currency = user?.preferences?.currency ?? 'USD';
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();
  const form = useFormState(() => ({ category: budget?.category ?? '', limit: budget?.limit?.toString() ?? '' }));

  const submit = async () => {
    const valid = form.validate({
      category: (v) => (!v.trim() ? 'Choose a category' : null),
      limit: (v) => (!(Number(v) > 0) ? 'Enter a monthly limit greater than 0' : null),
    });
    if (!valid) return;
    const body = { category: form.values.category.trim(), limit: Number(form.values.limit) };
    try {
      if (isEdit) await update.mutateAsync({ id: budget._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Budget updated' : 'Budget created');
      onClose();
    } catch (err) {
      if (err.status === 409) form.setErrors({ category: 'A budget for this category already exists' });
      else form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: `Delete the ${budget.category} budget?`, description: 'Your transactions are not affected.' }))) return;
    try {
      await remove.mutateAsync(budget._id);
      toast.success('Budget deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete budget");
    }
  };

  return (
    <FormModal
      title={isEdit ? 'Edit budget' : 'New monthly budget'}
      size="sm"
      onClose={onClose}
      onSubmit={submit}
      submitting={create.isPending || update.isPending}
      onDelete={isEdit ? onDelete : undefined}
      deleting={remove.isPending}
    >
      <FormError error={form.formError} />
      <CategoryField type="expense" value={form.values.category} onChange={(v) => form.set('category', v)} error={form.errors.category} />
      <Field label={`Monthly limit (${currency})`} error={form.errors.limit}>
        <Input type="number" inputMode="decimal" min="1" step="1" {...form.bind('limit')} placeholder="500" />
      </Field>
    </FormModal>
  );
}
