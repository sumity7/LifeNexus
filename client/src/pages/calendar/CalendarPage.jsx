import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import {
  addDays, addMinutes, addMonths, addWeeks, differenceInMinutes, endOfDay, format, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';
import { Bell, CheckSquare, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, IconButton, Segmented, SectionLabel } from '../../components/ui';
import { TaskRow } from '../../features/tasks/TaskRow';
import { useEvents, useReminders, useTasks } from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { useAuth } from '../../context/AuthContext';
import { useMediaQuery } from '../../hooks/useUtils';
import { expandEvents, fromKey, occursOnDay, toKey } from '../../lib/dates';
import { REMINDER_META } from '../../lib/constants';
import './calendar.css';

const HOUR_HEIGHT = 48;
const VIEWS = ['month', 'week', 'day'];

function groupBy(list = [], key) {
  const map = new Map();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const openEditor = useEditor();
  const isNarrow = useMediaQuery('(max-width: 640px)');
  const weekStartsOn = user?.preferences?.weekStartsOn ?? 1;

  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'month';
  const dateParam = params.get('date');
  const date = useMemo(() => (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? fromKey(dateParam) : startOfDay(new Date())), [dateParam]);

  const navigateTo = (nextDate, nextView = view) => setParams({ view: nextView, date: toKey(nextDate) }, { replace: true });

  const range = useMemo(() => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(date), { weekStartsOn });
      return { start, end: addDays(start, 42) };
    }
    if (view === 'week') {
      const start = startOfWeek(date, { weekStartsOn });
      return { start, end: addDays(start, 7) };
    }
    const start = startOfDay(date);
    return { start, end: addDays(start, 1) };
  }, [view, date, weekStartsOn]);

  const events = useEvents(range.start, range.end);
  const tasks = useTasks({ view: 'all', from: toKey(range.start), to: toKey(addDays(range.end, -1)) });
  const reminders = useReminders('active');

  const occurrences = useMemo(() => expandEvents(events.data ?? [], range.start, range.end), [events.data, range]);
  const tasksByDay = useMemo(() => groupBy(tasks.data, (t) => t.dueDate), [tasks.data]);
  const remindersByDay = useMemo(() => groupBy(reminders.data, (r) => r.date), [reminders.data]);

  const step = (dir) => {
    if (view === 'month') navigateTo(addMonths(date, dir));
    else if (view === 'week') navigateTo(addWeeks(date, dir));
    else navigateTo(addDays(date, dir));
  };

  const title =
    view === 'month'
      ? format(date, 'MMMM yyyy')
      : view === 'week'
        ? `${format(range.start, 'MMM d')} – ${format(addDays(range.end, -1), isSameMonth(range.start, addDays(range.end, -1)) ? 'd, yyyy' : 'MMM d, yyyy')}`
        : format(date, 'EEEE, MMMM d, yyyy');

  const createAt = (start, allDay = false) =>
    openEditor('event', { defaults: allDay ? { start: startOfDay(start), end: startOfDay(start), allDay: true } : { start, end: addMinutes(start, 60) } });

  const openEvent = (occ) => openEditor('event', { item: occ });
  const shared = { occurrences, tasksByDay, remindersByDay, onOpenEvent: openEvent };
  const loading = events.isFetching || tasks.isFetching;

  return (
    <div className="page page--wide calendar-page">
      <div className="calendar-toolbar">
        <div className="row" style={{ gap: 6 }}>
          <Button size="sm" onClick={() => navigateTo(startOfDay(new Date()))}>Today</Button>
          <IconButton icon={ChevronLeft} label={`Previous ${view}`} size="sm" onClick={() => step(-1)} />
          <IconButton icon={ChevronRight} label={`Next ${view}`} size="sm" onClick={() => step(1)} />
          <h1 className="calendar-toolbar__title" aria-live="polite">{title}</h1>
          {loading && <span className="spinner" style={{ width: 14, height: 14 }} role="status" aria-label="Loading" />}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Segmented label="Calendar view" value={view} onChange={(v) => navigateTo(date, v)} options={[{ value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }, { value: 'day', label: 'Day' }]} />
          <Button variant="primary" size="sm" icon={Plus} onClick={() => createAt(addMinutes(startOfDay(date), 9 * 60))}>
            <span className="desktop-only">New event</span>
          </Button>
        </div>
      </div>

      {events.isError && !events.data && (
        <Card style={{ marginBottom: 12 }}><ErrorState compact error={events.error} onRetry={() => events.refetch()} /></Card>
      )}

      {view === 'month' && (
        <MonthView
          {...shared}
          date={date}
          rangeStart={range.start}
          isNarrow={isNarrow}
          onSelectDay={(d) => navigateTo(d, 'day')}
          onCreate={(d) => createAt(addMinutes(startOfDay(d), 9 * 60))}
        />
      )}
      {view === 'week' && (
        <div className="timegrid-scroll">
          <TimeGrid {...shared} days={Array.from({ length: 7 }, (_, i) => addDays(range.start, i))} onSelectDay={(d) => navigateTo(d, 'day')} onCreateAt={createAt} />
        </div>
      )}
      {view === 'day' && (
        <div className="day-layout">
          <TimeGrid {...shared} days={[date]} onSelectDay={() => {}} onCreateAt={createAt} />
          <DayAgenda date={date} tasks={tasksByDay.get(toKey(date)) ?? []} reminders={remindersByDay.get(toKey(date)) ?? []} occurrences={occurrences} />
        </div>
      )}
    </div>
  );
}

