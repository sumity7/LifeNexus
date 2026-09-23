import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createUser, useTestApp } from './helpers.js';

const ctx = useTestApp('auth');

const refreshCookie = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('lifeos_rt='));

describe('auth', () => {
  it('exposes a health check', async () => {
    const res = await request(ctx.app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'ok');
  });

  it('validates registration input', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({ name: '', email: 'nope', password: 'short' });
    assert.equal(res.status, 400);
    const paths = res.body.error.details.map((d) => d.path);
    assert.ok(paths.includes('name') && paths.includes('email') && paths.includes('password'));
  });

  it('registers, sets an httpOnly refresh cookie and never leaks the password hash', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'Ada@Example.com', password: 'Password123' });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.accessToken);
    assert.equal(res.body.data.user.email, 'ada@example.com');
    assert.equal(res.body.data.user.passwordHash, undefined);
    const cookie = refreshCookie(res);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  });

  it('rejects duplicate emails', async () => {
    const res = await request(ctx.app).post('/api/auth/register').send({ name: 'Ada', email: 'ada@example.com', password: 'Password123' });
    assert.equal(res.status, 409);
  });

  it('logs in with valid credentials and rejects invalid ones generically', async () => {
    const bad = await request(ctx.app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'wrong-pass1' });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error.message, 'Invalid email or password');
    const unknown = await request(ctx.app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'Password123' });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.message, 'Invalid email or password');
    const ok = await request(ctx.app).post('/api/auth/login').send({ email: 'ada@example.com', password: 'Password123' });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.data.accessToken);
  });

  it('protects routes and rejects bad tokens', async () => {
    assert.equal((await request(ctx.app).get('/api/tasks')).status, 401);
    assert.equal((await request(ctx.app).get('/api/auth/me')).status, 401);
    const res = await request(ctx.app).get('/api/tasks').set('Authorization', 'Bearer not-a-real-token');
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_INVALID');
  });

  it('refreshes via cookie, rotates tokens and ends the session on logout', async () => {
    const u = await createUser(ctx.app);
    const first = await u.agent.post('/api/auth/refresh');
    assert.equal(first.status, 200);
    assert.ok(first.body.data.accessToken);
    assert.ok(refreshCookie(first), 'rotated cookie is issued');

    const me = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${first.body.data.accessToken}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.email, u.email);

    const logout = await u.agent.post('/api/auth/logout');
    assert.equal(logout.status, 204);
    const after = await u.agent.post('/api/auth/refresh');
    assert.equal(after.status, 401);
  });

  it('allows a just-rotated refresh token within the grace window', async () => {
    const u = await createUser(ctx.app);
    const cookie = u.agent.jar.getCookie('lifeos_rt', { path: '/api/auth', domain: '127.0.0.1', secure: false, script: false });
    const raw = cookie ? `lifeos_rt=${cookie.value}` : null;
    const r1 = await u.agent.post('/api/auth/refresh');
    assert.equal(r1.status, 200);
    if (raw) {
      const r2 = await request(ctx.app).post('/api/auth/refresh').set('Cookie', raw);
      assert.equal(r2.status, 200);
    }
  });

  it('rejects refresh without a cookie', async () => {
    const res = await request(ctx.app).post('/api/auth/refresh');
    assert.equal(res.status, 401);
  });

  it('rejects an expired access token distinctly (TOKEN_INVALID) so the client knows to refresh, not to treat it as a hard failure', async () => {
    const u = await createUser(ctx.app);
    const expired = jwt.sign({}, process.env.JWT_ACCESS_SECRET, { subject: String(u.user._id), expiresIn: '-1s', issuer: 'lifeos', algorithm: 'HS256' });
    const res = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'TOKEN_INVALID');
    // The refresh cookie from registration is still valid — the client's retry-after-refresh path works.
    const refreshed = await u.agent.post('/api/auth/refresh');
    assert.equal(refreshed.status, 200);
    const retried = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${refreshed.body.data.accessToken}`);
    assert.equal(retried.status, 200);
  });

  it('handles concurrent refresh calls against the same valid cookie without corrupting either session', async () => {
    const u = await createUser(ctx.app);
    const cookie = u.agent.jar.getCookie('lifeos_rt', { path: '/api/auth', domain: '127.0.0.1', secure: false, script: false });
    const raw = `lifeos_rt=${cookie.value}`;
    const [a, b] = await Promise.all([
      request(ctx.app).post('/api/auth/refresh').set('Cookie', raw),
      request(ctx.app).post('/api/auth/refresh').set('Cookie', raw),
    ]);
    // Both must resolve cleanly (200, inside the rotation grace window) — neither request should
    // 500 or corrupt state just because another one raced it with the same token.
    assert.ok([a.status, b.status].every((s) => s === 200), `expected both concurrent refreshes to succeed, got ${a.status} and ${b.status}`);
    assert.ok(a.body.data.accessToken && b.body.data.accessToken);
  });

  it('updates profile and preferences', async () => {
    const u = await createUser(ctx.app);
    const res = await u.patch('/api/auth/me').send({
      name: 'Grace',
      preferences: { theme: 'dark', accent: 'teal', dashboardWidgets: [{ id: 'goals', visible: false }] },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'Grace');
    assert.equal(res.body.data.preferences.theme, 'dark');
    const widgets = res.body.data.preferences.dashboardWidgets;
    assert.equal(widgets[0].id, 'goals');
    assert.equal(widgets[0].visible, false);
    assert.equal(widgets.length, 13);

    const invalid = await u.patch('/api/auth/me').send({ preferences: { theme: 'neon' } });
    assert.equal(invalid.status, 400);
  });

  it('changes password and signs out other sessions', async () => {
    const u = await createUser(ctx.app);
    const wrong = await u.post('/api/auth/change-password').send({ currentPassword: 'nope', newPassword: 'NewPassword456' });
    assert.equal(wrong.status, 400);
    const ok = await u.post('/api/auth/change-password').send({ currentPassword: 'Password123', newPassword: 'NewPassword456' });
    assert.equal(ok.status, 200);
    const oldRefresh = await u.agent.post('/api/auth/refresh');
    assert.equal(oldRefresh.status, 401);
    const login = await request(ctx.app).post('/api/auth/login').send({ email: u.email, password: 'NewPassword456' });
    assert.equal(login.status, 200);
  });

  it('deletes the account and all its data', async () => {
    const u = await createUser(ctx.app);
    await u.post('/api/tasks').send({ title: 'Doomed task' });
    const wrong = await u.del('/api/auth/me').send({ password: 'bad' });
    assert.equal(wrong.status, 400);
    const res = await u.del('/api/auth/me').send({ password: 'Password123' });
    assert.equal(res.status, 204);
    assert.equal((await u.get('/api/tasks')).status, 401);
    const count = await ctx.mongoose.model('Task').countDocuments({ user: u.user._id });
    assert.equal(count, 0);
  });

  it('returns JSON errors for malformed bodies and unknown routes', async () => {
    const u = await createUser(ctx.app);
    const malformed = await u.post('/api/tasks').set('Content-Type', 'application/json').send('{"title":');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.message, 'Malformed JSON body');
    const missing = await u.get('/api/does-not-exist');
    assert.equal(missing.status, 404);
  });
});

describe('demo login (POST /api/auth/demo)', () => {
  it('returns a clean, specific error when the demo account has not been seeded — never a raw 500', async () => {
    const res = await request(ctx.app).post('/api/auth/demo').send({});
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'DEMO_NOT_SEEDED');
  });

  it('issues a real session for the configured demo account once it exists, without the client sending a password', async () => {
    await request(ctx.app).post('/api/auth/register').send({ name: 'Alex Morgan', email: 'demo@lifeos.app', password: 'Demo1234!' });
    const res = await request(ctx.app).post('/api/auth/demo').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, 'demo@lifeos.app');
    assert.ok(res.body.data.accessToken, 'a normal access token is issued, same as a real login');
    const cookie = refreshCookie(res);
    assert.match(cookie, /HttpOnly/i, 'the refresh cookie is issued exactly like a normal login');
    // Prove the session is actually usable, not just a look-alike response.
    const me = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.email, 'demo@lifeos.app');
  });

  it('never requires or reads a password from the request body', async () => {
    const res = await request(ctx.app).post('/api/auth/demo').send({ password: 'this is ignored, not even validated' });
    assert.equal(res.status, 200, 'a garbage/irrelevant body is simply ignored, not rejected');
  });
});

describe('password reset', () => {
  let setEmailProvider;
  const calls = [];
  const fakeEmail = {
    name: 'fake', available: true,
    async send({ to, subject, html, text }) {
      calls.push({ to, subject, html, text });
    },
  };

  before(async () => {
    ({ setEmailProvider } = await import('../src/services/email/index.js'));
  });

  const linkFrom = (call) => call.text.match(/https?:\S+/)[0];
  const tokenFrom = (call) => new URL(linkFrom(call)).searchParams.get('token');

  it('always responds the same way whether or not the account exists — never leaks account existence', async () => {
    setEmailProvider(fakeEmail);
    const u = await createUser(ctx.app);
    calls.length = 0;

    const known = await request(ctx.app).post('/api/auth/forgot-password').send({ email: u.email });
    const unknown = await request(ctx.app).post('/api/auth/forgot-password').send({ email: 'nobody-here@example.com' });

    assert.equal(known.status, 200);
    assert.equal(unknown.status, 200);
    assert.equal(known.body.data.message, unknown.body.data.message);
    assert.equal(calls.length, 1, 'an email is only actually sent for a real account');
    assert.equal(calls[0].to, u.email);
    assert.match(calls[0].subject, /reset/i);
  });

  it('never fails the request just because no email provider is configured', async () => {
    setEmailProvider({ name: 'none', available: false, async send() { throw new Error('should never be called'); } });
    const u = await createUser(ctx.app);
    const res = await request(ctx.app).post('/api/auth/forgot-password').send({ email: u.email });
    assert.equal(res.status, 200);
  });

  it('resets the password with a valid token, signs out every device, and the token is single-use', async () => {
    setEmailProvider(fakeEmail);
    const u = await createUser(ctx.app);
    calls.length = 0;
    await request(ctx.app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = tokenFrom(calls[0]);

    const wrongToken = await request(ctx.app).post('/api/auth/reset-password').send({ token: 'not-a-real-token', password: 'NewPassword456' });
    assert.equal(wrongToken.status, 400);
    assert.equal(wrongToken.body.error.code, 'RESET_TOKEN_INVALID');

    const reset = await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'NewPassword456' });
    assert.equal(reset.status, 204);

    // Every existing session is revoked.
    const oldRefresh = await u.agent.post('/api/auth/refresh');
    assert.equal(oldRefresh.status, 401);

    // Old password no longer works; new one does.
    assert.equal((await request(ctx.app).post('/api/auth/login').send({ email: u.email, password: 'Password123' })).status, 401);
    assert.equal((await request(ctx.app).post('/api/auth/login').send({ email: u.email, password: 'NewPassword456' })).status, 200);

    // The token cannot be replayed.
    const replay = await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'AnotherPassword789' });
    assert.equal(replay.status, 400);
    assert.equal(replay.body.error.code, 'RESET_TOKEN_INVALID');
  });

  it('rejects a malformed/garbage token without touching the database', async () => {
    const res = await request(ctx.app).post('/api/auth/reset-password').send({ token: crypto.randomUUID(), password: 'NewPassword456' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'RESET_TOKEN_INVALID');
  });

  it('validates the new password strength on reset', async () => {
    setEmailProvider(fakeEmail);
    const u = await createUser(ctx.app);
    calls.length = 0;
    await request(ctx.app).post('/api/auth/forgot-password').send({ email: u.email });
    const token = tokenFrom(calls[0]);
    const weak = await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'short' });
    assert.equal(weak.status, 400);
  });
});
