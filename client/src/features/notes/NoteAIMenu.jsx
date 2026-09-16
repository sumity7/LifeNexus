import { useState } from 'react';
import { CalendarClock, ListChecks, MessageCircleQuestion, PenLine, Sparkles, TextQuote, Wand2 } from 'lucide-react';
import { Button, Field, Input, Menu, Modal } from '../../components/ui';
import { Markdown } from '../../components/Markdown';
import { ActionProposals } from '../ai/ActionProposals';
import { useAIStatus, useExecuteProposal, useNoteAI } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';

/**
 * Contextual AI for a note: summarize / rewrite / extract tasks & dates /
 * checklist / ask. Results are shown in a modal; rewrites and checklists are
 * applied only when the user clicks "Replace note".
 */
export function NoteAIMenu({ note, onReplaceContent }) {
  const status = useAIStatus();
  const run = useNoteAI();
  const execute = useExecuteProposal();
  const toast = useToast();
  const [result, setResult] = useState(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const [pendingId, setPendingId] = useState(null);
  const [results, setResults] = useState({});

  const configured = status.data?.configured && status.data?.enabled !== false;

  const start = (action, q) => {
    setResult({ action, loading: true });
    run.mutate({ id: note._id, action, question: q }, {
      onSuccess: (data) => setResult({ action, ...data }),
      onError: (err) => { setResult(null); toast.apiError(err, err.code === 'AI_NOT_CONFIGURED' ? 'AI is not configured' : 'AI request failed'); },
    });
  };

  const decide = async (a, decision) => {
    if (decision === 'reject') return setResults((r) => ({ ...r, [a.id]: { status: 'rejected' } }));
    setPendingId(a.id);
    try {
      const res = await execute.mutateAsync({ type: a.type, payload: a.payload });
      setResults((r) => ({ ...r, [a.id]: { status: 'executed', ...res } }));
      toast.success('Created', { description: a.summary });
    } catch (err) {
      setResults((r) => ({ ...r, [a.id]: { status: 'failed', error: err.message } }));
    } finally {
      setPendingId(null);
    }
  };

  const items = [
    { label: 'Summarize', icon: TextQuote, onSelect: () => start('summarize') },
    { label: 'Rewrite for clarity', icon: PenLine, onSelect: () => start('rewrite') },
    { label: 'Turn into checklist', icon: ListChecks, onSelect: () => start('checklist') },
    { separator: true },
    { label: 'Extract tasks', icon: Wand2, onSelect: () => start('extract_tasks') },
    { label: 'Extract dates', icon: CalendarClock, onSelect: () => start('extract_dates') },
    { separator: true },
    { label: 'Ask about this note…', icon: MessageCircleQuestion, onSelect: () => setAsking(true) },
  ];

  const canReplace = result && !result.loading && (result.action === 'rewrite' || result.action === 'checklist') && /<[a-z]/i.test(result.reply ?? '');
  const title = { summarize: 'Summary', rewrite: 'Rewrite', checklist: 'Checklist', extract_tasks: 'Tasks found', extract_dates: 'Dates found', ask: 'Answer' }[result?.action] ?? 'AI';

  return (
    <>
      <Menu
        label="AI actions for this note"
        items={configured ? items : [{ heading: status.data?.configured ? 'AI is off in settings' : 'AI not configured on server' }]}
        renderTrigger={(props) => <Button size="sm" variant="ghost" icon={Sparkles} aria-label="AI actions for this note" {...props}>AI</Button>}
      />
      {asking && (
        <Modal open onClose={() => setAsking(false)} title="Ask about this note" size="sm" footer={<><Button variant="ghost" onClick={() => setAsking(false)}>Cancel</Button><Button variant="primary" disabled={!question.trim()} onClick={() => { setAsking(false); start('ask', question.trim()); }}>Ask</Button></>}>
          <Field label="Question"><Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What were the action items?" data-autofocus onKeyDown={(e) => { if (e.key === 'Enter' && question.trim()) { setAsking(false); start('ask', question.trim()); } }} /></Field>
        </Modal>
      )}
      {result && (
        <Modal
          open
          onClose={() => setResult(null)}
          title={title}
          size="lg"
          footer={
            <>
              <Button variant="ghost" onClick={() => setResult(null)}>Close</Button>
              {canReplace && <Button variant="primary" onClick={() => { onReplaceContent(result.reply); setResult(null); toast.success('Note updated'); }}>Replace note</Button>}
            </>
          }
        >
          {result.loading ? (
            <p className="row text-sm muted" style={{ gap: 8 }}><span className="spinner" style={{ width: 14, height: 14 }} /> Working on it…</p>
          ) : (
            <>
              {/<[a-z]/i.test(result.reply ?? '') ? <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeForPreview(result.reply) }} /> : <Markdown>{result.reply}</Markdown>}
              <ActionProposals actions={result.actions} onDecide={decide} pendingId={pendingId} results={results} />
            </>
          )}
        </Modal>
      )}
    </>
  );
}

/** Preview-only sanitiser: strips scripts/handlers. The server sanitises again on save. */
function sanitizeForPreview(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}