function MonthView({ date, rangeStart, occurrences, tasksByDay, remindersByDay, onSelectDay, onCreate, onOpenEvent, isNarrow }) {
  const openEditor = useEditor();
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(rangeStart, i)), [rangeStart]);

  return (
    <div className="month" role="grid" aria-label={format(date, 'MMMM yyyy')}>
      <div className="month__weekdays" role="row">
        {days.slice(0, 7).map((d) => (
          <div key={d.toISOString()} role="columnheader" className="month__weekday">{format(d, isNarrow ? 'EEEEE' : 'EEE')}</div>
        ))}
      </div>
      <div className="month__grid">
        {days.map((day) => {
          const key = toKey(day);
          const dayEvents = occurrences.filter((o) => occursOnDay(o, day));
          const dayTasks = tasksByDay.get(key) ?? [];
          const dayReminders = remindersByDay.get(key) ?? [];
          const items = [
            ...dayEvents.map((e) => ({ type: 'event', id: e.key, data: e })),
            ...dayTasks.map((t) => ({ type: 'task', id: t._id, data: t })),
            ...dayReminders.map((r) => ({ type: 'reminder', id: r._id, data: r })),
          ];
          const limit = 3;
          const visible = items.slice(0, items.length > limit + 1 ? limit : limit + 1);
          const more = items.length - visible.length;

          return (
            <div
              key={key}
              role="gridcell"
              className={clsx('month-cell', !isSameMonth(day, date) && 'is-outside', isToday(day) && 'is-today')}
              onClick={isNarrow ? () => onSelectDay(day) : undefined}
            >
              <div className="month-cell__head">
                <button type="button" className="month-cell__day" onClick={(e) => { e.stopPropagation(); onSelectDay(day); }} aria-label={`${format(day, 'EEEE, MMMM d')}, ${items.length} items`}>
                  {format(day, 'd')}
                </button>
                <IconButton className="month-cell__add" icon={Plus} size="xs" label={`Add event on ${format(day, 'MMMM d')}`} onClick={(e) => { e.stopPropagation(); onCreate(day); }} />
              </div>
              {isNarrow ? (
                <div className="month-cell__dots" aria-hidden="true">
                  {items.slice(0, 4).map((item) => (
                    <span key={item.id} className={clsx('dot dot--sm', item.type === 'event' && `color-${item.data.color}`)} />
                  ))}
                </div>
              ) : (
                <div className="month-cell__items">
                  {visible.map((item) =>
                    item.type === 'event' ? (
                      <button key={item.id} type="button" className={`event-chip color-${item.data.color}`} onClick={() => onOpenEvent(item.data)} title={item.data.title}>
                        {!item.data.allDay && isSameDay(item.data.start, day) && <span className="event-chip__time">{format(item.data.start, 'h:mma').toLowerCase()}</span>}
                        <span>{item.data.title}</span>
                      </button>
                    ) : item.type === 'task' ? (
                      <button key={item.id} type="button" className={clsx('cal-item', item.data.status === 'done' && 'is-done')} onClick={() => openEditor('task', { item: item.data })} title={item.data.title}>
                        <CheckSquare aria-hidden="true" />
                        <span>{item.data.title}</span>
                      </button>
                    ) : (
                      <button key={item.id} type="button" className="cal-item" onClick={() => openEditor('reminder', { item: item.data })} title={item.data.title}>
                        <Bell aria-hidden="true" />
                        <span>{item.data.title}</span>
                      </button>
                    ),
                  )}
                  {more > 0 && (
                    <button type="button" className="month-cell__more" onClick={() => onSelectDay(day)}>+{more} more</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Lays out overlapping timed events into side-by-side lanes. */
function layoutDay(items) {
  const sorted = [...items].sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const placed = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = [];
    for (const item of cluster) {
      let lane = lanes.findIndex((end) => end <= item.top);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(item.bottom);
      } else {
        lanes[lane] = item.bottom;
      }
      item.lane = lane;
    }
    cluster.forEach((item) => placed.push({ ...item, lanes: lanes.length }));
    cluster = [];
  };

  for (const item of sorted) {
    if (cluster.length && item.top >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.bottom);
  }
  if (cluster.length) flush();
  return placed;
}

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function TimeGrid({ days, occurrences, tasksByDay, remindersByDay, onOpenEvent, onSelectDay, onCreateAt }) {
  const openEditor = useEditor();
  const scrollRef = useRef(null);
  const now = useNow();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 12;
  }, []);

  const columns = days.map((day) => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const onDay = occurrences.filter((o) => occursOnDay(o, day));
    const allDay = onDay.filter((o) => o.allDay || differenceInMinutes(o.end, o.start) >= 24 * 60);
    const timed = onDay
      .filter((o) => !allDay.includes(o))
      .map((o) => {
        const start = o.start < dayStart ? dayStart : o.start;
        const end = o.end > dayEnd ? dayEnd : o.end;
        const top = differenceInMinutes(start, dayStart);
        return { occ: o, top, bottom: Math.max(top + 30, differenceInMinutes(end, dayStart)) };
      });
    return { day, key: toKey(day), allDay, timed: layoutDay(timed) };
  });

  return (
    <div className="timegrid" style={{ '--cols': days.length }}>
      <div className="timegrid__header">
        <div className="timegrid__gutter" />
        {columns.map(({ day, key }) => (
          <button key={key} type="button" className={clsx('timegrid__dayhead', isToday(day) && 'is-today')} onClick={() => onSelectDay(day)}>
            <span>{format(day, 'EEE')}</span>
            <strong>{format(day, 'd')}</strong>
          </button>
        ))}
      </div>

      <div className="timegrid__allday">
        <div className="timegrid__gutter timegrid__gutter-label">All day</div>
        {columns.map(({ key, allDay }) => (
          <div key={key} className="timegrid__allday-cell">
            {allDay.map((o) => (
              <button key={o.key} type="button" className={`event-chip color-${o.color}`} onClick={() => onOpenEvent(o)} title={o.title}>
                <span>{o.title}</span>
              </button>
            ))}
            {(tasksByDay.get(key) ?? []).map((t) => (
              <button key={t._id} type="button" className={clsx('cal-item', t.status === 'done' && 'is-done')} onClick={() => openEditor('task', { item: t })} title={t.title}>
                <CheckSquare aria-hidden="true" /><span>{t.title}</span>
              </button>
            ))}
            {(remindersByDay.get(key) ?? []).map((r) => (
              <button key={r._id} type="button" className="cal-item" onClick={() => openEditor('reminder', { item: r })} title={r.title}>
                <Bell aria-hidden="true" /><span>{r.title}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="timegrid__body" ref={scrollRef}>
        <div className="timegrid__inner" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="timegrid__hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="timegrid__hour-label" style={{ top: h * HOUR_HEIGHT }}>
                {h === 0 ? '' : format(addMinutes(startOfDay(new Date()), h * 60), 'h a')}
              </div>
            ))}
          </div>
          {columns.map(({ day, key, timed }) => (
            <div
              key={key}
              className="timegrid__col"
              role="button"
              tabIndex={-1}
              aria-label={`Create event on ${format(day, 'EEEE, MMMM d')}`}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                const minutes = Math.max(0, Math.min(23 * 60 + 30, Math.floor(y / (HOUR_HEIGHT / 2)) * 30));
                onCreateAt(addMinutes(startOfDay(day), minutes));
              }}
            >
              {timed.map(({ occ, top, bottom, lane, lanes }) => (
                <button
                  key={occ.key}
                  type="button"
                  className={clsx('timegrid__event', `color-${occ.color}`, bottom - top < 45 && 'is-short')}
                  style={{
                    top: (top / 60) * HOUR_HEIGHT + 1,
                    height: ((bottom - top) / 60) * HOUR_HEIGHT - 2,
                    left: `calc(${(lane / lanes) * 100}% + 2px)`,
                    width: `calc(${100 / lanes}% - 4px)`,
                  }}
                  onClick={() => onOpenEvent(occ)}
                >
                  <strong>{occ.title}</strong>
                  <span>{format(occ.start, 'p')} – {format(occ.end, 'p')}{occ.location ? ` · ${occ.location}` : ''}</span>
                </button>
              ))}
              {isToday(day) && (
                <div className="timegrid__now" style={{ top: (differenceInMinutes(now, startOfDay(now)) / 60) * HOUR_HEIGHT }} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DayAgenda({ date, tasks, reminders, occurrences }) {
  const openEditor = useEditor();
  const dayEvents = occurrences.filter((o) => occursOnDay(o, date));
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Card title="Due this day" flush actions={<IconButton icon={Plus} size="sm" label="Add task for this day" onClick={() => openEditor('task', { defaults: { dueDate: toKey(date) } })} />}>
        {tasks.length ? (
          <div className="list">{tasks.map((t) => <TaskRow key={t._id} task={t} showDue={false} />)}</div>
        ) : (
          <EmptyState compact icon={CheckSquare} title="No tasks due" />
        )}
      </Card>
      <Card title="Reminders" flush>
        {reminders.length ? (
          <div className="list">
            {reminders.map((r) => (
              <button key={r._id} type="button" className="list-row list-row--interactive" style={{ border: 0, background: 'none', width: '100%', textAlign: 'left' }} onClick={() => openEditor('reminder', { item: r })}>
                <span aria-hidden="true">{REMINDER_META[r.category]?.emoji}</span>
                <span className="grow text-sm">{r.title}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState compact icon={Bell} title="No reminders" />
        )}
      </Card>
      <p className="text-xs muted">{dayEvents.length} event{dayEvents.length === 1 ? '' : 's'} · click an empty time slot to add one</p>
      <SectionLabel className="sr-only">End of agenda</SectionLabel>
    </div>
  );
}
