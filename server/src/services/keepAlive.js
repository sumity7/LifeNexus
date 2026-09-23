import { env } from '../config/env.js';

const INTERVAL_MS = 11 * 60_000;
const PING_TIMEOUT_MS = 20_000;

/**
 * Render's free tier spins a web service down after ~15 minutes without external HTTP traffic.
 * A self-ping over loopback (e.g. fetching http://localhost:PORT) does NOT count — Render's
 * sleep detection only sees traffic that actually crosses its public routing/proxy — so this
 * pings the service's own public URL instead, which Render auto-injects as RENDER_EXTERNAL_URL
 * on every deploy. Comfortably under the 15-minute threshold, with margin either side.
 *
 * A no-op anywhere RENDER_EXTERNAL_URL isn't set (local dev, non-Render hosts) or in tests, so
 * it never fires outside an actual Render deployment. Options are injectable so tests can
 * exercise the real scheduling/error-handling logic without real timers, network calls, or
 * fighting the env/isTest guard.
 */
export function startKeepAlive({
  url = env.RENDER_EXTERNAL_URL,
  enabled = !env.isTest,
  intervalMs = INTERVAL_MS,
  fetchImpl = fetch,
  log = console.log,
  warn = console.warn,
} = {}) {
  if (!url || !enabled) return null;

  const target = `${url.replace(/\/+$/, '')}/api/health`;
  const ping = async () => {
    try {
      const res = await fetchImpl(target, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
      if (!res.ok) warn(`[keep-alive] ping returned ${res.status}`);
    } catch (err) {
      warn('[keep-alive] ping failed:', err.message);
    }
  };

  const timer = setInterval(ping, intervalMs);
  timer.unref?.(); // this timer alone must never be the reason the process stays alive
  log(`[keep-alive] pinging ${target} every ${intervalMs / 60_000} min to prevent free-tier sleep`);
  return timer;
}
