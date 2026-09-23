import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { startKeepAlive } from '../src/services/keepAlive.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noop = () => {};

describe('startKeepAlive (Render free-tier self-ping)', () => {
  it('does nothing when no public URL is configured (e.g. local dev, non-Render hosts)', () => {
    const calls = [];
    const timer = startKeepAlive({ url: undefined, enabled: true, fetchImpl: async (...a) => { calls.push(a); }, log: noop, warn: noop });
    assert.equal(timer, null);
    assert.equal(calls.length, 0);
  });

  it('does nothing when disabled (the real default in test environments), even with a URL configured', () => {
    const calls = [];
    const timer = startKeepAlive({ url: 'https://example.onrender.com', enabled: false, fetchImpl: async (...a) => { calls.push(a); }, log: noop, warn: noop });
    assert.equal(timer, null);
    assert.equal(calls.length, 0);
  });

  it('pings its own /api/health on the configured interval, stripping a trailing slash from the URL', async () => {
    const calls = [];
    const timer = startKeepAlive({
      url: 'https://lifenexus-api.onrender.com/',
      enabled: true,
      intervalMs: 20,
      fetchImpl: async (url) => { calls.push(url); return { ok: true }; },
      log: noop,
      warn: noop,
    });
    await sleep(150); // generous margin over several theoretical ticks at 20ms, tolerant of scheduler jitter
    clearInterval(timer);
    assert.ok(calls.length >= 2, `expected at least 2 pings from a recurring interval, got ${calls.length}`);
    assert.ok(calls.every((u) => u === 'https://lifenexus-api.onrender.com/api/health'), 'no double slash, correct path');
  });

  it('a failed ping (network error) is caught and logged, and never stops future ticks', async () => {
    let calls = 0;
    const warnings = [];
    const timer = startKeepAlive({
      url: 'https://example.onrender.com',
      enabled: true,
      intervalMs: 20,
      fetchImpl: async () => { calls++; throw new Error('fetch failed: ECONNRESET'); },
      log: noop,
      warn: (...args) => warnings.push(args.join(' ')),
    });
    await sleep(150);
    clearInterval(timer);
    assert.ok(calls >= 2, 'later ticks still fire after an earlier ping failed');
    assert.ok(warnings.some((w) => w.includes('ping failed')), 'the failure is logged, not silently swallowed');
  });

  it('a non-2xx response is logged but does not throw or stop the interval', async () => {
    let calls = 0;
    const warnings = [];
    const timer = startKeepAlive({
      url: 'https://example.onrender.com',
      enabled: true,
      intervalMs: 20,
      fetchImpl: async () => { calls++; return { ok: false, status: 503 }; },
      log: noop,
      warn: (...args) => warnings.push(args.join(' ')),
    });
    await sleep(150);
    clearInterval(timer);
    assert.ok(calls >= 2);
    assert.ok(warnings.some((w) => w.includes('503')));
  });

  it('the returned timer can be cleared to stop all future pings (used on graceful shutdown)', async () => {
    let calls = 0;
    const timer = startKeepAlive({
      url: 'https://example.onrender.com',
      enabled: true,
      intervalMs: 20,
      fetchImpl: async () => { calls++; return { ok: true }; },
      log: noop,
      warn: noop,
    });
    await sleep(50);
    clearInterval(timer);
    const afterClear = calls;
    await sleep(150);
    assert.equal(calls, afterClear, 'no more pings happened after clearInterval');
  });
});
