import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUser, useTestApp } from './helpers.js';

// Must be set before useTestApp's before() dynamically imports app.js — env is read once at import time.
process.env.AI_RATE_LIMIT_PER_MIN = '2';

const ctx = useTestApp('ai-ratelimit');

describe('AI rate limiting', () => {
  it('limits AI requests per user per minute and returns AI_RATE_LIMITED, without affecting other users', async () => {
    const u = await createUser(ctx.app);
    const other = await createUser(ctx.app);

    const r1 = await u.post('/api/ai/chat').send({ message: 'one' });
    const r2 = await u.post('/api/ai/chat').send({ message: 'two' });
    const r3 = await u.post('/api/ai/chat').send({ message: 'three' });

    assert.notEqual(r1.status, 429);
    assert.notEqual(r2.status, 429);
    assert.equal(r3.status, 429, 'the third request within the window is rate limited');
    assert.equal(r3.body.error.code, 'AI_RATE_LIMITED');
    assert.doesNotMatch(r3.body.error.message, /rate.?limit.{0,20}(exceeded|window)/i, 'never leaks internal rate-limit mechanics, just a friendly message');

    const otherRes = await other.post('/api/ai/chat').send({ message: 'hi' });
    assert.notEqual(otherRes.status, 429, "one user's usage never limits another user");
  });
});
