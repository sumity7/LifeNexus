import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { AlertCircle, ArchiveRestore, Bell, CalendarClock, Check, CheckCircle2, Pencil, Plus, Repeat, Star, Trash2 } from 'lucide-react';
import {
  Badge, Button, Card, EmptyState, IconButton, Menu, PageHeader, QueryState, SectionLabel, SkeletonList, StatTile, Tabs,
} from '../../components/ui';
import { useCompleteReminder, useDeleteReminder, useReminders, useUpdateReminder } from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { REMINDER_META } from '../../lib/constants';
import { addDaysKey, countdown, formatKey, formatTimeHM, relativeDay, todayKey } from '../../lib/dates';

function ReminderItem({ reminder }) {
  const complete = useCompleteReminder();
  const update = useUpdateReminder();
  const remove = useDeleteReminder();
  const openEditor = useEditor();
  const toast = useToast();
  const confirm = useConfirm();
  const today = todayKey();
  const overdue = !reminder.completed && reminder.date < today;
  const inLead = !reminder.completed && !overdue && reminder.date <= addDaysKey(today, reminder.leadDays);
  const meta = REMINDER_META[reminder.category];

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this reminder?', description: `"${reminder.title}" will be permanently removed.` }))) return;
    remove.mutate(reminder._id, { onSuccess: () => toast.success('Reminder deleted'), onError: (err) => toast.apiError(err, "Couldn't delete reminder") });
  };

  return (
    <div className={clsx('list-row list-row--interactive reminder-row', reminder.completed && 'is-done')} onClick={() => openEditor('reminder', { item: reminder })}>
      <span className="icon-tile" aria-hidden="true">{meta?.emoji}</span>
      <div className="grow">
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="task-row__title truncate" style={{ width: 'auto' }} onClick={(e) => { e.stopPropagation(); openEditor('reminder', { item: reminder }); }}>
            {reminder.title}
          </button>
          {reminder.important && <Star size={13} className="text-warning" aria-label="Important" fill="currentColor" />}
        </div>
        <div className="task-row__meta">
          <span>{meta?.label}</span>
          {reminder.recurrence !== 'none' && <span className="task-row__meta-item"><Repeat aria-hidden="true" />{reminder.recurrence}</span>}
          {reminder.notes && <span className="truncate" style={{ maxWidth: 320 }}>{reminder.notes}</span>}
        </div>
      </div>
      <div className="stack stack--sm" style={{ alignItems: 'flex-end', gap: 2 }}>
        <span className="text-sm tabular">{formatKey(reminder.date, 'EEE, MMM d')}{reminder.time && ` · ${formatTimeHM(reminder.time)}`}</span>
        {reminder.completed ? (
          <span className="text-xs muted">Completed</span>
        ) : (
          <Badge tone={overdue ? 'danger' : inLead ? 'warning' : undefined} icon={overdue ? AlertCircle : undefined}>
            {overdue ? `Overdue · ${countdown(reminder.date)}` : countdown(reminder.date)}
          </Badge>
        )}
      </div>
      <div className="row" style={{ gap: 2 }} onClick={(e) => e.stopPropagation()}>
        {reminder.completed ? (
          <IconButton
            icon={ArchiveRestore}
            size="sm"
            label="Restore reminder"
            loading={update.isPending}
            onClick={() => update.mutate({ id: reminder._id, completed: false }, { onSuccess: () => toast.success('Reminder restored'), onError: (err) => toast.apiError(err, "Couldn't restore") })}
          />
        ) : (
          <IconButton
            icon={Check}
            size="sm"
            variant="secondary"
            label={`Complete ${reminder.title}`}
            loading={complete.isPending}
            onClick={() =>
              complete.mutate(reminder._id, {
                onSuccess: (payload) =>
                  toast.success(payload.meta.advanced ? 'Done — next one scheduled' : 'Reminder completed', {
                    description: payload.meta.advanced ? `${reminder.title} · ${relativeDay(payload.data.date)}` : reminder.title,
                  }),
                onError: (err) => toast.apiError(err, "Couldn't complete reminder"),
              })
            }
          />
        )}
        <Menu
          label={`Actions for ${reminder.title}`}
          items={[
            { label: 'Edit', icon: Pencil, onSelect: () => openEditor('reminder', { item: reminder }) },
            { separator: true },
            { label: 'Delete', icon: Trash2, danger: true, onSelect: onDelete },
          ]}
        />
      </div>
    </div>
  );
}

