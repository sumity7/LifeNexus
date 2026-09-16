import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createUser, useTestApp } from './helpers.js';

process.env.STORAGE_DIR = path.join(process.cwd(), 'uploads-test');
const ctx = useTestApp('platform');
const TODAY = '2026-09-15';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF');

describe('projects and links', () => {
  it('creates Goal → Project → Task and tracks progress', async () => {
    const u = await createUser(ctx.app);
    const goal = (await u.post('/api/goals').send({ title: 'Get internship' })).body.data;
    const project = await u.post('/api/projects').send({ title: 'Portfolio site', goal: goal._id, dueDate: '2026-10-01' });
    assert.equal(project.status, 201);
    assert.equal(project.body.data.progress, 0);

    const other = await createUser(ctx.app);
    assert.equal((await other.post('/api/projects').send({ title: 'x', goal: goal._id })).status, 400);

    const t1 = await u.post('/api/tasks').send({ title: 'Build hero', project: project.body.data._id, goal: goal._id });
    await u.post('/api/tasks').send({ title: 'Write case study', project: project.body.data._id });
    assert.equal(t1.body.data.project.title, 'Portfolio site');
    await u.post(`/api/tasks/${t1.body.data._id}/toggle`).send({ date: TODAY });

    const detail = await u.get(`/api/projects/${project.body.data._id}`);
    assert.equal(detail.body.data.progress, 50);
    assert.equal(detail.body.data.tasks.length, 2);

    const goalDetail = await u.get(`/api/goals/${goal._id}`);
    assert.equal(goalDetail.body.data.projects.length, 1);
    assert.equal((await other.get(`/api/projects/${project.body.data._id}`)).status, 404);

    const done = await u.patch(`/api/projects/${project.body.data._id}`).send({ status: 'completed' });
    assert.equal(done.body.data.progress, 100);
    assert.ok(done.body.data.completedAt);

    const activity = await u.get('/api/activity');
    const types = activity.body.data.map((a) => a.type);
    assert.ok(types.includes('project_completed') && types.includes('task_completed') && types.includes('goal_created'));
  });

  it('links entities across modules and resolves them', async () => {
    const u = await createUser(ctx.app);
    const note = (await u.post('/api/notes').send({ title: 'Interview prep', content: '<p>prep</p>' })).body.data;
    const goal = (await u.post('/api/goals').send({ title: 'Land the job' })).body.data;
    const link = await u.post('/api/links').send({ from: { type: 'note', id: note._id }, to: { type: 'goal', id: goal._id } });
    assert.equal(link.status, 201);
    const again = await u.post('/api/links').send({ from: { type: 'goal', id: goal._id }, to: { type: 'note', id: note._id } });
    assert.equal(again.status, 201, 'reverse direction resolves to the same edge');
    assert.equal(again.body.data._id, link.body.data._id);

    const fromGoal = await u.get(`/api/links?type=goal&id=${goal._id}`);
    assert.equal(fromGoal.body.data.length, 1);
    assert.equal(fromGoal.body.data[0].type, 'note');
    assert.equal(fromGoal.body.data[0].label, 'Interview prep');

    const other = await createUser(ctx.app);
    assert.equal((await other.post('/api/links').send({ from: { type: 'note', id: note._id }, to: { type: 'goal', id: goal._id } })).status, 404);
    assert.equal((await u.post('/api/links').send({ from: { type: 'note', id: note._id }, to: { type: 'note', id: note._id } })).status, 400);

    const graph = await u.get(`/api/graph?type=goal&id=${goal._id}`);
    assert.equal(graph.body.data[0].source, 'link');

    await u.del(`/api/notes/${note._id}`);
    assert.equal((await u.get(`/api/links?type=goal&id=${goal._id}`)).body.data.length, 0, 'links are cleaned up when an entity is deleted');
  });
});

