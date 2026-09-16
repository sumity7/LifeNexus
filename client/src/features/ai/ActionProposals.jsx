import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Check, CheckCircle2, ExternalLink, X, XCircle } from 'lucide-react';
import { Badge, Button } from '../../components/ui';
import { ENTITY_LABELS } from '../../lib/constants';

const TYPE_LABEL = {
  create_task: 'Task', update_task: 'Task update', complete_task: 'Complete task',
  create_goal: 'Goal', update_goal: 'Goal update',
  create_project: 'Project', update_project: 'Project update',
  create_event: 'Event', update_event: 'Event update',
  create_reminder: 'Reminder', update_reminder: 'Reminder update',
  create_note: 'Note', create_journal: 'Journal', create_focus_session: 'Focus', create_habit: 'Habit',
};

const FIELD_LABEL = {
  title: 'Title', priority: 'Priority', dueDate: 'Due date', dueTime: 'Due time', status: 'Status', notes: 'Notes',
  description: 'Description', deadline: 'Deadline', date: 'Date', startTime: 'Start time', durationMin: 'Duration (min)',
  location: 'Location', time: 'Time', important: 'Important',
};
const blank = (v) => v === null || v === undefined || v === '' ? '—' : String(v);

function payloadLines(type, p) {
  const rows = [];
  if (p.dueDate) rows.push(`Due ${p.dueDate}${p.dueTime ? ` ${p.dueTime}` : ''}`);
  if (p.date && type !== 'create_journal') rows.push(`${p.date}${p.startTime ? ` at ${p.startTime}` : ''}${p.time ? ` at ${p.time}` : ''}`);
  if (p.priority) rows.push(`Priority ${p.priority}`);
  if (p.plannedMinutes) rows.push(`${p.plannedMinutes} min`);
  if (p.milestones?.length) rows.push(`${p.milestones.length} milestones: ${p.milestones.map((m) => m.title).join(', ')}`);
  if (p.subtasks?.length) rows.push(`${p.subtasks.length} subtasks`);
  if (p.deadline) rows.push(`Deadline ${p.deadline}`);
  if (p.location) rows.push(p.location);
  if (p.category) rows.push(p.category);
  if (p.content && type === 'create_note') rows.push(p.content.replace(/<[^>]+>/g, ' ').slice(0, 120));
  return rows;
}

/** For update/complete actions, show what will actually change (before → after) rather than the raw payload. */
function changeLines(type, payload, preview) {
  if (preview?.changes?.length) return preview.changes.map((c) => `${FIELD_LABEL[c.field] ?? c.field}: ${blank(c.before)} → ${blank(c.after)}`);
  return payloadLines(type, payload);
}

/**
 * Renders AI-proposed actions with explicit confirm/reject controls.
 * `onDecide(action, decision)` executes or rejects; results are shown inline.
 */
export function ActionProposals({ actions = [], onDecide, pendingId, results = {} }) {
  if (!actions.length) return null;
  return (
    <div className="proposals">
      {actions.map((a) => {
        const key = a._id ?? a.id;
        const result = results[key];
        const status = result?.status ?? a.status;
        return (
          <div key={key} className={clsx('proposal', `is-${status}`)}>
            <div className="proposal__head">
              <Badge tone={status === 'executed' ? 'success' : status === 'rejected' || status === 'failed' ? 'danger' : 'accent'}>{TYPE_LABEL[a.type] ?? a.type}</Badge>
              <span className="proposal__summary">{a.summary}</span>
            </div>
            {changeLines(a.type, a.payload, a.preview).length > 0 && (
              <ul className="proposal__details">{changeLines(a.type, a.payload, a.preview).map((l, i) => <li key={i}>{l}</li>)}</ul>
            )}
            <div className="proposal__actions">
              {status === 'proposed' && (
                <>
                  <Button size="sm" variant="primary" icon={Check} loading={pendingId === key} onClick={() => onDecide(a, 'execute')}>Confirm</Button>
                  <Button size="sm" variant="ghost" icon={X} disabled={pendingId === key} onClick={() => onDecide(a, 'reject')}>Dismiss</Button>
                </>
              )}
              {status === 'executed' && (
                <span className="row text-xs text-success" style={{ gap: 4 }}>
                  <CheckCircle2 size={14} aria-hidden="true" /> Done
                  {result?.href && <Link to={result.href} className="row text-accent" style={{ gap: 3, marginLeft: 6 }}>Open {ENTITY_LABELS[result.entityType]?.toLowerCase() ?? ''} <ExternalLink size={12} aria-hidden="true" /></Link>}
                </span>
              )}
              {status === 'rejected' && <span className="row text-xs muted" style={{ gap: 4 }}><XCircle size={14} aria-hidden="true" /> Dismissed</span>}
              {status === 'failed' && <span className="text-xs text-danger">Failed: {a.error ?? result?.error ?? 'unknown error'}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
