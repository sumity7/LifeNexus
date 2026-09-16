import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { addDays, addMonths, endOfMonth, format, getDay, startOfMonth } from 'date-fns';
import { BookHeart, Check, ChevronLeft, ChevronRight, Plus, Search, Sparkles, Trash2, X } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Input, PageHeader, Skeleton, SkeletonList, TagInput, Textarea } from '../../components/ui';
import { useDeleteJournal, useJournalCalendar, useJournalEntries, useJournalEntry, useSaveJournal } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { useDebounce } from '../../hooks/useUtils';
import { addDaysKey, formatKey, fromKey, relativeDay, toKey, todayKey } from '../../lib/dates';
import { useNavigate } from 'react-router-dom';

const MOODS = ['😞', '🙁', '😐', '🙂', '😄'];
const MOOD_LABELS = ['Awful', 'Low', 'Okay', 'Good', 'Great'];
const SAVE_LABEL = { saved: 'Saved', pending: 'Unsaved changes', saving: 'Saving…', error: "Couldn't save" };

export default function JournalPage() {
  const [params, setParams] = useSearchParams();
  const today = todayKey();
  const requested = params.get('date');
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today ? requested : today;
  const setDate = (key) => setParams(key === today ? {} : { date: key }, { replace: true });
  const entry = useJournalEntry(date);
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 250);
  const results = useJournalEntries({ q: q || undefined }, { enabled: q.length >= 2 });

  return (
    <div className="page page--wide">
      <PageHeader
        title="Journal"
        subtitle="A few honest lines a day — mood and energy flow into your health log automatically."
        actions={
          <div className="row" style={{ gap: 2 }}>
            <IconButton icon={ChevronLeft} label="Previous day" onClick={() => setDate(addDaysKey(date, -1))} />
            <span className="weight-medium" style={{ minWidth: 150, textAlign: 'center' }} aria-live="polite">{relativeDay(date, { weekday: false })} · {formatKey(date, 'EEE')}</span>
            <IconButton icon={ChevronRight} label="Next day" disabled={date >= today} onClick={() => setDate(addDaysKey(date, 1))} />
            {date !== today && <Button size="sm" onClick={() => setDate(today)}>Today</Button>}
          </div>
        }
      />
      <div className="journal-layout">
        <div className="stack" style={{ gap: 16 }}>
          {entry.isPending ? (
            <Card><Skeleton height={30} width="40%" /><Skeleton height={120} style={{ marginTop: 16 }} /></Card>
          ) : entry.isError ? (
            <Card><ErrorState error={entry.error} onRetry={() => entry.refetch()} /></Card>
          ) : (
            <Editor key={date} date={date} entry={entry.data} onDeleted={() => setDate(today)} />
          )}
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <MonthCalendar date={date} onSelect={setDate} today={today} />
          <Card title="Search entries" flush>
            <div style={{ padding: '4px 12px 8px' }}>
              <div className="input-group"><Search aria-hidden="true" /><Input size="sm" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your journal" aria-label="Search journal" /></div>
            </div>
            {q.length >= 2 && (results.isPending ? <SkeletonList rows={3} /> : !results.data?.length ? <p className="text-sm muted" style={{ padding: '4px 16px 12px' }}>No entries match.</p> : (
              <div>{results.data.slice(0, 8).map((e) => (
                <button key={e._id} type="button" className="journal-entry-row" onClick={() => { setDate(e.date); setSearch(''); }}>
                  <span aria-hidden="true">{e.mood ? MOODS[e.mood - 1] : '📝'}</span>
                  <span className="grow"><span className="text-sm weight-medium" style={{ display: 'block' }}>{e.title || formatKey(e.date, 'EEE, MMM d')}</span><span className="text-xs muted truncate" style={{ display: 'block' }}>{e.content?.slice(0, 90) || e.wins?.[0] || ''}</span></span>
                </button>
              ))}</div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function ListEditor({ label, values, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    if (!draft.trim()) return;
    onChange([...values, draft.trim()].slice(0, 20));
    setDraft('');
  };
  return (
    <Field label={label} optional>
      <div className="list-editor">
        {values.map((v, i) => (
          <div key={`${v}-${i}`} className="list-editor__row">
            <Check size={14} className="text-success" aria-hidden="true" />
            <input className="subtasks-editor__input" value={v} aria-label={`${label} ${i + 1}`} maxLength={300} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
            <IconButton icon={X} size="xs" label="Remove" onClick={() => onChange(values.filter((_, j) => j !== i))} />
          </div>
        ))}
        <input className="input input--sm" value={draft} placeholder={placeholder} maxLength={300} aria-label={`Add ${label}`} onChange={(e) => setDraft(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
      </div>
    </Field>
  );
}

function Editor({ date, entry, onDeleted }) {
  const save = useSaveJournal();
  const remove = useDeleteJournal();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [values, setValues] = useState({ title: entry.title ?? '', content: entry.content ?? '', wins: entry.wins ?? [], challenges: entry.challenges ?? [], gratitude: entry.gratitude ?? [], lessons: entry.lessons ?? '', intention: entry.intention ?? '', tags: entry.tags ?? [], mood: entry.mood ?? null, energy: entry.energy ?? null });
  const [status, setStatus] = useState('saved');
  const pending = useRef({});
  const timer = useRef(null);

  const flush = () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setStatus('saving');
    save.mutate({ date, ...patch }, {
      onSuccess: () => setStatus(Object.keys(pending.current).length ? 'pending' : 'saved'),
      onError: (err) => { pending.current = { ...patch, ...pending.current }; setStatus('error'); toast.apiError(err, "Couldn't save entry"); },
    });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const update = (patch, delay = 700) => {
    setValues((v) => ({ ...v, ...patch }));
    pending.current = { ...pending.current, ...patch };
    setStatus('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), delay);
  };

  const onDelete = async () => {
    if (!(await confirm({ title: 'Delete this entry?', description: `The journal entry for ${formatKey(date)} will be removed. Mood and energy stay in your health log.` }))) return;
    pending.current = {};
    clearTimeout(timer.current);
    try {
      await remove.mutateAsync(date);
      toast.success('Entry deleted');
      onDeleted();
    } catch (err) {
      toast.apiError(err, "Couldn't delete");
    }
  };

  return (
    <>
      {entry.previousIntention && !entry.exists && (
        <div className="journal-prompt"><strong>Yesterday's intention:</strong> {entry.previousIntention.text} <span className="muted">— how did it go?</span></div>
      )}
      <Card
        title={<input className="note-editor__title" style={{ fontSize: '1.25rem' }} value={values.title} placeholder={formatKey(date, 'EEEE, MMMM d')} aria-label="Entry title" maxLength={200} onChange={(e) => update({ title: e.target.value })} />}
        actions={
          <>
            <span className={clsx('save-status', `is-${status}`)} role="status">{status === 'saved' && <Check aria-hidden="true" />}{entry.exists || status !== 'saved' ? SAVE_LABEL[status] : 'New entry'}</span>
            <IconButton icon={Sparkles} size="sm" label="Ask AI about this week" onClick={() => navigate('/ai?prompt=Summarize%20my%20week%20from%20my%20journal%20and%20health%20logs')} />
            {entry.exists && <IconButton icon={Trash2} size="sm" label="Delete entry" onClick={onDelete} />}
          </>
        }
      >
        <div className="stack" style={{ gap: 16 }}>
          <div className="form-row">
            <Field label="Mood">
              <div className="mood-row" role="radiogroup" aria-label="Mood">
                {MOODS.map((m, i) => <button key={m} type="button" role="radio" aria-checked={values.mood === i + 1} aria-label={MOOD_LABELS[i]} title={MOOD_LABELS[i]} className="choice choice--emoji" onClick={() => update({ mood: values.mood === i + 1 ? null : i + 1 }, 0)}>{m}</button>)}
              </div>
            </Field>
            <Field label="Energy">
              <div className="mood-row" role="radiogroup" aria-label="Energy">
                {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={values.energy === n} className="choice" onClick={() => update({ energy: values.energy === n ? null : n }, 0)}>{n}</button>)}
              </div>
            </Field>
          </div>
          <Textarea value={values.content} rows={6} maxLength={20000} placeholder="What happened today? What's on your mind?" aria-label="Journal entry" onChange={(e) => update({ content: e.target.value })} />
          <div className="grid-3" style={{ gap: 12 }}>
            <ListEditor label="Wins" values={values.wins} onChange={(v) => update({ wins: v }, 300)} placeholder="+ Something that went well" />
            <ListEditor label="Challenges" values={values.challenges} onChange={(v) => update({ challenges: v }, 300)} placeholder="+ Something that was hard" />
            <ListEditor label="Gratitude" values={values.gratitude} onChange={(v) => update({ gratitude: v }, 300)} placeholder="+ Grateful for" />
          </div>
          <div className="form-row">
            <Field label="Lesson" optional><Input value={values.lessons} maxLength={2000} placeholder="One thing I learned" aria-label="Lesson" onChange={(e) => update({ lessons: e.target.value })} /></Field>
            <Field label="Tomorrow's intention" optional><Input value={values.intention} maxLength={500} placeholder="What matters most tomorrow?" aria-label="Intention" onChange={(e) => update({ intention: e.target.value })} /></Field>
          </div>
          <Field label="Tags" optional><TagInput value={values.tags} onChange={(t) => update({ tags: t }, 0)} /></Field>
        </div>
      </Card>
    </>
  );
}

function MonthCalendar({ date, onSelect, today }) {
  const { user } = useAuth();
  const weekStartsOn = user?.preferences?.weekStartsOn ?? 1;
  const [month, setMonth] = useState(() => startOfMonth(fromKey(date)));
  useEffect(() => setMonth(startOfMonth(fromKey(date))), [date]);
  const from = toKey(startOfMonth(month));
  const to = toKey(endOfMonth(month));
  const cal = useJournalCalendar(from, to);
  const byDate = useMemo(() => new Map((cal.data ?? []).map((e) => [e.date, e])), [cal.data]);
  const days = [];
  const lead = (getDay(startOfMonth(month)) - weekStartsOn + 7) % 7;
  for (let i = 0; i < lead; i++) days.push(null);
  for (let d = startOfMonth(month); d <= endOfMonth(month); d = addDays(d, 1)) days.push(d);
  const labels = Array.from({ length: 7 }, (_, i) => format(addDays(startOfMonth(new Date(2024, 0, 7)), (i + weekStartsOn) % 7), 'EEEEE'));

  return (
    <Card
      title={format(month, 'MMMM yyyy')}
      icon={BookHeart}
      subtitle={cal.data ? `${cal.data.length} entries` : undefined}
      actions={<><IconButton icon={ChevronLeft} size="xs" label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))} /><IconButton icon={ChevronRight} size="xs" label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))} disabled={toKey(endOfMonth(month)) >= today} /></>}
    >
      <div className="journal-cal" aria-hidden="true" style={{ marginBottom: 4 }}>{labels.map((l, i) => <span key={i} className="text-2xs muted" style={{ textAlign: 'center' }}>{l}</span>)}</div>
      <div className="journal-cal">
        {days.map((d, i) => {
          if (!d) return <span key={`pad-${i}`} />;
          const key = toKey(d);
          const e = byDate.get(key);
          return (
            <button key={key} type="button" className={clsx('journal-cal__day', e && 'has-entry', key === date && 'is-selected')} disabled={key > today} title={e ? `${e.title || 'Entry'}${e.mood ? ` · ${MOOD_LABELS[e.mood - 1]}` : ''}` : formatKey(key)} aria-label={`${formatKey(key, 'MMMM d')}${e ? ', has entry' : ''}`} onClick={() => onSelect(key)}>
              {e?.mood ? MOODS[e.mood - 1] : format(d, 'd')}
            </button>
          );
        })}
      </div>
      {!cal.isPending && !cal.data?.length && <EmptyState compact icon={Plus} title="No entries this month" />}
    </Card>
  );
}