export default function RemindersPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'completed' ? 'completed' : 'active';
  const active = useReminders('active');
  const completed = useReminders('completed');
  const openEditor = useEditor();
  const today = todayKey();
  const query = tab === 'active' ? active : completed;

  const stats = useMemo(() => {
    const list = active.data ?? [];
    return {
      overdue: list.filter((r) => r.date < today).length,
      week: list.filter((r) => r.date >= today && r.date <= addDaysKey(today, 7)).length,
      important: list.filter((r) => r.important).length,
    };
  }, [active.data, today]);

  const groups = useMemo(() => {
    const list = query.data ?? [];
    if (tab === 'completed') return [{ id: 'done', label: null, items: list }];
    const week = addDaysKey(today, 7);
    const month = addDaysKey(today, 30);
    return [
      { id: 'overdue', label: 'Overdue', items: list.filter((r) => r.date < today) },
      { id: 'today', label: 'Today', items: list.filter((r) => r.date === today) },
      { id: 'week', label: 'Next 7 days', items: list.filter((r) => r.date > today && r.date <= week) },
      { id: 'month', label: 'Next 30 days', items: list.filter((r) => r.date > week && r.date <= month) },
      { id: 'later', label: 'Later', items: list.filter((r) => r.date > month) },
    ].filter((g) => g.items.length);
  }, [query.data, tab, today]);

  return (
    <div className="page">
      <PageHeader
        title="Reminders"
        subtitle="Birthdays, renewals, bills and deadlines — never missed."
        actions={<Button variant="primary" icon={Plus} onClick={() => openEditor('reminder')}>New reminder</Button>}
      />

      <div className="stat-grid" style={{ marginBottom: 18 }}>
        <StatTile icon={AlertCircle} label="Overdue" value={active.data ? stats.overdue : '—'} />
        <StatTile icon={CalendarClock} label="Next 7 days" value={active.data ? stats.week : '—'} />
        <StatTile icon={Star} label="Important" value={active.data ? stats.important : '—'} />
      </div>

      <Tabs
        label="Reminder status"
        value={tab}
        onChange={(v) => setParams(v === 'active' ? {} : { tab: v }, { replace: true })}
        options={[
          { value: 'active', label: 'Upcoming', count: active.data?.length },
          { value: 'completed', label: 'Completed', count: completed.data?.length },
        ]}
      />

      <Card flush style={{ marginTop: 16 }}>
        <QueryState
          query={query}
          loading={<SkeletonList rows={5} />}
          isEmpty={(d) => !d?.length}
          empty={
            tab === 'active' ? (
              <EmptyState icon={Bell} title="No upcoming reminders" description="Add important dates so they surface on your dashboard ahead of time." action={<Button icon={Plus} onClick={() => openEditor('reminder')}>Add a reminder</Button>} />
            ) : (
              <EmptyState icon={CheckCircle2} title="Nothing completed yet" description="One-off reminders you complete are kept here." />
            )
          }
        >
          {() =>
            groups.map((g) => (
              <div key={g.id}>
                {g.label && <SectionLabel count={g.items.length}>{g.label}</SectionLabel>}
                <div className="list">{g.items.map((r) => <ReminderItem key={r._id} reminder={r} />)}</div>
              </div>
            ))
          }
        </QueryState>
      </Card>
      <style>{`.reminder-row.is-done .task-row__title { color: var(--text-muted); }`}</style>
    </div>
  );
}