describe('documents', () => {
  it('uploads, secures, expires and deletes documents', async () => {
    const u = await createUser(ctx.app);
    const other = await createUser(ctx.app);

    const rejected = await u.post('/api/documents').attach('file', Buffer.from('MZ binary'), { filename: 'evil.exe', contentType: 'application/x-msdownload' });
    assert.equal(rejected.status, 415);
    const spoofed = await u.post('/api/documents').attach('file', Buffer.from('not a pdf at all'), { filename: 'fake.pdf', contentType: 'application/pdf' });
    assert.equal(spoofed.status, 415);

    const up = await u.post('/api/documents').field('category', 'travel').field('expiryDate', '2032-08-11').field('remindDaysBefore', '180').field('tags', 'passport, Travel')
      .attach('file', PDF, { filename: '../../Pass port.pdf', contentType: 'application/pdf' });
    assert.equal(up.status, 201, JSON.stringify(up.body));
    const doc = up.body.data;
    assert.equal(doc.title, 'Pass port');
    assert.ok(!/[\\/]|\.\./.test(doc.originalName), 'path segments are stripped from filenames');
    assert.deepEqual(doc.tags, ['passport', 'travel']);
    assert.equal(doc.storageKey, undefined, 'storage key is never exposed');
    assert.equal(doc.expiryStatus, 'valid');
    assert.ok(doc.reminder, 'expiry reminder created');
    assert.match(doc.fileUrl, /\/file\?token=/);

    const reminders = await u.get('/api/reminders');
    assert.ok(reminders.body.data.some((r) => r.source?.id === doc._id && r.date === '2032-08-11'));

    // Signed URL: works for the owner, not for others, not with a bad token.
    const file = await u.get(doc.fileUrl.replace('/api', '/api'));
    assert.equal(file.status, 200);
    assert.equal(file.headers['content-type'], 'application/pdf');
    assert.match(file.headers['content-disposition'], /inline/);
    assert.equal((await other.get(doc.fileUrl)).status, 403);
    assert.equal((await u.get(`/api/documents/${doc._id}/file?token=9999999999.abcdefghijklmnop`)).status, 403);
    assert.equal((await other.get(`/api/documents/${doc._id}`)).status, 404);

    const list = await u.get('/api/documents?view=expiring');
    assert.equal(list.body.data.length, 0);
    const soon = await u.patch(`/api/documents/${doc._id}`).send({ expiryDate: '2026-10-01', title: 'Passport' });
    assert.equal(soon.body.data.expiryStatus, 'expiring');
    const updatedReminder = await u.get('/api/reminders');
    assert.ok(updatedReminder.body.data.some((r) => r.source?.id === doc._id && r.date === '2026-10-01' && r.title === 'Passport expires'));
    assert.equal((await u.get('/api/documents?view=expiring')).body.data.length, 1);

    const notifications = await u.get(`/api/notifications?date=${TODAY}`);
    assert.ok(notifications.body.data.some((n) => n.type === 'document' && n.entityId === doc._id));
    assert.ok(notifications.body.meta.unread >= 1);

    const search = await u.get('/api/search?q=passport');
    assert.equal(search.body.data.results.documents.length, 1);
    assert.ok(search.body.data.results.reminders.length >= 1);

    const txt = await u.post('/api/documents').attach('file', Buffer.from('Insurance policy number 12345'), { filename: 'policy.txt', contentType: 'text/plain' });
    assert.equal(txt.body.data.extraction.status, 'done');
    assert.equal((await u.post(`/api/documents/${doc._id}/extract`)).status, 501, 'no OCR provider → honest 501');

    assert.equal((await u.del(`/api/documents/${doc._id}`)).status, 204);
    assert.ok(!(await u.get('/api/reminders')).body.data.some((r) => r.source?.id === doc._id), 'reminder removed with the document');
    assert.equal(fs.existsSync(path.join(process.env.STORAGE_DIR, u.user._id)), true);
  });
});

