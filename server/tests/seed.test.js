import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { useTestApp } from './helpers.js';

const ctx = useTestApp('seed');

describe('demo seed (seedDemo)', () => {
  let seedDemo, DEMO_USER, User, Document, Task, Reminder, Link;

  before(async () => {
    ({ seedDemo, DEMO_USER } = await import('../src/seed/seed.js'));
    ({ User } = await import('../src/models/User.js'));
    ({ Document } = await import('../src/models/Document.js'));
    ({ Task } = await import('../src/models/Task.js'));
    ({ Reminder } = await import('../src/models/Reminder.js'));
    ({ Link } = await import('../src/models/Link.js'));
  });

  it('creates the demo user and populates every module, including documents', async () => {
    const result = await seedDemo();
    assert.equal(result.user, DEMO_USER.email);
    assert.equal(result.counts.documents, 9);
    assert.ok(result.counts.tasks > 50, 'a realistic volume of tasks, not a token handful');
    assert.ok(result.counts.transactions > 50);

    const user = await User.findOne({ email: DEMO_USER.email });
    assert.ok(user, 'the demo user actually exists in the database');
    const docCount = await Document.countDocuments({ user: user._id });
    assert.equal(docCount, 9);
  });

  it('is safe to run repeatedly — no duplication, same counts, no leftover data from the previous run', async () => {
    const first = await seedDemo();
    const user = await User.findOne({ email: DEMO_USER.email });
    const second = await seedDemo();
    const userAfter = await User.findOne({ email: DEMO_USER.email });

    assert.deepEqual(second.counts, first.counts, 'identical, deterministic counts on every run');
    assert.equal(String(userAfter._id), String(user._id), 're-seeding updates the same user, never creates a second one');
    assert.equal(await Document.countDocuments({ user: user._id }), 9, 'old documents were replaced, not accumulated');
    assert.equal(await User.countDocuments({ email: DEMO_USER.email }), 1, 'exactly one demo account, never duplicated');
  });

  it('every seeded document has a real, downloadable file and correct category spread', async () => {
    await seedDemo();
    const user = await User.findOne({ email: DEMO_USER.email });
    const docs = await Document.find({ user: user._id }).select('+storageKey').lean();
    assert.equal(docs.length, 9);
    for (const doc of docs) {
      assert.ok(doc.storageKey, `${doc.title} has a real storage key, not a placeholder`);
      assert.equal(doc.mimeType, 'application/pdf');
      assert.ok(doc.size > 0);
      assert.ok(doc.tags.includes('demo'), `${doc.title} is clearly tagged as demo data`);
    }
    const categories = new Set(docs.map((d) => d.category));
    for (const expected of ['identity', 'work', 'education', 'insurance', 'finance', 'travel', 'bills']) {
      assert.ok(categories.has(expected), `expected a ${expected} document among the demo set`);
    }
  });

  it("the passport document's expiry generates a real, linked reminder — same mechanism a real upload uses", async () => {
    await seedDemo();
    const user = await User.findOne({ email: DEMO_USER.email });
    const passport = await Document.findOne({ user: user._id, title: 'Passport DEMO' });
    assert.ok(passport.expiryDate);
    assert.ok(passport.reminder, 'the document links to its auto-created reminder');
    const reminder = await Reminder.findById(passport.reminder);
    assert.ok(reminder, 'that reminder actually exists');
    assert.equal(reminder.date, passport.expiryDate);
    assert.equal(reminder.category, 'renewal');
  });

  it('links the demo life-graph together (e.g. the flight itinerary document to the Lisbon trip project)', async () => {
    await seedDemo();
    const user = await User.findOne({ email: DEMO_USER.email });
    const flight = await Document.findOne({ user: user._id, title: 'Flight Itinerary DEMO' });
    const links = await Link.find({ user: user._id, $or: [{ 'a.id': flight._id }, { 'b.id': flight._id }] });
    assert.ok(links.length >= 1, 'the flight itinerary document is connected to something in the life graph');
  });

  it('produces a demo account that can actually sign in through the real /api/auth/demo endpoint', async () => {
    await seedDemo();
    const res = await request(ctx.app).post('/api/auth/demo').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user.email, DEMO_USER.email);

    const docsRes = await request(ctx.app).get('/api/documents').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    assert.equal(docsRes.status, 200);
    assert.equal(docsRes.body.data.length, 9);

    const tasksRes = await request(ctx.app).get('/api/tasks').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    assert.equal(tasksRes.status, 200);
    assert.ok(tasksRes.body.data.length > 0);
  });

  it('never touches other, real users’ data', async () => {
    const other = await request(ctx.app).post('/api/auth/register').send({ name: 'Real User', email: 'real.user@example.com', password: 'Password123' });
    await request(ctx.app).post('/api/tasks').set('Authorization', `Bearer ${other.body.data.accessToken}`).send({ title: 'A real task that must survive re-seeding' });

    await seedDemo();
    await seedDemo();

    const stillThere = await request(ctx.app).get('/api/tasks').set('Authorization', `Bearer ${other.body.data.accessToken}`);
    assert.equal(stillThere.status, 200);
    assert.ok(stillThere.body.data.some((t) => t.title === 'A real task that must survive re-seeding'), "re-seeding the demo account must never touch another user's data");
  });
});
