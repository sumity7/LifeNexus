import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUser, useTestApp } from './helpers.js';

const ctx = useTestApp('core');
const TODAY = '2026-09-15';

describe('tasks', () => {
  it('supports CRUD with validation and authorization', async () => {
    const alice = await createUser(ctx.app);
    const bob = await createUser(ctx.app);

    const invalid = await alice.post('/api/tasks').send({ title: '', priority: 'extreme', dueDate: '2026-13-01' });
    assert.equal(invalid.status, 400);

    const created = await alice.post('/api/tasks').send({
      title: 'Write report', priority: 'high', dueDate: TODAY, tags: ['Work', 'work'],
      subtasks: [{ title: 'Outline' }, { title: 'Draft' }], user: bob.user._id,
    });
    assert.equal(created.status, 201);
    const task = created.body.data;
    assert.deepEqual(task.tags, ['work']);
    assert.equal(task.subtasks.length, 2);
    assert.equal(task.user, alice.user._id, 'user field cannot be mass-assigned');

    const updated = await alice.patch(`/api/tasks/${task._id}`).send({ title: 'Write Q3 report', subtasks: [{ ...task.subtasks[0], done: true }] });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.title, 'Write Q3 report');
    assert.equal(updated.body.data.subtasks.length, 1);
    assert.equal(updated.body.data.subtasks[0]._id, task.subtasks[0]._id);

    assert.equal((await bob.get(`/api/tasks/${task._id}`)).status, 404);
    assert.equal((await bob.patch(`/api/tasks/${task._id}`).send({ title: 'hijack' })).status, 404);
    assert.equal((await bob.del(`/api/tasks/${task._id}`)).status, 404);
    assert.equal((await bob.get('/api/tasks')).body.data.length, 0);
    assert.equal((await alice.get('/api/tasks/not-an-id')).status, 400);

    assert.equal((await alice.del(`/api/tasks/${task._id}`)).status, 204);
    assert.equal((await alice.get(`/api/tasks/${task._id}`)).status, 404);
  });

  it('filters by view, priority and search', async () => {
    const u = await createUser(ctx.app);
    await u.post('/api/tasks').send({ title: 'Overdue thing', dueDate: '2026-09-10', priority: 'low' });
    await u.post('/api/tasks').send({ title: 'Today thing', dueDate: TODAY, priority: 'urgent' });
    await u.post('/api/tasks').send({ title: 'Future thing', dueDate: '2026-09-20' });
    await u.post('/api/tasks').send({ title: 'Someday thing' });
    await u.post('/api/tasks').send({ title: 'Done thing', status: 'done', date: TODAY });

    const count = async (qs) => (await u.get(`/api/tasks?date=${TODAY}&${qs}`)).body.data.length;
    assert.equal(await count('view=today'), 2);
    assert.equal(await count('view=overdue'), 1);
    assert.equal(await count('view=upcoming'), 1);
    assert.equal(await count('view=nodate'), 1);
    assert.equal(await count('view=completed'), 1);
    assert.equal(await count('view=all'), 5);
    assert.equal(await count('priority=urgent'), 1);
    assert.equal(await count('q=future'), 1);
    assert.equal(await count('q=%28.*'), 0, 'regex input is escaped');

    const sorted = (await u.get(`/api/tasks?view=open&date=${TODAY}`)).body.data.map((t) => t.title);
    assert.deepEqual(sorted, ['Overdue thing', 'Today thing', 'Future thing', 'Someday thing']);
  });

  it('spawns the next occurrence of a recurring task exactly once', async () => {
    const u = await createUser(ctx.app);
    const { body } = await u.post('/api/tasks').send({ title: 'Weekly review', dueDate: '2026-09-13', recurrence: { freq: 'weekly' }, subtasks: [{ title: 'Inbox', done: true }] });
    const id = body.data._id;

    const done = await u.post(`/api/tasks/${id}/toggle`).send({ date: TODAY });
    assert.equal(done.status, 200);
    assert.equal(done.body.data.status, 'done');
    assert.equal(done.body.data.completedOn, TODAY);
    assert.equal(done.body.meta.next.dueDate, '2026-09-20');
    assert.equal(done.body.meta.next.subtasks[0].done, false);

    await u.post(`/api/tasks/${id}/toggle`).send({ date: TODAY }); // undo
    const again = await u.post(`/api/tasks/${id}/toggle`).send({ date: TODAY }); // redo
    assert.equal(again.body.meta.next, null);
    assert.equal((await u.get('/api/tasks?q=Weekly')).body.data.length, 2);
  });
});

