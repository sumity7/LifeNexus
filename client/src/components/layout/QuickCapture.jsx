import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BookHeart, CalendarPlus, CheckSquare, CornerDownLeft, FileText, NotebookPen, Sparkles, Target, Wallet, Zap } from 'lucide-react';
import { Kbd, Modal, Segmented } from '../ui';
import { Button } from '../ui';
import {
  useCreateEvent, useCreateGoal, useCreateReminder, useCreateTask, useCreateTransaction, useParseCapture, useSaveJournal,
} from '../../api/hooks';
import { useEditor } from '../../context/EditorContext';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useDebounce } from '../../hooks/useUtils';
import { formatKey, formatTimeHM, todayKey } from '../../lib/dates';
import { formatCurrency } from '../../lib/format';

const TYPES = [
  { value: 'task', label: 'Task', icon: CheckSquare },
  { value: 'event', label: 'Event', icon: CalendarPlus },
  { value: 'reminder', label: 'Reminder', icon: Bell },
  { value: 'transaction', label: 'Expense', icon: Wallet },
  { value: 'note', label: 'Note', icon: NotebookPen },
  { value: 'journal', label: 'Journal', icon: BookHeart },
  { value: 'goal', label: 'Goal', icon: Target },
  { value: 'document', label: 'Document', icon: FileText },
];

const EXAMPLES = ['Buy protein tomorrow', 'Meeting with Rahul Friday at 4 PM', 'Spent ₹850 on groceries', 'Passport expires 11 August 2032'];

/**
 * Global Quick Capture: one line of text → a typed draft (deterministic parser)
 * → created through the normal module APIs. Nothing is invented: when the
 * parser can't find a date/amount, the field simply stays empty.
 */
export function QuickCapture({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} bare overlayClassName="cmdk-overlay" className="cmdk capture">
      {open && <CaptureBody onClose={onClose} />}
    </Modal>
  );
}

function CaptureBody({ onClose }) {
  const [text, setText] = useState('');
  const [override, setOverride] = useState(null);
  const [saving, setSaving] = useState(false);
  const debounced = useDebounce(text.trim(), 180);
  const parse = useParseCapture();
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const openEditor = useEditor();
  const toast = useToast();
  const { user } = useAuth();
  const currency = user?.preferences?.currency ?? 'USD';

  const createTask = useCreateTask();
  const createEvent = useCreateEvent();
  const createReminder = useCreateReminder();
  const createTransaction = useCreateTransaction();
  const createGoal = useCreateGoal();
  const saveJournal = useSaveJournal();

  useEffect(() => {
    if (debounced) parse.mutate(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const draft = debounced ? parse.data : null;
  const type = override ?? draft?.type ?? 'task';
  const fields = draft?.fields?.[type] ?? {};

  const preview = (() => {
    if (!draft) return null;
    switch (type) {
      case 'task': return [fields.title, fields.dueDate && `due ${formatKey(fields.dueDate, 'EEE, MMM d')}`, fields.dueTime && formatTimeHM(fields.dueTime)].filter(Boolean).join(' · ');
      case 'event': return [fields.title, formatKey(fields.date, 'EEE, MMM d'), fields.time ? formatTimeHM(fields.time) : 'all day'].join(' · ');
      case 'reminder': return [fields.title, formatKey(fields.date, 'EEE, MMM d'), fields.category].join(' · ');
      case 'transaction': return [fields.amount ? formatCurrency(fields.amount, fields.currency ?? currency) : 'amount?', fields.category, fields.description, formatKey(fields.date, 'MMM d')].filter(Boolean).join(' · ');
      case 'journal': return `Journal entry for ${formatKey(fields.date, 'EEE, MMM d')}`;
      case 'note': return `Note "${fields.title}"`;
      case 'goal': return `Goal "${fields.title}"`;
      case 'document': return 'Opens the upload dialog';
      default: return null;
    }
  })();

  const finish = (message, href) => {
    toast.success(message, href ? { action: { label: 'Open', onClick: () => navigate(href) } } : undefined);
    onClose();
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    try {
      switch (type) {
        case 'task': {
          const t = await createTask.mutateAsync({ title: fields.title, dueDate: fields.dueDate, dueTime: fields.dueDate ? fields.dueTime : null });
          return finish('Task added', `/tasks?task=${t._id}`);
        }
        case 'event': {
          const start = fields.time ? new Date(`${fields.date}T${fields.time}:00`) : new Date(`${fields.date}T00:00:00`);
          const end = fields.time ? new Date(start.getTime() + 60 * 60_000) : new Date(`${fields.date}T23:59:59.999`);
          await createEvent.mutateAsync({ title: fields.title, start: start.toISOString(), end: end.toISOString(), allDay: !fields.time });
          return finish('Event added', `/calendar?view=day&date=${fields.date}`);
        }
        case 'reminder':
          await createReminder.mutateAsync({ title: fields.title, date: fields.date, time: fields.time, category: fields.category });
          return finish('Reminder set', '/reminders');
        case 'transaction':
          if (!(fields.amount > 0)) {
            onClose();
            openEditor('transaction', { defaults: { type: fields.type, category: fields.category ?? '', date: fields.date } });
            return;
          }
          await createTransaction.mutateAsync({ type: fields.type, amount: fields.amount, category: fields.category ?? 'Other', description: fields.description, date: fields.date });
          return finish(`${fields.type === 'income' ? 'Income' : 'Expense'} recorded`, '/finance');
        case 'journal':
          await saveJournal.mutateAsync({ date: fields.date ?? todayKey(), content: fields.content });
          return finish('Journal entry saved', `/journal?date=${fields.date ?? todayKey()}`);
        case 'goal': {
          const g = await createGoal.mutateAsync({ title: fields.title });
          return finish('Goal created', `/goals/${g._id}`);
        }
        case 'note':
          onClose();
          openEditor('note', { defaults: { title: fields.title, content: `<p>${escapeHtml(fields.content)}</p>` } });
          return;
        case 'document':
          onClose();
          navigate('/documents?upload=1');
          return;
        default:
          return;
      }
    } catch (err) {
      toast.apiError(err, "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="cmdk__input-wrap">
        <Zap aria-hidden="true" />
        <input
          ref={inputRef}
          className="cmdk__input"
          placeholder="Capture anything… e.g. “Call dentist tomorrow 3pm”"
          value={text}
          onChange={(e) => { setText(e.target.value); setOverride(null); }}
          data-autofocus
          aria-label="Capture text"
          autoComplete="off"
          maxLength={500}
        />
        <Kbd>Esc</Kbd>
      </div>
      <div className="capture__body">
        <Segmented label="Capture as" value={type} onChange={setOverride} options={TYPES.map((t) => ({ value: t.value, label: t.label, icon: t.icon }))} />
        {draft ? (
          <div className="capture__preview">
            <span className="capture__preview-label">Will create</span>
            <span className="capture__preview-text">{preview}</span>
            {draft.confidence === 'low' && <span className="text-2xs muted">No date or amount detected — you can adjust after saving.</span>}
          </div>
        ) : (
          <div className="capture__examples">
            <span className="text-xs muted">Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="capture__example" onClick={() => setText(ex)}>{ex}</button>
            ))}
          </div>
        )}
        <div className="row row--between">
          <span className="text-2xs faint row" style={{ gap: 4 }}><Sparkles size={11} aria-hidden="true" /> Rule-based parsing · dates, times and amounts</span>
          <Button type="submit" variant="primary" size="sm" disabled={!draft} loading={saving} iconRight={CornerDownLeft}>Save</Button>
        </div>
      </div>
    </form>
  );
}

const escapeHtml = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