describe('journal and focus', () => {
  it('stores reflections and shares mood with health', async () => {
    const u = await createUser(ctx.app);
    const put = await u.put(`/api/journal/${TODAY}`).send({ content: 'Good day', wins: ['Shipped'], gratitude: ['Coffee'], mood: 4, energy: 3, intention: 'Sleep early' });
    assert.equal(put.status, 200);
    assert.equal(put.body.data.mood, 4);
    const health = await u.get(`/api/health/logs/${TODAY}`);
    assert.equal(health.body.data.mood, 4, 'mood lives on the health log');
    await u.put(`/api/health/logs/${TODAY}`).send({ mood: 5 });
    assert.equal((await u.get(`/api/journal/${TODAY}`)).body.data.mood, 5, 'journal reads the shared record');
    const next = await u.get('/api/journal/2026-09-16');
    assert.equal(next.body.data.exists, false);
    assert.equal(next.body.data.previousIntention.text, 'Sleep early');
    const calendar = await u.get(`/api/journal/calendar?from=2026-09-01&to=${TODAY}`);
    assert.equal(calendar.body.data.length, 1);
    assert.equal((await u.get('/api/search?q=shipped')).body.data.results.journal.length, 1);
    assert.equal((await u.del(`/api/journal/${TODAY}`)).status, 204);
  });

  it('runs focus sessions with pause/resume and summarises them', async () => {
    const u = await createUser(ctx.app);
    const task = (await u.post('/api/tasks').send({ title: 'Deep work' })).body.data;
    const start = await u.post('/api/focus/sessions').send({ plannedMinutes: 25, task: task._id, date: TODAY });
    assert.equal(start.status, 201);
    assert.equal(start.body.data.status, 'running');
    const active = await u.get('/api/focus/active');
    assert.equal(active.body.data._id, start.body.data._id);
    const paused = await u.post(`/api/focus/sessions/${start.body.data._id}/pause`);
    assert.equal(paused.body.data.status, 'paused');
    assert.equal((await u.post(`/api/focus/sessions/${start.body.data._id}/pause`)).status, 400);
    await u.post(`/api/focus/sessions/${start.body.data._id}/resume`);
    const done = await u.post(`/api/focus/sessions/${start.body.data._id}/complete`).send({ date: TODAY });
    assert.equal(done.body.data.status, 'completed');
    assert.equal(done.body.data.task.title, 'Deep work');
    assert.equal((await u.get('/api/focus/active')).body.data, null);

    await u.post('/api/focus/sessions/log').send({ plannedMinutes: 50, focusedMinutes: 45, date: TODAY, label: 'Reading' });
    const summary = await u.get(`/api/focus/summary?date=${TODAY}&days=7`);
    assert.equal(summary.body.data.totalSessions, 2);
    assert.equal(summary.body.data.todayMinutes, 45);
    assert.equal(summary.body.data.streak, 1);
    const other = await createUser(ctx.app);
    assert.equal((await other.post('/api/focus/sessions').send({ plannedMinutes: 25, task: task._id })).status, 400);
  });
});

describe('finance extensions', () => {
  it('handles accounts, recurring rules, subscriptions and savings goals', async () => {
    const u = await createUser(ctx.app);
    const bank = (await u.post('/api/finance/accounts').send({ name: 'Bank', type: 'bank', balance: 1000 })).body.data;
    const card = (await u.post('/api/finance/accounts').send({ name: 'Card', type: 'credit_card', balance: 200 })).body.data;
    await u.post('/api/finance/transactions').send({ type: 'expense', amount: 100, category: 'Dining', date: TODAY, account: bank._id });
    await u.post('/api/finance/transactions').send({ type: 'expense', amount: 50, category: 'Shopping', date: TODAY, account: card._id });
    const accounts = await u.get('/api/finance/accounts');
    const byName = Object.fromEntries(accounts.body.data.map((a) => [a.name, a.balance]));
    assert.equal(byName.Bank, 900);
    assert.equal(byName.Card, 250, 'liabilities grow with expenses');
    assert.equal(accounts.body.meta.netWorth, 650);

    const rule = await u.post('/api/finance/recurring').send({ type: 'income', amount: 3000, category: 'Salary', nextDate: '2026-08-01', frequency: 'monthly', account: bank._id });
    assert.equal(rule.status, 201);
    const txs = await u.get('/api/finance/transactions?type=income');
    assert.ok(txs.body.data.length >= 2, 'due recurring transactions are posted');
    const rules = await u.get('/api/finance/recurring');
    assert.ok(rules.body.data[0].nextDate > TODAY);

    const sub = await u.post('/api/finance/subscriptions').send({ name: 'Music', amount: 10, frequency: 'monthly', nextPayment: '2026-01-05' });
    assert.equal(sub.status, 201);
    const subs = await u.get('/api/finance/subscriptions');
    assert.ok(subs.body.data[0].nextPayment >= TODAY, 'past renewals roll forward');
    assert.equal(subs.body.meta.monthlyTotal, 10);

    const goal = await u.post('/api/finance/savings').send({ title: 'Emergency fund', targetAmount: 1000, monthlyContribution: 250 });
    assert.equal(goal.body.data.monthsLeft, 4);
    const contributed = await u.post(`/api/finance/savings/${goal.body.data._id}/contribute`).send({ amount: 300, date: TODAY });
    assert.equal(contributed.body.data.currentAmount, 300);
    assert.equal(contributed.body.data.progress, 30);
    const summary = await u.get('/api/finance/summary?month=2026-09');
    assert.equal(summary.body.data.savings.current, 300);
    assert.equal(summary.body.data.subscriptionsMonthly, 10);
    assert.equal(typeof summary.body.data.netWorth.netWorth, 'number');
  });
});