describe('goals', () => {
  it('tracks progress from milestones and linked tasks', async () => {
    const u = await createUser(ctx.app);
    const other = await createUser(ctx.app);
    const created = await u.post('/api/goals').send({ title: 'Ship v1', deadline: '2026-12-01', milestones: [{ title: 'Design' }, { title: 'Build' }] });
    assert.equal(created.status, 201);
    const goal = created.body.data;
    assert.equal(goal.progress, 0);

    const [design, build] = goal.milestones;
    const task = await u.post('/api/tasks').send({ title: 'Build API', goal: goal._id, milestone: build._id });
    assert.equal(task.status, 201);
    assert.equal(task.body.data.goal.title, 'Ship v1');

    const foreign = await other.post('/api/tasks').send({ title: 'Sneaky', goal: goal._id });
    assert.equal(foreign.status, 400, "can't link to another user's goal");

    const ms = await u.patch(`/api/goals/${goal._id}/milestones/${design._id}`).send({ done: true });
    assert.equal(ms.status, 200);
    assert.equal(ms.body.data.progress, 33); // 1 of (2 milestones + 1 task)

    await u.post(`/api/tasks/${task.body.data._id}/toggle`).send({ date: TODAY });
    const detail = await u.get(`/api/goals/${goal._id}`);
    assert.equal(detail.body.data.progress, 67);
    assert.equal(detail.body.data.tasks.length, 1);

    const added = await u.post(`/api/goals/${goal._id}/milestones`).send({ title: 'Launch' });
    assert.equal(added.body.data.milestones.length, 3);

    const removed = await u.del(`/api/goals/${goal._id}/milestones/${build._id}`);
    assert.equal(removed.status, 200);
    const unlinkedMilestone = await u.get(`/api/tasks/${task.body.data._id}`);
    assert.equal(unlinkedMilestone.body.data.milestone, null);

    const completed = await u.patch(`/api/goals/${goal._id}`).send({ status: 'completed' });
    assert.equal(completed.body.data.progress, 100);
    assert.ok(completed.body.data.completedAt);

    assert.equal((await other.get(`/api/goals/${goal._id}`)).status, 404);
    assert.equal((await u.del(`/api/goals/${goal._id}`)).status, 204);
    const orphan = await u.get(`/api/tasks/${task.body.data._id}`);
    assert.equal(orphan.body.data.goal, null);
  });
});

describe('habits', () => {
  it('creates habits, toggles check-ins and computes streaks', async () => {
    const u = await createUser(ctx.app);
    const created = await u.post('/api/habits').send({ name: 'Meditate', icon: '🧘', color: 'violet', days: [3, 1, 1] });
    assert.equal(created.status, 201);
    const habit = created.body.data;
    assert.deepEqual(habit.days, [1, 3]);
    assert.equal(habit.stats.currentStreak, 0);

    const toggled = await u.post(`/api/habits/${habit._id}/toggle`).send({ date: '2026-01-05', today: '2026-01-05' });
    assert.equal(toggled.status, 200);
    assert.equal(toggled.body.meta.done, true);
    assert.equal(toggled.body.data.stats.doneToday, true);

    const untoggled = await u.post(`/api/habits/${habit._id}/toggle`).send({ date: '2026-01-05', today: '2026-01-05' });
    assert.equal(untoggled.body.meta.done, false);

    const future = await u.post(`/api/habits/${habit._id}/toggle`).send({ date: '2999-01-01' });
    assert.equal(future.status, 400);

    const list = await u.get(`/api/habits?date=${TODAY}`);
    assert.equal(list.body.data.length, 1);

    const archived = await u.patch(`/api/habits/${habit._id}`).send({ archived: true });
    assert.equal(archived.body.data.archived, true);
    assert.equal((await u.get('/api/habits')).body.data.length, 0);
    assert.equal((await u.get('/api/habits?archived=true')).body.data.length, 1);

    assert.equal((await u.del(`/api/habits/${habit._id}`)).status, 204);
    assert.equal(await ctx.mongoose.model('HabitLog').countDocuments({ habit: habit._id }), 0);
  });
});
