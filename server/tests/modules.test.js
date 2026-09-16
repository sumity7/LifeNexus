import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createUser, useTestApp } from './helpers.js';

const ctx = useTestApp('modules');
const TODAY = '2026-09-15';

describe('calendar events', () => {
  it('creates events, validates chronology and filters by range including recurring series', async () => {
    const u = await createUser(ctx.app);
    const bad = await u.post('/api/events').send({ title: 'Backwards', start: '2026-09-15T10:00:00Z', end: '2026-09-15T09:00:00Z' });
    assert.equal(bad.status, 400);

    const oneOff = await u.post('/api/events').send({ title: 'Dentist', start: '2026-09-16T14:00:00Z', end: '2026-09-16T15:00:00Z', color: 'red' });
    assert.equal(oneOff.status, 201);
    await u.post('/api/events').send({ title: 'Standup', start: '2026-01-05T09:00:00Z', end: '2026-01-05T09:15:00Z', recurrence: { freq: 'weekly' } });
    await u.post('/api/events').send({ title: 'Old', start: '2025-01-05T09:00:00Z', end: '2025-01-05T09:15:00Z' });

    const range = await u.get('/api/events?from=2026-09-14T00:00:00Z&to=2026-09-21T00:00:00Z');
    assert.equal(range.status, 200);
    assert.deepEqual(range.body.data.map((e) => e.title).sort(), ['Dentist', 'Standup']);

    const updated = await u.patch(`/api/events/${oneOff.body.data._id}`).send({ end: '2026-09-16T13:00:00Z' });
    assert.equal(updated.status, 400);
    assert.equal((await u.del(`/api/events/${oneOff.body.data._id}`)).status, 204);
    assert.equal((await u.get('/api/events')).status, 400, 'range is required');
  });
});

describe('notes', () => {
  it('sanitizes content, manages folders and searches text', async () => {
    const u = await createUser(ctx.app);
    const folder = await u.post('/api/notes/folders').send({ name: 'Work', color: 'indigo' });
    assert.equal(folder.status, 201);
    const dup = await u.post('/api/notes/folders').send({ name: 'Work' });
    assert.equal(dup.status, 409);

    const note = await u.post('/api/notes').send({
      title: 'Meeting', folder: folder.body.data._id, tags: ['Planning'],
      content: '<p>Discuss <strong>roadmap</strong></p><img src=x onerror=alert(1)><script>steal()</script>',
    });
    assert.equal(note.status, 201);
    assert.ok(!note.body.data.content.includes('script'));
    assert.ok(!note.body.data.content.includes('onerror'));
    assert.equal(note.body.data.plainText, 'Discuss roadmap');

    const list = await u.get('/api/notes?q=roadmap');
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].excerpt, 'Discuss roadmap');
    assert.equal(list.body.data[0].content, undefined, 'list omits full content');

    const pinned = await u.patch(`/api/notes/${note.body.data._id}`).send({ pinned: true });
    assert.equal(pinned.body.data.pinned, true);

    const folders = await u.get('/api/notes/folders');
    assert.equal(folders.body.data[0].noteCount, 1);
    assert.equal(folders.body.meta.pinned, 1);
    assert.deepEqual((await u.get('/api/notes/tags')).body.data, [{ tag: 'planning', count: 1 }]);

    const other = await createUser(ctx.app);
    const foreignFolder = await other.post('/api/notes').send({ title: 'x', folder: folder.body.data._id });
    assert.equal(foreignFolder.status, 400);

    assert.equal((await u.del(`/api/notes/folders/${folder.body.data._id}`)).status, 204);
    const orphan = await u.get(`/api/notes/${note.body.data._id}`);
    assert.equal(orphan.body.data.folder, null);
  });
});