describe('quick capture', () => {
  it('parses dates, times, amounts and types deterministically', async () => {
    const u = await createUser(ctx.app);
    const parse = async (text) => (await u.post('/api/capture/parse').send({ text, date: TODAY })).body.data;
    const a = await parse('Buy protein tomorrow');
    assert.equal(a.type, 'task');
    assert.equal(a.date, '2026-09-16');
    assert.equal(a.fields.task.title, 'Buy protein');
    const b = await parse('Meeting with Rahul Friday at 4 PM');
    assert.equal(b.type, 'event');
    assert.equal(b.date, '2026-09-18');
    assert.equal(b.time, '16:00');
    const c = await parse('Spent ₹850 on groceries');
    assert.equal(c.type, 'transaction');
    assert.equal(c.amount, 850);
    assert.equal(c.fields.transaction.category, 'Groceries');
    assert.equal(c.fields.transaction.currency, 'INR');
    const d = await parse('Passport expires 11 August 2032');
    assert.equal(d.type, 'reminder');
    assert.equal(d.date, '2032-08-11');
    assert.equal(d.fields.reminder.category, 'renewal');
    assert.equal(d.parser, 'rules');
  });
});

describe('notifications, sessions and export', () => {
  it('derives notifications from data, respects preferences and marks them read', async () => {
    const u = await createUser(ctx.app);
    await u.post('/api/tasks').send({ title: 'Late', dueDate: '2026-09-01' });
    const list = await u.get(`/api/notifications?date=${TODAY}`);
    const overdue = list.body.data.find((n) => n.key === `tasks:overdue:${TODAY}`);
    assert.ok(overdue);
    assert.equal((await u.get(`/api/notifications?date=${TODAY}`)).body.data.filter((n) => n.key === overdue.key).length, 1, 'idempotent');
    await u.post(`/api/notifications/${overdue._id}/read`);
    assert.equal((await u.get(`/api/notifications?date=${TODAY}&unread=true`)).body.data.some((n) => n._id === overdue._id), false);

    const quiet = await createUser(ctx.app);
    await quiet.patch('/api/auth/me').send({ preferences: { notifications: { tasks: false } } });
    await quiet.post('/api/tasks').send({ title: 'Late', dueDate: '2026-09-01' });
    assert.equal((await quiet.get(`/api/notifications?date=${TODAY}`)).body.data.length, 0);
    const other = await createUser(ctx.app);
    assert.equal((await other.post(`/api/notifications/${overdue._id}/read`)).status, 404);
  });

  it('lists and revokes sessions, exports data', async () => {
    const u = await createUser(ctx.app);
    const sessions = await u.get('/api/auth/sessions');
    assert.equal(sessions.status, 200);
    assert.equal(sessions.body.data.length, 1);
    await u.post('/api/tasks').send({ title: 'Exported task' });
    const exported = await u.get('/api/auth/export');
    assert.equal(exported.status, 200);
    assert.equal(exported.body.data.tasks.length, 1);
    assert.equal(exported.body.user.passwordHash, undefined);
    assert.equal((await u.del('/api/auth/sessions/others')).status, 204);
  });
});

