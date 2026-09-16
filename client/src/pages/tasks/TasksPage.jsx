import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Inbox, ListTodo, Plus, Search, X } from 'lucide-react';
import { Button, Card, EmptyState, IconButton, Input, PageHeader, QueryState, SectionLabel, Select, SkeletonList, Tabs } from '../../components/ui';
import { TaskRow } from '../../features/tasks/TaskRow';
import { QuickAddTask } from '../../features/tasks/QuickAddTask';
import { useTasks } from '../../api/hooks';
import { api } from '../../api/client';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { useDebounce } from '../../hooks/useUtils';
import { PRIORITIES } from '../../lib/constants';
import { addDaysKey, relativeDay, todayKey } from '../../lib/dates';

const VIEWS = ['today', 'upcoming', 'open', 'nodate', 'completed'];

function groupTasks(tasks, view, sort) {
  if (view === 'completed') {
    const groups = new Map();
    for (const t of tasks) {
      const label = t.completedOn ? relativeDay(t.completedOn) : 'Earlier';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(t);
    }
    return [...groups].map(([label, list]) => ({ id: label, label, tasks: list }));
  }
  if (sort !== 'due') return [{ id: 'all', label: null, tasks }];

  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);
  const weekEnd = addDaysKey(today, 7);
  const buckets = [
    { id: 'overdue', label: 'Overdue', test: (d) => d && d < today },
    { id: 'today', label: 'Today', test: (d) => d === today },
    { id: 'tomorrow', label: 'Tomorrow', test: (d) => d === tomorrow },
    { id: 'week', label: 'Next 7 days', test: (d) => d && d > tomorrow && d <= weekEnd },
    { id: 'later', label: 'Later', test: (d) => d && d > weekEnd },
    { id: 'nodate', label: 'No date', test: (d) => !d },
  ];
  return buckets
    .map((b) => ({ id: b.id, label: b.label, tasks: tasks.filter((t) => b.test(t.dueDate)) }))
    .filter((g) => g.tasks.length);
}

export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'today';
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState('');
  const [sort, setSort] = useState('due');
  const q = useDebounce(search.trim(), 250);
  const openEditor = useEditor();
  const toast = useToast();
  const today = todayKey();

  const tasks = useTasks({ view, q: q || undefined, priority: priority || undefined, sort });
  const openTasks = useTasks({ view: 'open' });

  const counts = useMemo(() => {
    const list = openTasks.data ?? [];
    return {
      today: list.filter((t) => t.dueDate && t.dueDate <= today).length,
      upcoming: list.filter((t) => t.dueDate && t.dueDate > today).length,
      open: list.length,
      nodate: list.filter((t) => !t.dueDate).length,
      overdue: list.filter((t) => t.dueDate && t.dueDate < today).length,
    };
  }, [openTasks.data, today]);

  // Deep link: /tasks?task=<id> opens the task editor.
  const taskId = params.get('task');
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    api
      .get(`/tasks/${taskId}`)
      .then((task) => !cancelled && openEditor('task', { item: task }))
      .catch((err) => !cancelled && toast.apiError(err, "Couldn't open task"));
    const next = new URLSearchParams(params);
    next.delete('task');
    setParams(next, { replace: true });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const groups = useMemo(() => groupTasks(tasks.data ?? [], view, sort), [tasks.data, view, sort]);
  const filtering = !!(q || priority);

  const setView = (next) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('view', next);
    setParams(nextParams, { replace: true });
  };

  const quickAddDefaults = view === 'today' ? { dueDate: today } : view === 'upcoming' ? { dueDate: addDaysKey(today, 1) } : {};

  const emptyState = filtering ? (
    <EmptyState
      icon={Search}
      title="No matching tasks"
      description="Try a different search or clear the filters."
      action={<Button size="sm" onClick={() => { setSearch(''); setPriority(''); }}>Clear filters</Button>}
    />
  ) : {
    today: <EmptyState icon={CheckCircle2} title="You're all caught up" description="Nothing is due today. Enjoy the space — or plan ahead." />,
    upcoming: <EmptyState icon={CalendarClock} title="Nothing scheduled ahead" description="Tasks with future due dates will appear here." />,
    open: <EmptyState icon={ListTodo} title="No open tasks" description="Capture what's on your mind with the field above." />,
    nodate: <EmptyState icon={Inbox} title="No unscheduled tasks" description="Every open task has a due date." />,
    completed: <EmptyState icon={CheckCircle2} title="No completed tasks yet" description="Tasks you complete will be collected here." />,
  }[view];

  return (
    <div className="page">
      <PageHeader
        title="Tasks"
        subtitle={openTasks.data ? `${counts.open} open${counts.overdue ? ` · ${counts.overdue} overdue` : ''}` : ' '}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openEditor('task', { defaults: quickAddDefaults })}>
            New task
          </Button>
        }
      />

      <Tabs
        label="Task views"
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: 'Today', count: openTasks.data ? counts.today : undefined },
          { value: 'upcoming', label: 'Upcoming', count: openTasks.data ? counts.upcoming : undefined },
          { value: 'open', label: 'All open', count: openTasks.data ? counts.open : undefined },
          { value: 'nodate', label: 'No date', count: openTasks.data ? counts.nodate : undefined },
          { value: 'completed', label: 'Completed' },
        ]}
      />

      <div className="toolbar" style={{ marginTop: 14 }}>
        <div className="input-group" style={{ flex: '1 1 220px', maxWidth: 340 }}>
          <Search aria-hidden="true" />
          <Input size="sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" />
          {search && (
            <span className="input-group__suffix">
              <IconButton icon={X} size="xs" label="Clear search" onClick={() => setSearch('')} />
            </span>
          )}
        </div>
        <Select size="sm" value={priority} onChange={(e) => setPriority(e.target.value)} placeholder="Any priority" options={PRIORITIES} aria-label="Filter by priority" style={{ width: 140 }} />
        <div className="toolbar__spacer" />
        {view !== 'completed' && (
          <Select
            size="sm"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort tasks"
            style={{ width: 160 }}
            options={[
              { value: 'due', label: 'Sort: Due date' },
              { value: 'priority', label: 'Sort: Priority' },
              { value: 'created', label: 'Sort: Newest' },
              { value: 'updated', label: 'Sort: Recently edited' },
            ]}
          />
        )}
      </div>

      <Card flush>
        {view !== 'completed' && <QuickAddTask defaults={quickAddDefaults} placeholder={view === 'today' ? 'Add a task for today…' : 'Add a task…'} />}
        <QueryState query={tasks} loading={<SkeletonList rows={6} />} isEmpty={(d) => !d?.length} empty={emptyState}>
          {() => (
            <div style={{ opacity: tasks.isPlaceholderData ? 0.6 : 1, transition: 'opacity 150ms' }}>
              {groups.map((group) => (
                <div key={group.id}>
                  {group.label && <SectionLabel count={group.tasks.length}>{group.label}</SectionLabel>}
                  <div className="list">
                    {group.tasks.map((t) => <TaskRow key={t._id} task={t} />)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </QueryState>
      </Card>
    </div>
  );
}