describe('finance', () => {
  it('records transactions and summarizes budgets', async () => {
    const u = await createUser(ctx.app);
    const bad = await u.post('/api/finance/transactions').send({ type: 'expense', amount: -5, category: 'Food', date: TODAY });
    assert.equal(bad.status, 400);

    await u.post('/api/finance/transactions').send({ type: 'income', amount: 5000, category: 'Salary', date: '2026-09-01' });
    const groceries = await u.post('/api/finance/transactions').send({ type: 'expense', amount: 120.456, category: 'Groceries', description: 'Market', date: '2026-09-10' });
    assert.equal(groceries.body.data.amount, 120.46);
    await u.post('/api/finance/transactions').send({ type: 'expense', amount: 80, category: 'groceries', date: '2026-09-12' });
    await u.post('/api/finance/transactions').send({ type: 'expense', amount: 999, category: 'Travel', date: '2026-08-12' });

    const budget = await u.post('/api/finance/budgets').send({ category: 'Groceries', limit: 150 });
    assert.equal(budget.status, 201);
    assert.equal((await u.post('/api/finance/budgets').send({ category: 'Groceries', limit: 10 })).status, 409);

    const summary = await u.get('/api/finance/summary?month=2026-09');
    assert.equal(summary.status, 200);
    const s = summary.body.data;
    assert.equal(s.income, 5000);
    assert.equal(s.expense, 200.46);
    assert.equal(s.net, 4799.54);
    assert.equal(s.previous.expense, 999);
    assert.equal(s.trend.length, 6);
    assert.equal(s.budgets[0].spent, 200.46);
    assert.equal(s.budgets[0].pct, 134);

    const month = await u.get('/api/finance/transactions?month=2026-09&type=expense');
    assert.equal(month.body.data.length, 2);

    const edited = await u.patch(`/api/finance/transactions/${groceries.body.data._id}`).send({ amount: 20 });
    assert.equal(edited.body.data.amount, 20);
    assert.equal((await u.del(`/api/finance/budgets/${budget.body.data._id}`)).status, 204);
  });
});

describe('health', () => {
  it('upserts daily logs, tracks water and workouts', async () => {
    const u = await createUser(ctx.app);
    const empty = await u.get(`/api/health/logs/${TODAY}`);
    assert.equal(empty.body.data.waterMl, 0);

    const log = await u.put(`/api/health/logs/${TODAY}`).send({ sleepHours: 7.5, mood: 4 });
    assert.equal(log.status, 200);
    assert.equal(log.body.data.sleepHours, 7.5);
    const again = await u.put(`/api/health/logs/${TODAY}`).send({ energy: 3 });
    assert.equal(again.body.data.sleepHours, 7.5, 'partial update preserves fields');
    assert.equal((await u.put(`/api/health/logs/${TODAY}`).send({ mood: 9 })).status, 400);

    await u.post(`/api/health/logs/${TODAY}/water`).send({ deltaMl: 500 });
    const water = await u.post(`/api/health/logs/${TODAY}/water`).send({ deltaMl: 250 });
    assert.equal(water.body.data.waterMl, 750);
    const clamped = await u.post(`/api/health/logs/${TODAY}/water`).send({ deltaMl: -5000 });
    assert.equal(clamped.body.data.waterMl, 0);

    const fresh = await u.post('/api/health/logs/2026-09-14/water').send({ deltaMl: 250 });
    assert.equal(fresh.body.data.waterMl, 250);

    const workout = await u.post('/api/health/workouts').send({ date: TODAY, type: 'run', durationMin: 42, distanceKm: 7.2 });
    assert.equal(workout.status, 201);

    const summary = await u.get(`/api/health/summary?date=${TODAY}&days=7`);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.series.length, 7);
    assert.equal(summary.body.data.workouts.minutes, 42);
    assert.equal(summary.body.data.averages.sleepHours, 7.5);
  });
});

describe('routines', () => {
  it('manages ordered steps and daily check-offs', async () => {
    const u = await createUser(ctx.app);
    const created = await u.post('/api/routines').send({
      name: 'Morning', type: 'morning', timeOfDay: '06:30',
      steps: [{ title: 'Water', durationMin: 1 }, { title: 'Stretch', durationMin: 10 }, { title: 'Journal', durationMin: 5 }],
    });
    assert.equal(created.status, 201);
    const routine = created.body.data;
    assert.equal(routine.today.total, 3);

    const toggled = await u.post(`/api/routines/${routine._id}/steps/${routine.steps[1]._id}/toggle`).send({ date: TODAY });
    assert.equal(toggled.body.data.today.completed, 1);
    const list = await u.get(`/api/routines?date=${TODAY}`);
    assert.equal(list.body.data[0].today.pct, 33);

    const reordered = await u.patch(`/api/routines/${routine._id}`).send({ steps: [routine.steps[2], routine.steps[0], routine.steps[1]] });
    assert.equal(reordered.body.data.steps[0].title, 'Journal');
    assert.equal(reordered.body.data.steps[0]._id, routine.steps[2]._id);

    const all = await u.post(`/api/routines/${routine._id}/complete`).send({ date: TODAY });
    assert.equal(all.body.data.today.pct, 100);
    const reset = await u.post(`/api/routines/${routine._id}/reset`).send({ date: TODAY });
    assert.equal(reset.body.data.today.completed, 0);
    assert.equal((await u.post(`/api/routines/${routine._id}/steps/${routine._id}/toggle`).send({ date: TODAY })).status, 404);
  });
});

