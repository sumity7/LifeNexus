import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Pause, Play } from 'lucide-react';
import { useActiveFocus } from '../../api/hooks';

/** Live remaining time for an active focus session; derived from server timestamps so it survives reloads. */
export function useFocusClock(session) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!session || session.status !== 'running') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);
  if (!session) return null;
  const base = session.focusedSeconds ?? 0;
  const extra = session.status === 'running' && session.lastResumedAt ? Math.max(0, (now - new Date(session.lastResumedAt).getTime()) / 1000) : 0;
  const elapsed = Math.round(base + extra);
  const total = session.plannedMinutes * 60;
  return { elapsed, total, remaining: Math.max(0, total - elapsed), pct: Math.min(100, (elapsed / total) * 100), overtime: elapsed > total };
}

export const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Topbar indicator shown whenever a session is running or paused. */
export function FocusPill() {
  const active = useActiveFocus();
  const clock = useFocusClock(active.data);
  const navigate = useNavigate();
  if (!active.data || !clock) return null;
  const paused = active.data.status === 'paused';
  return (
    <button type="button" className={clsx('focus-pill', paused && 'is-paused')} onClick={() => navigate('/focus')} title="Open focus session">
      <span className="focus-pill__dot" aria-hidden="true" />
      {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" style={{ display: 'none' }} />}
      <span className="desktop-only">{clock.overtime ? `+${mmss(clock.elapsed - clock.total)}` : mmss(clock.remaining)}</span>
      <span className="mobile-only">{mmss(clock.remaining)}</span>
    </button>
  );
}
