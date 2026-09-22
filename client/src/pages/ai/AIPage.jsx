import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { formatDistanceToNowStrict } from 'date-fns';
import { Bot, Clock, CornerDownLeft, MessageSquarePlus, Send, Settings2, ShieldCheck, Sparkles, Trash2, User as UserIcon } from 'lucide-react';
import { Badge, Button, Card, EmptyState, ErrorState, IconButton, Kbd, PageHeader, Select, Skeleton, SkeletonList } from '../../components/ui';
import { Markdown } from '../../components/Markdown';
import { ActionProposals } from '../../features/ai/ActionProposals';
import { useAIStatus, useConversation, useConversations, useDecideAIAction, useDeleteConversation, useSendAIMessage } from '../../api/hooks';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useAuth } from '../../context/AuthContext';
import { AI_SCOPES, ENTITY_LABELS } from '../../lib/constants';

const MODES = [
  { value: '', label: 'Auto' },
  { value: 'ask', label: 'Ask' },
  { value: 'analyze', label: 'Analyze' },
  { value: 'recommend', label: 'Recommend' },
  { value: 'create', label: 'Create' },
  { value: 'act', label: 'Act' },
];

// A deliberate mix of LifeNexus-aware and general-knowledge prompts — this is where a
// first-time visitor discovers the assistant answers both, not just questions about their data.
const SUGGESTIONS = [
  'Plan my day',
  'What are my overdue tasks?',
  'What is on my calendar today?',
  'How much did I spend this month?',
  'How are my habits going?',
  'Summarize my week',
  'Create a 6-hour DSA timetable',
  'Give me a web developer interview roadmap',
  'Explain binary search',
  'What should I focus on today?',
];

