import { useState } from 'react';
import { addWeeks, format, startOfWeek } from 'date-fns';
import { Activity, BookHeart, CheckSquare, ChevronLeft, ChevronRight, ClipboardCheck, Flame, PiggyBank, RefreshCw, Sparkles, Target, Timer } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, IconButton, PageHeader, ProgressBar, Skeleton } from '../../components/ui';
import { Markdown } from '../../components/Markdown';
import { useRefreshInsight, useWeeklyReview } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatKey, toKey } from '../../lib/dates';
import { formatCurrency, formatDuration } from '../../lib/format';
import { AI_WITHHELD_REASON } from '../../lib/constants';

function Delta({ current, previous, suffix = '', upIsGood = true }) {
  if (current === null || previous === null || previous === undefined || current === undefined) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  if (!diff) return <span className="delta muted">= last week</span>;
  const good = diff > 0 === upIsGood;
  return <span className={`delta ${good ? 'text-success' : 'text-danger'}`}>{diff > 0 ? '+' : ''}{diff}{suffix} vs last week</span>;
}

export default function ReviewPage() {
  const { user } = useAuth();
  const weekStartsOn = user?.preferences?.weekStartsOn ?? 1;
  const currency = user?.preferences?.currency ?? 'USD';
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn }));
  const week = toKey(weekStart);
  const review = useWeeklyReview(week);
  const refresh = useRefreshInsight();
  const toast = useToast();
  const d = review.data;
  const m = d?.metrics;
  const isCurrent = toKey(startOfWeek(new Date(), { weekStartsOn })) === week;

  return (
    <div className="page page--wide">
      <PageHeader
        title="Weekly review"
        subtitle={d ? `${formatKey(d.range.from, 'MMM d')} – ${formatKey(d.range.to, 'MMM d, yyyy')}${isCurrent ? ' · in progress' : ''}` : 'Reflect on what happened, notice patterns, set next week up.'}
        actions={
          <div className="row" style={{ gap: 4 }}>
            <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setWeekStart((w) => addWeeks(w, -1))} />
            <span className="weight-medium" style={{ minWidth: 110, textAlign: 'center' }}>Week of {format(weekStart, 'MMM d')}</span>
            <IconButton icon={ChevronRight} label="Next week" disabled={isCurrent} onClick={() => setWeekStart((w) => addWeeks(w, 1))} />
          </div>
        }
      />

      {review.isError && !d ? <Card><ErrorState error={review.error} onRetry={() => review.refetch()} /></Card> : !d ? (
        <div className="review-grid">{Array.from({ length: 6 }, (_, i) => <Card key={i}><Skeleton height={90} /></Card>)}</div>
      ) : (
        <div className="stack" style={{ gap: 16, opacity: review.isPlaceholderData ? 0.7 : 1 }}>
          <Card
            title="AI reflection"
            icon={Sparkles}
            subtitle={d.ai.configured ? (d.ai.enabled ? 'Wins, problems, patterns and priorities — grounded in the numbers below' : 'AI is turned off in settings') : 'Configure an AI provider to generate the narrative'}
            actions={d.ai.enabled && <Button size="sm" variant="ghost" icon={RefreshCw} loading={refresh.isPending} onClick={() => refresh.mutate({ kind: 'review', week }, { onError: (err) => toast.apiError(err, "Couldn't regenerate") })}>Regenerate</Button>}
          >
            {d.narrative ? <Markdown>{d.narrative}</Markdown> : d.narrativeWithheld ? (
              <EmptyState compact icon={ClipboardCheck} title="Narrative withheld" description={AI_WITHHELD_REASON[d.narrativeWithheld] ?? AI_WITHHELD_REASON.error} />
            ) : (
              <EmptyState compact icon={ClipboardCheck} title={d.ai.configured ? 'No narrative yet' : 'Numbers only'} description={d.ai.configured ? 'Regenerate to write the review from this week’s data.' : 'The metrics below are computed from your data; the AI narrative needs a provider key on the server.'} />
            )}
          </Card>

          <div className="review-grid">
            <Card className="review-block">
              <p className="review-block__title"><CheckSquare aria-hidden="true" /> Tasks</p>
              <div className="review-kv"><span>Completed</span><strong>{m.tasks.completed}<Delta current={m.tasks.completed} previous={m.previous.tasks.completed} /></strong></div>
              <div className="review-kv"><span>Created</span><strong>{m.tasks.created}</strong></div>
              <div className="review-kv"><span>Missed (still open)</span><strong>{m.tasks.missed}</strong></div>
              <div className="review-kv"><span>On-time rate</span><strong>{m.tasks.completionRate === null ? '—' : `${m.tasks.completionRate}%`}</strong></div>
            </Card>
            <Card className="review-block">
              <p className="review-block__title"><Target aria-hidden="true" /> Goals</p>
              {m.goals.length ? m.goals.slice(0, 5).map((g) => (
                <div key={g.title} className="stack stack--sm" style={{ gap: 3, padding: '4px 0' }}>
                  <div className="row row--between text-sm"><span className="truncate">{g.title}</span><strong className="tabular">{g.progress}%</strong></div>
                  <ProgressBar value={g.progress} size="sm" label={`${g.title} progress`} />
                </div>
              )) : <p className="text-sm muted">No active goals.</p>}
            </Card>
            <Card className="review-block">
              <p className="review-block__title"><Flame aria-hidden="true" /> Habits & routines</p>
              <div className="review-kv"><span>Habit consistency</span><strong>{m.habits.consistency === null ? '—' : `${m.habits.consistency}%`}<Delta current={m.habits.consistency} previous={m.previous.habits.consistency} suffix="%" /></strong></div>
              <div className="review-kv"><span>Check-ins</span><strong>{m.habits.done} / {m.habits.scheduled}</strong></div>
              <div className="review-kv"><span>Routine steps</span><strong>{m.routines.consistency === null ? '—' : `${m.routines.consistency}%`}<Delta current={m.routines.consistency} previous={m.previous.routines.consistency} suffix="%" /></strong></div>
              {m.habits.perHabit.slice(0, 3).map((h) => <div key={h.name} className="review-kv text-xs"><span className="muted">{h.name}</span><span className="muted">{h.rate === null ? '—' : `${h.rate}%`}</span></div>)}
            </Card>
            <Card className="review-block">
              <p className="review-block__title"><Activity aria-hidden="true" /> Health</p>
              <div className="review-kv"><span>Avg sleep</span><strong>{m.health.avgSleep ?? '—'}h<Delta current={m.health.avgSleep} previous={m.previous.health.avgSleep} suffix="h" /></strong></div>
              <div className="review-kv"><span>Avg mood / energy</span><strong>{m.health.avgMood ?? '—'} / {m.health.avgEnergy ?? '—'}</strong></div>
              <div className="review-kv"><span>Workouts</span><strong>{m.health.workouts} · {formatDuration(m.health.workoutMinutes)}</strong></div>
              <div className="review-kv"><span>Days logged</span><strong>{m.health.daysLogged}</strong></div>
            </Card>
            <Card className="review-block">
              <p className="review-block__title"><Timer aria-hidden="true" /> Focus</p>
              <div className="review-kv"><span>Focused time</span><strong>{formatDuration(m.focus.minutes)}<Delta current={m.focus.minutes} previous={m.previous.focus.minutes} suffix="m" /></strong></div>
              <div className="review-kv"><span>Sessions</span><strong>{m.focus.sessions}</strong></div>
              <div className="review-kv"><span>Days with focus</span><strong>{m.focus.daysWithFocus} / 7</strong></div>
            </Card>
            <Card className="review-block">
              <p className="review-block__title"><PiggyBank aria-hidden="true" /> Finance</p>
              <div className="review-kv"><span>Income</span><strong>{formatCurrency(m.finance.income, currency)}</strong></div>
              <div className="review-kv"><span>Expenses</span><strong>{formatCurrency(m.finance.expense, currency)}<Delta current={m.finance.expense} previous={m.previous.finance.expense} upIsGood={false} /></strong></div>
              <div className="review-kv"><span>Net</span><strong className={m.finance.net < 0 ? 'text-danger' : ''}>{formatCurrency(m.finance.net, currency, { signed: true })}</strong></div>
              {m.finance.topCategories.slice(0, 3).map((c) => <div key={c.category} className="review-kv text-xs"><span className="muted">{c.category}</span><span className="muted">{formatCurrency(c.total, currency)}</span></div>)}
            </Card>
            <Card className="review-block">
              <p className="review-block__title"><BookHeart aria-hidden="true" /> Journal</p>
              <div className="review-kv"><span>Entries</span><strong>{m.journal.entries}</strong></div>
              {m.journal.wins.length > 0 && <p className="text-xs" style={{ marginTop: 6 }}><strong>Wins:</strong> {m.journal.wins.slice(0, 4).join(' · ')}</p>}
              {m.journal.challenges.length > 0 && <p className="text-xs" style={{ marginTop: 4 }}><strong>Challenges:</strong> {m.journal.challenges.slice(0, 3).join(' · ')}</p>}
              {!m.journal.entries && <p className="text-sm muted">No entries this week.</p>}
            </Card>
          </div>

          <Card title="Activity" subtitle="What happened this week" flush>
            {d.activity.length ? (
              <div className="list">{d.activity.slice(0, 20).map((a) => (
                <div key={a._id} className="list-row" style={{ minHeight: 34 }}>
                  <span className="text-xs muted tabular" style={{ width: 52 }}>{formatKey(a.date, 'EEE d')}</span>
                  <span className="text-xs muted" style={{ width: 130 }}>{a.type.replace(/_/g, ' ')}</span>
                  <span className="grow text-sm truncate">{a.title}</span>
                </div>
              ))}</div>
            ) : <EmptyState compact icon={ClipboardCheck} title="No activity recorded this week" />}
          </Card>
        </div>
      )}
    </div>
  );
}
