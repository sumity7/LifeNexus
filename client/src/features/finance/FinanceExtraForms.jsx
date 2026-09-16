import { FormModal } from '../../components/FormModal';
import { ColorPicker, Field, FormError, Input, Segmented, Select, Switch, Textarea } from '../../components/ui';
import {
  useAccounts, useCreateAccount, useCreateRecurring, useCreateSavingsGoal, useCreateSubscription, useDeleteAccount, useDeleteRecurring,
  useDeleteSavingsGoal, useDeleteSubscription, useGoals, useUpdateAccount, useUpdateRecurring, useUpdateSavingsGoal, useUpdateSubscription,
} from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { useFormState } from '../../hooks/useFormState';
import { ACCOUNT_TYPES, BILLING_FREQUENCIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../../lib/constants';
import { todayKey } from '../../lib/dates';

const useCurrency = () => useAuth().user?.preferences?.currency ?? 'USD';
const num = (v) => Number(v) || 0;

/* ───────── Accounts ───────── */

export function AccountFormModal(props) {
  return props.open ? <AccountForm {...props} /> : null;
}

function AccountForm({ onClose, item: account }) {
  const isEdit = !!account;
  const toast = useToast();
  const confirm = useConfirm();
  const currency = useCurrency();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const form = useFormState(() => ({ name: account?.name ?? '', type: account?.type ?? 'bank', balance: account?.balance?.toString() ?? '0', color: account?.color ?? 'blue', archived: account?.archived ?? false }));

  const submit = async () => {
    if (!form.validate({ name: (v) => (!v.trim() ? 'Name the account' : null), balance: (v) => (Number(v) < 0 || Number.isNaN(Number(v)) ? 'Enter a valid balance' : null) })) return;
    const body = { ...form.values, name: form.values.name.trim(), balance: num(form.values.balance) };
    try {
      if (isEdit) await update.mutateAsync({ id: account._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Account updated' : 'Account added');
      onClose();
    } catch (err) {
      if (err.status === 409) form.setErrors({ name: 'An account with this name already exists' });
      else form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: `Delete ${account.name}?`, description: 'Transactions are kept and unlinked from this account.' }))) return;
    try {
      await remove.mutateAsync(account._id);
      toast.success('Account deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete account");
    }
  };

  return (
    <FormModal title={isEdit ? 'Edit account' : 'Add account'} size="sm" onClose={onClose} onSubmit={submit} submitting={create.isPending || update.isPending} onDelete={isEdit ? onDelete : undefined} deleting={remove.isPending}>
      <FormError error={form.formError} />
      <Field label="Name" error={form.errors.name}>
        <Input {...form.bind('name')} maxLength={60} placeholder="e.g. Main checking" data-autofocus />
      </Field>
      <div className="form-row">
        <Field label="Type">
          <Select {...form.bind('type')} options={ACCOUNT_TYPES} />
        </Field>
        <Field label={`${ACCOUNT_TYPES.find((t) => t.value === form.values.type)?.liability ? 'Amount owed' : 'Balance'} (${currency})`} error={form.errors.balance}>
          <Input type="number" inputMode="decimal" min={0} step="0.01" {...form.bind('balance')} />
        </Field>
      </div>
      <Field label="Color">
        <ColorPicker value={form.values.color} onChange={(c) => form.set('color', c)} />
      </Field>
      {isEdit && (
        <label className="row" style={{ gap: 10, cursor: 'pointer', width: 'fit-content' }}>
          <Switch checked={form.values.archived} onChange={(v) => form.set('archived', v)} label="Archived" />
          <span className="text-sm">Archived (excluded from net worth)</span>
        </label>
      )}
    </FormModal>
  );
}

/* ───────── Recurring transactions ───────── */

export function RecurringFormModal(props) {
  return props.open ? <RecurringForm {...props} /> : null;
}

function RecurringForm({ onClose, item: rule }) {
  const isEdit = !!rule;
  const toast = useToast();
  const confirm = useConfirm();
  const currency = useCurrency();
  const accounts = useAccounts();
  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();
  const form = useFormState(() => ({
    type: rule?.type ?? 'expense', amount: rule?.amount?.toString() ?? '', category: rule?.category ?? '', description: rule?.description ?? '',
    frequency: rule?.frequency ?? 'monthly', nextDate: rule?.nextDate ?? todayKey(), account: (rule?.account?._id ?? rule?.account) ?? '', active: rule?.active ?? true, autoPost: rule?.autoPost ?? true,
  }));
  const { values, set, errors } = form;
  const categories = values.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const submit = async () => {
    if (!form.validate({ amount: (v) => (!(Number(v) > 0) ? 'Enter an amount' : null), category: (v) => (!v.trim() ? 'Choose a category' : null), nextDate: (v) => (!v ? 'Pick the next date' : null) })) return;
    const body = { ...values, amount: num(values.amount), account: values.account || null };
    try {
      if (isEdit) await update.mutateAsync({ id: rule._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Recurring rule updated' : 'Recurring transaction added');
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this recurring rule?', description: 'Already-posted transactions are kept.' }))) return;
    try {
      await remove.mutateAsync(rule._id);
      toast.success('Rule deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete rule");
    }
  };

  return (
    <FormModal title={isEdit ? 'Edit recurring transaction' : 'New recurring transaction'} size="sm" onClose={onClose} onSubmit={submit} submitting={create.isPending || update.isPending} onDelete={isEdit ? onDelete : undefined} deleting={remove.isPending}>
      <FormError error={form.formError} />
      <Segmented label="Type" value={values.type} onChange={(v) => { set('type', v); set('category', ''); }} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
      <div className="form-row">
        <Field label={`Amount (${currency})`} error={errors.amount}>
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" {...form.bind('amount')} data-autofocus />
        </Field>
        <Field label="Category" error={errors.category}>
          <Select {...form.bind('category')} placeholder="Choose" options={[...categories, ...(values.category && !categories.includes(values.category) ? [values.category] : [])]} />
        </Field>
      </div>
      <Field label="Description" optional>
        <Input {...form.bind('description')} maxLength={200} placeholder="e.g. Rent" />
      </Field>
      <div className="form-row">
        <Field label="Repeats">
          <Select {...form.bind('frequency')} options={BILLING_FREQUENCIES} />
        </Field>
        <Field label="Next date" error={errors.nextDate}>
          <Input type="date" {...form.bind('nextDate')} />
        </Field>
      </div>
      <Field label="Account" optional>
        <Select {...form.bind('account')} placeholder="No account" options={(accounts.data?.data ?? []).filter((a) => !a.archived).map((a) => ({ value: a._id, label: a.name }))} />
      </Field>
      <div className="row" style={{ gap: 20 }}>
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}><Switch checked={values.autoPost} onChange={(v) => set('autoPost', v)} label="Post automatically" /><span className="text-sm">Post automatically</span></label>
        {isEdit && <label className="row" style={{ gap: 8, cursor: 'pointer' }}><Switch checked={values.active} onChange={(v) => set('active', v)} label="Active" /><span className="text-sm">Active</span></label>}
      </div>
    </FormModal>
  );
}

/* ───────── Subscriptions ───────── */

export function SubscriptionFormModal(props) {
  return props.open ? <SubscriptionForm {...props} /> : null;
}

function SubscriptionForm({ onClose, item: sub }) {
  const isEdit = !!sub;
  const toast = useToast();
  const confirm = useConfirm();
  const currency = useCurrency();
  const create = useCreateSubscription();
  const update = useUpdateSubscription();
  const remove = useDeleteSubscription();
  const form = useFormState(() => ({ name: sub?.name ?? '', amount: sub?.amount?.toString() ?? '', frequency: sub?.frequency ?? 'monthly', nextPayment: sub?.nextPayment ?? todayKey(), category: sub?.category ?? 'Subscriptions', notes: sub?.notes ?? '', active: sub?.active ?? true }));

  const submit = async () => {
    if (!form.validate({ name: (v) => (!v.trim() ? 'Name the subscription' : null), amount: (v) => (!(Number(v) > 0) ? 'Enter an amount' : null), nextPayment: (v) => (!v ? 'Pick the next payment date' : null) })) return;
    const body = { ...form.values, name: form.values.name.trim(), amount: num(form.values.amount) };
    try {
      if (isEdit) await update.mutateAsync({ id: sub._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Subscription updated' : 'Subscription added');
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: `Delete ${sub.name}?` }))) return;
    try {
      await remove.mutateAsync(sub._id);
      toast.success('Subscription deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete subscription");
    }
  };

  return (
    <FormModal title={isEdit ? 'Edit subscription' : 'Add subscription'} size="sm" onClose={onClose} onSubmit={submit} submitting={create.isPending || update.isPending} onDelete={isEdit ? onDelete : undefined} deleting={remove.isPending}>
      <FormError error={form.formError} />
      <Field label="Name" error={form.errors.name}>
        <Input {...form.bind('name')} maxLength={80} placeholder="e.g. Netflix" data-autofocus />
      </Field>
      <div className="form-row">
        <Field label={`Amount (${currency})`} error={form.errors.amount}>
          <Input type="number" inputMode="decimal" min="0.01" step="0.01" {...form.bind('amount')} />
        </Field>
        <Field label="Billing">
          <Select {...form.bind('frequency')} options={BILLING_FREQUENCIES} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Next payment" error={form.errors.nextPayment}>
          <Input type="date" {...form.bind('nextPayment')} />
        </Field>
        <Field label="Category">
          <Select {...form.bind('category')} options={[...new Set([...EXPENSE_CATEGORIES, form.values.category])]} />
        </Field>
      </div>
      <Field label="Notes" optional>
        <Textarea {...form.bind('notes')} rows={2} maxLength={300} />
      </Field>
      {isEdit && <label className="row" style={{ gap: 8, cursor: 'pointer', width: 'fit-content' }}><Switch checked={form.values.active} onChange={(v) => form.set('active', v)} label="Active" /><span className="text-sm">Active</span></label>}
    </FormModal>
  );
}

/* ───────── Savings goals ───────── */

export function SavingsFormModal(props) {
  return props.open ? <SavingsForm {...props} /> : null;
}

function SavingsForm({ onClose, item: goal }) {
  const isEdit = !!goal;
  const toast = useToast();
  const confirm = useConfirm();
  const currency = useCurrency();
  const goals = useGoals();
  const create = useCreateSavingsGoal();
  const update = useUpdateSavingsGoal();
  const remove = useDeleteSavingsGoal();
  const form = useFormState(() => ({
    title: goal?.title ?? '', targetAmount: goal?.targetAmount?.toString() ?? '', currentAmount: goal?.currentAmount?.toString() ?? '0',
    monthlyContribution: goal?.monthlyContribution?.toString() ?? '', deadline: goal?.deadline ?? '', color: goal?.color ?? 'teal', goal: (goal?.goal?._id ?? goal?.goal) ?? '',
  }));

  const submit = async () => {
    if (!form.validate({ title: (v) => (!v.trim() ? 'Name the savings goal' : null), targetAmount: (v) => (!(Number(v) > 0) ? 'Enter a target' : null) })) return;
    const body = { ...form.values, title: form.values.title.trim(), targetAmount: num(form.values.targetAmount), currentAmount: num(form.values.currentAmount), monthlyContribution: num(form.values.monthlyContribution), deadline: form.values.deadline || null, goal: form.values.goal || null };
    try {
      if (isEdit) await update.mutateAsync({ id: goal._id, ...body });
      else await create.mutateAsync(body);
      toast.success(isEdit ? 'Savings goal updated' : 'Savings goal created');
      onClose();
    } catch (err) {
      form.handleError(err);
    }
  };

  const onDelete = async () => {
    if (!(await confirm({ title: `Delete "${goal.title}"?`, description: 'Contribution transactions are kept.' }))) return;
    try {
      await remove.mutateAsync(goal._id);
      toast.success('Savings goal deleted');
      onClose();
    } catch (err) {
      toast.apiError(err, "Couldn't delete");
    }
  };

  return (
    <FormModal title={isEdit ? 'Edit savings goal' : 'New savings goal'} size="sm" onClose={onClose} onSubmit={submit} submitting={create.isPending || update.isPending} onDelete={isEdit ? onDelete : undefined} deleting={remove.isPending}>
      <FormError error={form.formError} />
      <Field label="Goal" error={form.errors.title}>
        <Input {...form.bind('title')} maxLength={120} placeholder="e.g. Emergency fund" data-autofocus />
      </Field>
      <div className="form-row">
        <Field label={`Target (${currency})`} error={form.errors.targetAmount}>
          <Input type="number" inputMode="decimal" min="1" step="1" {...form.bind('targetAmount')} />
        </Field>
        <Field label={`Saved so far (${currency})`}>
          <Input type="number" inputMode="decimal" min="0" step="1" {...form.bind('currentAmount')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Monthly contribution" optional hint="Used to estimate completion">
          <Input type="number" inputMode="decimal" min="0" step="1" {...form.bind('monthlyContribution')} />
        </Field>
        <Field label="Deadline" optional>
          <Input type="date" {...form.bind('deadline')} />
        </Field>
      </div>
      <Field label="Linked goal" optional>
        <Select {...form.bind('goal')} placeholder="No goal" options={(goals.data ?? []).map((g) => ({ value: g._id, label: g.title }))} />
      </Field>
      <Field label="Color">
        <ColorPicker value={form.values.color} onChange={(c) => form.set('color', c)} />
      </Field>
    </FormModal>
  );
}