describe('reminders', () => {
  it('completes one-off reminders and rolls recurring ones forward', async () => {
    const u = await createUser(ctx.app);
    const once = await u.post('/api/reminders').send({ title: 'Submit taxes', date: '2026-09-20', category: 'deadline' });
    const yearly = await u.post('/api/reminders').send({ title: 'Birthday', date: '2026-09-10', category: 'birthday', recurrence: 'yearly' });
    const monthly = await u.post('/api/reminders').send({ title: 'Rent', date: '2026-06-01', recurrence: 'monthly' });

    const c1 = await u.post(`/api/reminders/${once.body.data._id}/complete`).send({ date: TODAY });
    assert.equal(c1.body.data.completed, true);
    assert.equal(c1.body.meta.advanced, false);

    const c2 = await u.post(`/api/reminders/${yearly.body.data._id}/complete`).send({ date: TODAY });
    assert.equal(c2.body.data.date, '2027-09-10');
    assert.equal(c2.body.data.completed, false);

    const c3 = await u.post(`/api/reminders/${monthly.body.data._id}/complete`).send({ date: TODAY });
    assert.equal(c3.body.data.date, '2026-10-01', 'overdue recurring reminders skip to the next future date');

    assert.equal((await u.get('/api/reminders')).body.data.length, 2);
    assert.equal((await u.get('/api/reminders?status=completed')).body.data.length, 1);

    const reopened = await u.patch(`/api/reminders/${once.body.data._id}`).send({ completed: false });
    assert.equal(reopened.body.data.completedAt, null);
  });
});

describe('dashboard, analytics and search', () => {
  it('aggregates across modules for the signed-in user only', async () => {
    const u = await createUser(ctx.app);
    const intruder = await createUser(ctx.app);
    await intruder.post('/api/tasks').send({ title: 'Intruder task alpha', dueDate: TODAY });

    await u.post('/api/tasks').send({ title: 'Alpha overdue', dueDate: '2026-09-01' });
    await u.post('/api/tasks').send({ title: 'Alpha today', dueDate: TODAY, priority: 'urgent' });
    await u.post('/api/tasks').send({ title: 'Alpha done', status: 'done', date: TODAY });
    await u.post('/api/habits').send({ name: 'Alpha habit' });
    await u.post('/api/goals').send({ title: 'Alpha goal' });
    await u.post('/api/notes').send({ title: 'Notes', content: '<p>the alpha plan</p>' });
    await u.post('/api/reminders').send({ title: 'Alpha reminder', date: '2026-09-18' });
    await u.post('/api/events').send({ title: 'Alpha event', start: '2026-09-15T10:00:00Z', end: '2026-09-15T11:00:00Z' });
    await u.post('/api/finance/transactions').send({ type: 'expense', amount: 12, category: 'Alpha snacks', date: TODAY });

    const dash = await u.get(`/api/dashboard?date=${TODAY}`);
    assert.equal(dash.status, 200);
    const d = dash.body.data;
    assert.equal(d.tasks.overdue.length, 1);
    assert.equal(d.tasks.today.length, 1);
    assert.equal(d.tasks.completedToday, 1);
    assert.equal(d.habits.length, 1);
    assert.equal(d.goals.length, 1);
    assert.equal(d.reminders[0].daysUntil, 3);
    assert.equal(d.finance.expense, 12);
    assert.equal(d.productivity.length, 7);

    const analytics = await u.get(`/api/analytics?date=${TODAY}&days=30`);
    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.data.daily.length, 30);
    assert.equal(analytics.body.data.tasks.completed, 1);
    assert.ok(Array.isArray(analytics.body.data.insights));

    const search = await u.get('/api/search?q=alpha');
    assert.equal(search.status, 200);
    const r = search.body.data.results;
    assert.equal(r.tasks.length, 3, "other users' data is never returned");
    assert.equal(r.notes.length, 1);
    assert.equal(r.habits.length, 1);
    assert.equal(r.goals.length, 1);
    assert.equal(r.reminders.length, 1);
    assert.equal(r.events.length, 1);
    assert.equal(r.transactions.length, 1);
    assert.equal((await u.get('/api/search?q=')).status, 400);
  });

  it('requires authentication for every module', async () => {
    const paths = ['/api/dashboard', '/api/analytics', '/api/search?q=x', '/api/tasks', '/api/habits', '/api/goals',
      '/api/events', '/api/notes', '/api/finance/summary', '/api/health/summary', '/api/routines', '/api/reminders'];
    for (const path of paths) {
      assert.equal((await request(ctx.app).get(path)).status, 401, path);
    }
  });
});