describe('AI layer', () => {
  let setAIProvider;
  const calls = [];
  const fakeProvider = {
    name: 'fake',
    model: 'fake-1',
    available: true,
    async generate({ system, messages }) {
      calls.push({ kind: 'generate', system, messages });
      return { text: 'Narrative from fake provider', usage: { input: 1, output: 1 } };
    },
    async structured({ system, messages }) {
      calls.push({ kind: 'structured', system, messages });
      const text = messages.at(-1).content;
      const actions = /create a task/i.test(text)
        ? [{ type: 'create_task', summary: 'Create task "Renew passport"', payload: JSON.stringify({ title: 'Renew passport', dueDate: '2026-09-20', priority: 'high' }) }, { type: 'create_task', summary: 'bad', payload: JSON.stringify({ title: '' }) }]
        : [];
      return { data: { reply: `Reply about: ${text}`, actions }, usage: { input: 1, output: 1 } };
    },
  };

  before(async () => {
    ({ setAIProvider } = await import('../src/services/ai/providers/index.js'));
  });

  it('reports unconfigured AI honestly and never fakes a brief narrative', async () => {
    const { setAIProvider: set } = await import('../src/services/ai/providers/index.js');
    const original = (await import('../src/services/ai/providers/index.js')).getAIProvider();
    set({ name: 'none', model: null, available: false });
    const u = await createUser(ctx.app);
    const status = await u.get('/api/ai/status');
    assert.equal(status.body.data.configured, false);
    const chat = await u.post('/api/ai/chat').send({ message: 'hello' });
    assert.equal(chat.status, 503);
    assert.equal(chat.body.error.code, 'AI_NOT_CONFIGURED');
    const brief = await u.get(`/api/ai/brief?date=${TODAY}`);
    assert.equal(brief.status, 200);
    assert.equal(brief.body.data.narrative, null);
    assert.ok(brief.body.data.summary);
    set(original);
  });

  it('chats with retrieved context, respects permissions, and requires confirmation for actions', async () => {
    setAIProvider(fakeProvider);
    const u = await createUser(ctx.app);
    await u.post('/api/tasks').send({ title: 'Secret task', dueDate: TODAY });
    await u.post('/api/finance/transactions').send({ type: 'expense', amount: 42, category: 'Dining', date: TODAY });

    calls.length = 0;
    const first = await u.post('/api/ai/chat').send({ message: 'How much did I spend this month?', date: TODAY });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.ok(first.body.data.sources.includes('finance'));
    const systemText = calls[0].system.map((b) => b.text).join('\n');
    assert.ok(systemText.includes('Dining'), 'finance context retrieved');

    await u.patch('/api/auth/me').send({ preferences: { ai: { scopes: { finance: false } } } });
    calls.length = 0;
    const denied = await u.post('/api/ai/chat').send({ message: 'How much did I spend this month?', date: TODAY, conversationId: first.body.data.conversation._id });
    assert.ok(denied.body.data.denied.includes('finance'));
    assert.equal(calls.length, 0, 'a request only about a denied module never reaches the model at all');
    assert.match(denied.body.data.message.content, /finance/i);

    const create = await u.post('/api/ai/chat').send({ message: 'Create a task to renew my passport', date: TODAY });
    const msg = create.body.data.message;
    assert.equal(create.body.data.mode, 'create');
    assert.equal(msg.actions.length, 1, 'invalid proposals are dropped');
    assert.equal(msg.actions[0].status, 'proposed');
    assert.equal((await u.get('/api/tasks?q=passport')).body.data.length, 0, 'nothing is created before confirmation');

    const other = await createUser(ctx.app);
    assert.equal((await other.post('/api/ai/actions').send({ messageId: msg._id, actionId: msg.actions[0]._id, decision: 'execute' })).status, 404);

    const executed = await u.post('/api/ai/actions').send({ messageId: msg._id, actionId: msg.actions[0]._id, decision: 'execute', date: TODAY });
    assert.equal(executed.status, 200, JSON.stringify(executed.body));
    assert.equal(executed.body.data.action.status, 'executed');
    assert.equal(executed.body.data.result.entityType, 'task');
    assert.equal((await u.get('/api/tasks?q=passport')).body.data.length, 1);
    assert.equal((await u.post('/api/ai/actions').send({ messageId: msg._id, actionId: msg.actions[0]._id, decision: 'execute' })).status, 409);

    const conversations = await u.get('/api/ai/conversations');
    assert.equal(conversations.body.data.length, 2);
    const convo = await u.get(`/api/ai/conversations/${first.body.data.conversation._id}`);
    assert.equal(convo.body.data.messages.length, 4);

    const brief = await u.get(`/api/ai/brief?date=${TODAY}`);
    assert.equal(brief.body.data.narrative, 'Narrative from fake provider');
    const review = await u.get('/api/ai/review');
    assert.ok(review.body.data.metrics.tasks);
    assert.equal(review.body.data.narrative, 'Narrative from fake provider');

    await u.patch('/api/auth/me').send({ preferences: { ai: { enabled: false } } });
    assert.equal((await u.post('/api/ai/chat').send({ message: 'hi' })).status, 403);

    const proposal = await u.post('/api/ai/proposals/execute').send({ type: 'create_reminder', payload: { title: 'From note', date: '2026-10-10' } });
    assert.equal(proposal.status, 201);
    assert.equal((await u.post('/api/ai/proposals/execute').send({ type: 'create_task', payload: { title: '' } })).status, 400);
  });
});
