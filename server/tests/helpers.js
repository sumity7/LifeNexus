import assert from 'node:assert/strict';
import { after, before } from 'node:test';
import request from 'supertest';

let counter = 0;

/**
 * Boots the app against an isolated database per test file.
 * Environment must be set before any app module is imported.
 */
export function useTestApp(name) {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = `mongodb://127.0.0.1:27017/lifeos_test_${name}`;
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-for-automated-tests-only-0123456789';
  // dotenv/config (loaded inside src/config/env.js) fills in any var not already present in
  // process.env from the real server/.env — including real provider credentials, if configured
  // there for local development. Tests must never depend on (or spend quota/send real email
  // through) a real external provider: default every one to unconfigured here, only overridden
  // if a test file explicitly sets these itself before calling useTestApp(). Tests that want
  // provider behavior inject a scripted one via setAIProvider()/setEmailProvider() instead.
  process.env.AI_PROVIDER ??= 'none';
  process.env.ANTHROPIC_API_KEY ??= '';
  process.env.GEMINI_API_KEY ??= '';
  process.env.EMAIL_PROVIDER ??= 'none';
  process.env.SMTP_HOST ??= '';
  process.env.SMTP_USER ??= '';
  process.env.SMTP_PASS ??= '';
  process.env.STORAGE_PROVIDER ??= 'local';
  process.env.S3_BUCKET ??= '';

  const ctx = {};

  before(async () => {
    const mongoose = (await import('mongoose')).default;
    const { connectDB } = await import('../src/config/db.js');
    const { createApp } = await import('../src/app.js');
    await connectDB(process.env.MONGODB_URI);
    await mongoose.connection.dropDatabase();
    await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
    ctx.app = createApp();
    ctx.mongoose = mongoose;
  });

  after(async () => {
    await ctx.mongoose.connection.dropDatabase();
    await ctx.mongoose.disconnect();
  });

  return ctx;
}

/** Registers a fresh user and returns helpers bound to their access token. */
export async function createUser(app, overrides = {}) {
  const agent = request.agent(app);
  const email = overrides.email ?? `user${Date.now()}${++counter}@example.com`;
  const res = await agent
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'Password123', ...overrides });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { accessToken, user } = res.body.data;

  const withAuth = (method) => (url) => request(app)[method](url).set('Authorization', `Bearer ${accessToken}`);
  return {
    agent,
    user,
    email,
    token: accessToken,
    get: withAuth('get'),
    post: withAuth('post'),
    patch: withAuth('patch'),
    put: withAuth('put'),
    del: withAuth('delete'),
  };
}