export default function AIPage() {
  const [params, setParams] = useSearchParams();
  const status = useAIStatus();
  const conversations = useConversations();
  const conversationId = params.get('c');
  const conversation = useConversation(conversationId);
  const send = useSendAIMessage();
  const decide = useDecideAIAction();
  const remove = useDeleteConversation();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { user } = useAuth();

  const contextParam = params.get('context');
  const anchor = useMemo(() => {
    if (!contextParam) return null;
    const [type, id] = contextParam.split(':');
    return type && id && /^[a-f\d]{24}$/i.test(id) ? { type, id } : null;
  }, [contextParam]);

  const [draft, setDraft] = useState(params.get('prompt') ?? '');
  const [mode, setMode] = useState('');
  const [pendingId, setPendingId] = useState(null);
  const [results, setResults] = useState({});
  const [localMessages, setLocalMessages] = useState([]);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => setLocalMessages([]), [conversationId]);
  // Defensive: conversation.data can refresh from other triggers (remount, window refocus) while
  // a local message hasn't been cleared yet — drop any local entry the server copy already has,
  // by _id, so the same message (e.g. a real, persisted assistant reply) never renders twice.
  const messages = useMemo(() => {
    const fromServer = conversation.data?.messages ?? [];
    const serverIds = new Set(fromServer.map((m) => m._id));
    return [...fromServer, ...localMessages.filter((m) => !serverIds.has(m._id))];
  }, [conversation.data, localMessages]);
  // Block body (not an implicit return): scrollIntoView() resolves to a Promise in current
  // Chrome, and an implicitly-returned Promise gets treated by React as the effect's cleanup —
  // which then throws ("X is not a function") the next time the effect tears down.
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, send.isPending]);

  const configured = status.data?.configured;
  const enabled = status.data?.enabled !== false;
  const deniedScopes = AI_SCOPES.filter((s) => status.data?.scopes?.[s.value] === false);

  const submit = async (text) => {
    const message = (text ?? draft).trim();
    if (!message || send.isPending) return;
    setDraft('');
    const optimistic = { _id: `local-${Date.now()}`, role: 'user', content: message, createdAt: new Date().toISOString() };
    setLocalMessages((m) => [...m, optimistic]);
    try {
      const result = await send.mutateAsync({ message, mode: mode || undefined, conversationId: conversationId ?? undefined, context: anchor ?? undefined });
      if (result.conversation._id !== conversationId) {
        // First message in a brand-new conversation: switching the URL mounts useConversation
        // on a fresh query key, which fetches both messages straight away — no cache to go stale.
        setParams((p) => { const n = new URLSearchParams(p); n.set('c', result.conversation._id); n.delete('prompt'); return n; }, { replace: true });
      } else {
        // Continuing an existing conversation: append the reply we already have instead of
        // waiting on a background refetch of useConversation (which only re-runs on window
        // refocus) — otherwise the reply, and even the user's own message, can sit invisible
        // for minutes after a slow response until the tab happens to regain focus.
        setLocalMessages((m) => [...m, result.message]);
      }
    } catch (err) {
      setLocalMessages((m) => m.filter((x) => x._id !== optimistic._id));
      setDraft(message);
      // Server error messages are already user-safe and specific (missing key, rate limit, timeout, disabled module…).
      toast.apiError(err, err.code === 'AI_RATE_LIMITED' ? 'Slow down a little' : "The assistant couldn't answer");
    }
  };

  const onDecide = async (action, decision) => {
    const message = messages.find((m) => m.actions?.some((a) => a._id === action._id));
    if (!message) return;
    setPendingId(action._id);
    try {
      const { action: updated, result } = await decide.mutateAsync({ messageId: message._id, actionId: action._id, decision });
      setResults((r) => ({ ...r, [action._id]: { status: updated.status, ...(result ?? {}) } }));
      if (decision === 'execute') toast.success('Done', { description: action.summary, action: result?.href ? { label: 'Open', onClick: () => navigate(result.href) } : undefined });
    } catch (err) {
      setResults((r) => ({ ...r, [action._id]: { status: 'failed', error: err.message } }));
      toast.apiError(err, "Couldn't run that action");
    } finally {
      setPendingId(null);
    }
  };

  const newChat = () => {
    setParams({}, { replace: true });
    setLocalMessages([]);
    textareaRef.current?.focus();
  };

  return (
    <div className="page page--wide">
      <PageHeader
        title="Assistant"
        subtitle="One assistant that understands your tasks, calendar, goals, habits, health, notes, journal, documents and finances — with your permission."
        actions={<><Button icon={Settings2} onClick={() => navigate('/settings#ai')}>AI settings</Button><Button variant="primary" icon={MessageSquarePlus} onClick={newChat}>New chat</Button></>}
      />
      <div className="ai-layout">
        <aside className="ai-sidebar">
          <Card title="Conversations" flush>
            <div style={{ padding: '4px 6px 8px', maxHeight: 420, overflowY: 'auto' }}>
              {conversations.isPending ? <SkeletonList rows={3} /> : !conversations.data?.length ? <p className="text-xs muted" style={{ padding: '4px 8px' }}>No conversations yet.</p> : conversations.data.map((c) => (
                <div key={c._id} className={clsx('ai-convo', c._id === conversationId && 'is-active')} role="button" tabIndex={0} onClick={() => setParams({ c: c._id }, { replace: true })} onKeyDown={(e) => e.key === 'Enter' && setParams({ c: c._id }, { replace: true })}>
                  <span className="truncate grow">{c.title}</span>
                  <IconButton icon={Trash2} size="xs" label="Delete conversation" onClick={async (e) => { e.stopPropagation(); if (await confirm({ title: 'Delete this conversation?' })) remove.mutate(c._id, { onSuccess: () => c._id === conversationId && newChat() }); }} />
                </div>
              ))}
            </div>
          </Card>
          <Card title="Access" icon={ShieldCheck}>
            <p className="text-xs muted" style={{ marginBottom: 6 }}>{configured ? `Provider: ${status.data.provider}${status.data.model ? ` · ${status.data.model}` : ''}` : 'No AI provider configured'}</p>
            {deniedScopes.length ? <p className="text-xs">Hidden from AI: <strong>{deniedScopes.map((s) => s.label).join(', ')}</strong></p> : <p className="text-xs">All modules are available to the assistant.</p>}
            <Link to="/settings#ai" className="text-xs text-accent">Manage permissions</Link>
          </Card>
        </aside>

        <div className="ai-thread">
          {status.isPending ? <Skeleton height={80} /> : !configured ? (
            <Card>
              <EmptyState icon={Sparkles} title="AI isn't configured on this server yet" description="Add a provider key on the server to enable the assistant. Everything else in LifeNexus works without it." />
              <div className="ai-setup">
                In <code>server/.env</code> set <code>AI_PROVIDER=anthropic</code> with <code>ANTHROPIC_API_KEY=…</code>, or <code>AI_PROVIDER=gemini</code> with <code>GEMINI_API_KEY=…</code> (free tier, no card required — get one at aistudio.google.com), then restart the API. Keys never leave the server.
              </div>
            </Card>
          ) : !enabled ? (
            <Card><EmptyState icon={ShieldCheck} title="AI is turned off in your settings" action={<Button onClick={() => navigate('/settings#ai')}>Turn it on</Button>} /></Card>
          ) : (
            <>
              <div className="ai-messages">
                {anchor && <div className="row" style={{ gap: 6 }}><Badge tone="accent">Focused on {ENTITY_LABELS[anchor.type]?.toLowerCase() ?? anchor.type}</Badge><Button size="xs" variant="ghost" onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.delete('context'); return n; })}>Clear</Button></div>}
                {conversation.data?.ephemeral && (
                  <Badge tone="warning" title="Remember conversations is off in Settings — this chat disappears from history after about an hour.">
                    <Clock aria-hidden="true" /> Not saved
                  </Badge>
                )}
                {conversation.isError && <ErrorState compact error={conversation.error} onRetry={() => conversation.refetch()} />}
                {conversationId && conversation.isPending && <SkeletonList rows={3} />}
                {!messages.length && !conversation.isPending && (
                  <div className="stack" style={{ gap: 14, marginTop: 8 }}>
                    <div className="ai-msg"><span className="ai-msg__avatar"><Bot aria-hidden="true" /></span><div className="ai-msg__bubble"><p className="text-sm">Hi {user?.name?.split(' ')[0]}. Ask me anything about your day, or tell me what to create. I only use data from modules you've allowed, and I'll ask before changing anything.</p></div></div>
                    <div className="ai-suggestions">{SUGGESTIONS.map((s) => <button key={s} type="button" className="ai-chip" onClick={() => submit(s)}>{s}</button>)}</div>
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m._id} className={clsx('ai-msg', m.role === 'user' && 'ai-msg--user')}>
                    <span className="ai-msg__avatar">{m.role === 'user' ? <UserIcon aria-hidden="true" /> : <Bot aria-hidden="true" />}</span>
                    <div className="ai-msg__bubble">
                      {m.role === 'user' ? <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p> : <Markdown>{m.content}</Markdown>}
                      {m.role === 'assistant' && <ActionProposals actions={m.actions} onDecide={onDecide} pendingId={pendingId} results={results} />}
                      {m.role === 'assistant' && (
                        <div className="ai-msg__meta">
                          {m.mode && <span>{m.mode}</span>}
                          {m.sources?.length > 0 && <span>· used {m.sources.join(', ')}</span>}
                          {m.createdAt && <span>· {formatDistanceToNowStrict(new Date(m.createdAt), { addSuffix: true })}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {send.isPending && <div className="ai-msg"><span className="ai-msg__avatar"><Bot aria-hidden="true" /></span><div className="ai-msg__bubble"><span className="row text-sm muted" style={{ gap: 8 }}><span className="spinner" style={{ width: 14, height: 14 }} /> Thinking…</span></div></div>}
                <div ref={bottomRef} />
              </div>
              <div className="ai-composer">
                <form className="ai-composer__box" onSubmit={(e) => { e.preventDefault(); submit(); }}>
                  <textarea ref={textareaRef} value={draft} rows={1} maxLength={6000} placeholder="Ask, analyze, or tell me what to create…" aria-label="Message the assistant" autoFocus onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} />
                  <Select size="sm" value={mode} onChange={(e) => setMode(e.target.value)} options={MODES} aria-label="Mode" style={{ width: 120 }} />
                  <Button type="submit" variant="primary" size="sm" icon={Send} loading={send.isPending} disabled={!draft.trim()}>Send</Button>
                </form>
                <p className="text-2xs faint" style={{ marginTop: 6 }}><Kbd><CornerDownLeft size={10} /></Kbd> send · <Kbd>Shift</Kbd>+<Kbd><CornerDownLeft size={10} /></Kbd> new line · Actions run only after you confirm</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
