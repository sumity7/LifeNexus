/**
 * Seeds a realistic demo account (demo@lifeos.app / Demo1234!).
 * Only the demo user's data is replaced — other accounts are untouched.
 * All dates are generated relative to today so the demo always looks "live".
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Task } from '../models/Task.js';
import { Habit, HabitLog } from '../models/Habit.js';
import { Goal } from '../models/Goal.js';
import { Event } from '../models/Event.js';
import { Folder, Note } from '../models/Note.js';
import { Account, Budget, RecurringTransaction, SavingsGoal, Subscription, Transaction } from '../models/Finance.js';
import { HealthLog, Workout } from '../models/Health.js';
import { Routine, RoutineLog } from '../models/Routine.js';
import { Reminder } from '../models/Reminder.js';
import { Project } from '../models/Project.js';
import { JournalEntry } from '../models/Journal.js';
import { FocusSession } from '../models/FocusSession.js';
import { Document } from '../models/Document.js';
import { Link } from '../models/Link.js';
import { ActivityLog } from '../models/ActivityLog.js';
import { deleteUserData } from '../services/account.js';
import { getStorage } from '../services/storage/index.js';
import { addDays, addMonths, dayOfWeek, rangeKeys, serverToday, startOfWeek } from '../utils/dates.js';
import { htmlToText, sanitizeNoteHtml } from '../utils/html.js';

export const DEMO_USER = { name: 'Alex Morgan', email: env.DEMO_EMAIL, password: 'Demo1234!' };

/* Deterministic randomness so every seed run produces the same demo. */
function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Reseeded at the start of every seedDemo() call (not just once at module load) — otherwise a
// second in-process call (e.g. two calls in the same test run, or any future programmatic
// reseed without a process restart) would continue consuming the same PRNG sequence and produce
// a different "random" demo each time, breaking the "same seed run produces the same demo" claim.
let rand = mulberry32(20260915);
const chance = (p) => rand() < p;
const between = (min, max) => min + rand() * (max - min);
const int = (min, max) => Math.floor(between(min, max + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const money = (min, max) => Math.round(between(min, max) * 100) / 100;

const at = (key, time = '12:00') => new Date(`${key}T${time}:00`);
const endOfDay = (key) => new Date(`${key}T23:59:59.999`);

export async function seedDemo() {
  rand = mulberry32(20260915);
  const today = serverToday();
  const d = (n) => addDays(today, n);
  const stamp = (key) => ({ createdAt: at(key), updatedAt: at(key) });

  /* ───── User ───── */
  let user = await User.findOne({ email: DEMO_USER.email });
  if (user) {
    await deleteUserData(user._id);
    await Session.deleteMany({ user: user._id });
  } else {
    user = new User({ email: DEMO_USER.email, name: DEMO_USER.name });
  }
  user.name = DEMO_USER.name;
  user.preferences = { theme: 'system', accent: 'indigo', currency: 'USD', weekStartsOn: 1, waterGoalMl: 2500, sleepGoalHours: 8 };
  await user.setPassword(DEMO_USER.password);
  await user.save();
  const uid = user._id;

  /* ───── Goals ───── */
  const yearEnd = `${today.slice(0, 4)}-12-31`;
  const goalDocs = await Goal.insertMany(
    [
      {
        title: 'Run a half marathon', category: 'health', color: 'green', startDate: d(-60), deadline: d(75),
        description: 'Build up to 21.1 km with a sustainable training plan and finish the city half marathon.',
        milestones: [
          { title: 'Run 5K without stopping', done: true, completedAt: at(d(-45)), dueDate: d(-45) },
          { title: 'Complete a 10K race', done: true, completedAt: at(d(-8)), dueDate: d(-8) },
          { title: 'Long run of 16K', dueDate: d(20) },
          { title: 'Taper week & race day', dueDate: d(75) },
        ],
      },
      {
        title: 'Launch personal portfolio site', category: 'career', color: 'indigo', startDate: d(-30), deadline: d(21),
        description: 'A fast, well-designed portfolio with three in-depth case studies.',
        milestones: [
          { title: 'Design mockups', done: true, completedAt: at(d(-18)), dueDate: d(-18) },
          { title: 'Build core pages', dueDate: d(6) },
          { title: 'Write 3 case studies', dueDate: d(14) },
          { title: 'Deploy & share', dueDate: d(21) },
        ],
      },
      {
        title: 'Build a 6-month emergency fund', category: 'finance', color: 'teal', startDate: d(-120), deadline: addMonths(today, 5),
        description: 'Save $9,000 in a high-yield savings account.',
        milestones: [
          { title: 'Save the first $2,000', done: true, completedAt: at(d(-70)) },
          { title: 'Reach $5,000', done: true, completedAt: at(d(-12)) },
          { title: 'Reach $7,000' },
          { title: 'Reach $9,000', dueDate: addMonths(today, 5) },
        ],
      },
      {
        title: 'Read 24 books this year', category: 'learning', color: 'amber', startDate: `${today.slice(0, 4)}-01-01`, deadline: yearEnd,
        description: 'Mix of fiction, design, and personal finance.',
        milestones: [
          { title: 'Q1 — 6 books', done: true, completedAt: at(d(-170)) },
          { title: 'Q2 — 12 books', done: true, completedAt: at(d(-80)) },
          { title: 'Q3 — 18 books' },
          { title: 'Q4 — 24 books', dueDate: yearEnd },
        ],
      },
      {
        title: 'Learn conversational Spanish (A1)', category: 'personal', color: 'pink', status: 'completed',
        startDate: d(-150), deadline: d(-20), completedAt: at(d(-22)),
        description: 'Finish the A1 course before the Lisbon & Madrid trip.',
        milestones: [
          { title: 'Finish course units 1–6', done: true, completedAt: at(d(-90)) },
          { title: 'Hold a 10-minute conversation', done: true, completedAt: at(d(-22)) },
        ],
      },
    ].map((g) => ({ ...g, user: uid, ...stamp(g.startDate) })),
    { timestamps: false },
  );
  const [marathon, portfolio, fund, reading] = goalDocs;
  const ms = (goal, i) => goal.milestones[i]._id;

  /* ───── Projects ───── */
  const [siteProject, trainingProject] = await Project.insertMany(
    [
      { title: 'Portfolio website build', goal: portfolio._id, color: 'indigo', startDate: d(-25), dueDate: d(21), description: 'Design, build and deploy the new portfolio with three case studies.' },
      { title: 'Half marathon training block', goal: marathon._id, color: 'green', startDate: d(-60), dueDate: d(75), description: '12-week plan: intervals, easy runs and a growing long run.' },
      { title: 'Lisbon trip planning', color: 'teal', startDate: d(-10), dueDate: d(12), description: 'Flights, stays, itinerary and packing.' },
    ].map((p) => ({ ...p, user: uid, ...stamp(p.startDate) })),
    { timestamps: false },
  );

  /* ───── Tasks ───── */
  const openTasks = [
    { title: 'Renew car registration', priority: 'high', dueDate: d(-2), tags: ['admin'] },
    { title: 'Reply to landlord about lease renewal', priority: 'medium', dueDate: d(-1), tags: ['home'] },
    { title: 'Finish homepage hero section', priority: 'urgent', dueDate: today, dueTime: '11:00', goal: portfolio._id, milestone: ms(portfolio, 1), project: siteProject._id, tags: ['portfolio'],
      subtasks: [{ title: 'Headline copy', done: true }, { title: 'Responsive layout', done: true }, { title: 'Hero illustration' }, { title: 'Lighthouse pass' }] },
    { title: 'Grocery run for meal prep', priority: 'medium', dueDate: today, tags: ['home'],
      subtasks: [{ title: 'Oats & berries' }, { title: 'Chicken & tofu' }, { title: 'Vegetables' }] },
    { title: 'Tempo run — 6 km', priority: 'high', dueDate: today, dueTime: '18:00', goal: marathon._id, milestone: ms(marathon, 2), project: trainingProject._id, tags: ['running'] },
    { title: 'Call Mom', priority: 'low', dueDate: today, tags: ['family'] },
    { title: 'Transfer $400 to emergency fund', priority: 'high', dueDate: d(1), goal: fund._id, milestone: ms(fund, 2), tags: ['money'] },
    { title: 'Draft case study: Fintech onboarding', priority: 'high', dueDate: d(2), goal: portfolio._id, milestone: ms(portfolio, 2), project: siteProject._id, tags: ['portfolio', 'writing'] },
    { title: 'Book dentist follow-up', priority: 'low', dueDate: d(3), tags: ['health'] },
    { title: 'Long run — 14 km', priority: 'medium', dueDate: d(4), goal: marathon._id, milestone: ms(marathon, 2), tags: ['running'] },
    { title: 'Prepare slides for quarterly review', priority: 'urgent', dueDate: d(5), tags: ['work'],
      subtasks: [{ title: 'Collect metrics', done: true }, { title: 'Outline story' }, { title: 'Design slides' }] },
    { title: 'Buy birthday gift for Mom', priority: 'medium', dueDate: d(6), tags: ['family'] },
    { title: 'Draft case study: Design system', priority: 'medium', dueDate: d(10), goal: portfolio._id, milestone: ms(portfolio, 2), project: siteProject._id, tags: ['portfolio', 'writing'] },
    { title: 'Finish "The Psychology of Money"', priority: 'low', dueDate: d(12), goal: reading._id, milestone: ms(reading, 2), tags: ['reading'] },
    { title: 'Plan Lisbon itinerary', priority: 'medium', dueDate: d(9), tags: ['travel'] },
    { title: 'Set up deployment pipeline', priority: 'medium', dueDate: d(18), goal: portfolio._id, milestone: ms(portfolio, 3), project: siteProject._id, tags: ['portfolio'] },
    { title: 'Research high-yield savings accounts', priority: 'high', tags: ['money'], goal: fund._id },
    { title: 'Declutter the garage', priority: 'low', tags: ['home'] },
    { title: 'Learn keyboard shortcuts in Figma', priority: 'low', tags: ['learning'] },
    { title: 'Weekly review', priority: 'high', dueDate: addDays(startOfWeek(today, 1), 6), tags: ['review'], recurrence: { freq: 'weekly', interval: 1 } },
    { title: 'Pay rent', priority: 'urgent', dueDate: addMonths(`${today.slice(0, 7)}-03`, today.slice(8) > '03' ? 1 : 0), tags: ['money'], recurrence: { freq: 'monthly', interval: 1 } },
    { title: 'Water the plants', priority: 'low', dueDate: d(1), tags: ['home'], recurrence: { freq: 'daily', interval: 3 } },
  ].map((t) => ({ ...t, user: uid, ...stamp(d(-int(1, 12))) }));

  const doneTitles = [
    'Review pull requests', 'Send invoice to client', 'Clean inbox to zero', 'Update resume', 'Order new running shoes',
    'Book flights to Lisbon', 'Cancel unused subscription', 'Pick up dry cleaning', 'Fix leaking kitchen tap', 'Write weekly newsletter',
    'Schedule car service', 'Prepare team retro', 'Backup laptop', 'Pay electricity bill', 'Meal prep for the week',
    'Research standing desks', 'Organize photo library', 'Refill prescriptions', 'Sketch portfolio wireframes', 'Interval run — 5×800m',
  ];
  const completedTasks = [];
  for (let i = 0; i < 58; i++) {
    const on = d(-int(0, 44));
    const weekday = dayOfWeek(on);
    if ((weekday === 0 || weekday === 6) && chance(0.5)) continue; // lighter weekends
    completedTasks.push({
      user: uid, title: pick(doneTitles), priority: pick(['low', 'medium', 'medium', 'high', 'urgent']), status: 'done',
      dueDate: chance(0.7) ? on : null, completedOn: on, completedAt: at(on, `${String(int(8, 20)).padStart(2, '0')}:${pick(['05', '20', '40'])}`),
      tags: [pick(['work', 'home', 'admin', 'health'])], ...stamp(addDays(on, -int(0, 5))),
    });
  }
  completedTasks.push(
    { user: uid, title: 'Complete 10K race', priority: 'high', status: 'done', dueDate: d(-8), completedOn: d(-8), completedAt: at(d(-8), '09:10'), goal: marathon._id, milestone: ms(marathon, 1), tags: ['running'], ...stamp(d(-20)) },
    { user: uid, title: 'Finalize mockups in Figma', priority: 'high', status: 'done', dueDate: d(-18), completedOn: d(-18), completedAt: at(d(-18), '17:00'), goal: portfolio._id, milestone: ms(portfolio, 0), tags: ['portfolio'], ...stamp(d(-25)) },
    { user: uid, title: 'Set up auto-transfer to savings', priority: 'medium', status: 'done', completedOn: d(-60), completedAt: at(d(-60)), goal: fund._id, milestone: ms(fund, 0), tags: ['money'], ...stamp(d(-65)) },
    { user: uid, title: 'Finish "Atomic Habits"', priority: 'low', status: 'done', completedOn: d(-15), completedAt: at(d(-15)), goal: reading._id, milestone: ms(reading, 2), tags: ['reading'], ...stamp(d(-30)) },
  );
  const [lisbonProject] = await Project.find({ user: uid, title: 'Lisbon trip planning' });
  openTasks.push(
    { user: uid, title: 'Book Lisbon apartment', priority: 'high', dueDate: d(3), project: lisbonProject._id, tags: ['travel'], ...stamp(d(-4)) },
    { user: uid, title: 'Packing list for Lisbon', priority: 'low', dueDate: d(10), project: lisbonProject._id, tags: ['travel'], subtasks: [{ title: 'Passport' }, { title: 'Chargers' }, { title: 'Running shoes' }], ...stamp(d(-3)) },
  );
  await Task.insertMany([...openTasks, ...completedTasks], { timestamps: false });

  /* ───── Habits ───── */
  const habitDefs = [
    { name: 'Morning meditation', icon: '🧘', color: 'violet', p: 0.82, streak: 12, description: '10 minutes of breathing before checking the phone.' },
    { name: 'Read 20 pages', icon: '📚', color: 'amber', p: 0.72, streak: 5 },
    { name: 'Exercise', icon: '🏃', color: 'green', frequency: 'weekly', timesPerWeek: 4, p: 0.6 },
    { name: 'Drink 8 glasses of water', icon: '💧', color: 'blue', p: 0.78, streak: 3 },
    { name: 'No screens after 10pm', icon: '📵', color: 'slate', p: 0.48 },
    { name: 'Practice guitar', icon: '🎸', color: 'orange', days: [1, 3, 5], p: 0.7, streak: 4 },
  ];
  const habits = await Habit.insertMany(
    habitDefs.map(({ p, streak, ...h }, order) => ({ ...h, user: uid, order, ...stamp(d(-120)) })),
    { timestamps: false },
  );
  const habitLogs = [];
  habits.forEach((habit, i) => {
    const { p, streak = 0 } = habitDefs[i];
    for (const key of rangeKeys(d(-119), today)) {
      const scheduled = !habit.days.length || habit.days.includes(dayOfWeek(key));
      if (!scheduled) continue;
      const age = -((new Date(`${today}T00:00:00Z`) - new Date(`${key}T00:00:00Z`)) / 86_400_000);
      const inStreak = streak && age > -streak * (habit.days.length ? 7 / habit.days.length : 1) && key !== today;
      const doneToday = key === today ? i < 2 : null;
      if (doneToday ?? (inStreak || chance(p))) habitLogs.push({ user: uid, habit: habit._id, date: key });
    }
  });
  await HabitLog.insertMany(habitLogs);

  /* ───── Calendar events ───── */
  const monday = startOfWeek(today, 1);
  const timed = (title, key, start, end, extra = {}) => ({ title, start: at(key, start), end: at(key, end), ...extra });
  const allDay = (title, from, to, extra = {}) => ({ title, allDay: true, start: at(from, '00:00'), end: endOfDay(to), ...extra });
  const weekly = { recurrence: { freq: 'weekly', interval: 1 } };
  await Event.insertMany(
    [
      timed('Team sync', addDays(monday, -28), '10:00', '10:30', { color: 'indigo', location: 'Zoom', ...weekly }),
      timed('Strength training', addDays(monday, -27), '07:00', '08:00', { color: 'green', location: 'Iron Gym', ...weekly }),
      timed('Strength training', addDays(monday, -25), '07:00', '08:00', { color: 'green', location: 'Iron Gym', ...weekly }),
      timed('Yoga class', addDays(monday, -23), '09:00', '10:00', { color: 'teal', location: 'Flow Studio', ...weekly }),
      timed('Book club', d(-22), '19:00', '20:30', { color: 'amber', description: 'This month: "Tomorrow, and Tomorrow, and Tomorrow"', recurrence: { freq: 'monthly', interval: 1 } }),
      timed('Deep work: portfolio', today, '09:00', '11:30', { color: 'violet', description: 'Phone on DND. Hero section + case study outline.' }),
      timed('1:1 with manager', today, '15:00', '15:30', { color: 'blue', location: 'Room 4B' }),
      timed('Dinner with Sam', today, '19:30', '21:30', { color: 'pink', location: 'Osteria Nonna' }),
      timed('Project kickoff', d(1), '11:00', '12:00', { color: 'indigo', location: 'HQ — Atlas room' }),
      timed('Dentist appointment', d(2), '14:00', '15:00', { color: 'red', location: 'Bright Smile Dental' }),
      timed('Coffee with mentor', d(4), '08:30', '09:30', { color: 'amber', location: 'Blue Bottle' }),
      timed("Mom's birthday dinner", d(9), '18:30', '21:00', { color: 'pink', location: "Mom's place" }),
      allDay('Lisbon trip', d(12), d(15), { color: 'teal', description: 'Flight TP 1351 departs 07:40.' }),
      timed('Car service', d(18), '10:00', '11:00', { color: 'slate', location: 'City Motors' }),
      timed('Quarterly planning', d(-3), '13:00', '15:00', { color: 'indigo' }),
      timed('10K race', d(-8), '07:00', '09:00', { color: 'green', location: 'Riverside Park' }),
      allDay('Public holiday', d(24), d(24), { color: 'orange' }),
    ].map((e) => ({ ...e, user: uid })),
  );

  /* ───── Notes ───── */
  const folders = await Folder.insertMany(
    [
      { name: 'Personal', color: 'blue' },
      { name: 'Work', color: 'indigo' },
      { name: 'Ideas', color: 'amber' },
      { name: 'Travel', color: 'teal' },
      { name: 'Learning', color: 'green' },
    ].map((f) => ({ ...f, user: uid })),
  );
  const folder = Object.fromEntries(folders.map((f) => [f.name, f._id]));
  const noteDefs = [
    { title: 'Weekly review template', folder: folder.Personal, pinned: true, tags: ['review', 'template'], age: 2,
      content: '<h2>Weekly review</h2><p>Block 30 minutes every Sunday.</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Clear inboxes & capture loose ends</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Review calendar: last week & next two weeks</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Check goal progress and pick 3 priorities</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Budget check-in</p></div></li></ul><blockquote><p>What went well? What would I do differently?</p></blockquote>' },
    { title: 'Lisbon trip itinerary', folder: folder.Travel, pinned: true, tags: ['travel', 'lisbon'], age: 1,
      content: '<h2>Day 1 — Alfama</h2><ul><li>Castelo de São Jorge in the morning</li><li>Lunch at Taberna da Rua das Flores</li><li>Sunset at Miradouro da Senhora do Monte</li></ul><h2>Day 2 — Belém</h2><ul><li>Jerónimos Monastery (book tickets!)</li><li>Pastéis de Belém — go early</li><li>MAAT museum</li></ul><h2>Day 3 — Sintra day trip</h2><p>Train from Rossio, 40 min. Pena Palace + Quinta da Regaleira.</p>' },
    { title: 'Portfolio case study outline', folder: folder.Work, tags: ['portfolio', 'writing'], age: 0,
      content: '<h1>Fintech onboarding redesign</h1><h3>Problem</h3><p>42% of users dropped off during identity verification.</p><h3>Process</h3><ol><li>Funnel analysis and 12 user interviews</li><li>Mapped friction points; prototyped 3 flows</li><li>A/B tested progressive disclosure</li></ol><h3>Outcome</h3><p><strong>Completion up 31%</strong>, support tickets down 18%.</p>' },
    { title: 'Book notes: Atomic Habits', folder: folder.Learning, tags: ['reading', 'habits'], age: 15,
      content: '<p>Core idea: <em>you do not rise to the level of your goals, you fall to the level of your systems.</em></p><h3>Four laws of behavior change</h3><ol><li>Make it obvious</li><li>Make it attractive</li><li>Make it easy</li><li>Make it satisfying</li></ol><p>Habit stacking: “After I pour my coffee, I will meditate for one minute.”</p>' },
    { title: 'App ideas', folder: folder.Ideas, tags: ['ideas'], age: 6,
      content: '<ul><li><strong>Plant care tracker</strong> — photo-based watering reminders</li><li><strong>Receipt splitter</strong> — scan and split with friends</li><li><strong>Run route generator</strong> — loops of an exact distance from home</li></ul>' },
    { title: 'Quarterly planning — notes', folder: folder.Work, tags: ['meeting', 'planning'], age: 3,
      content: '<p><strong>Attendees:</strong> Priya, Marcus, Jen, me</p><h3>Decisions</h3><ul><li>Ship onboarding v2 by end of quarter</li><li>Pause the referral experiment</li></ul><h3>Action items</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Share metrics dashboard with the team</p></div></li><li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>Prepare slides for quarterly review</p></div></li></ul>' },
    { title: 'Half marathon training plan', folder: folder.Personal, tags: ['running', 'health'], age: 10,
      content: '<p>12 weeks, 4 runs/week.</p><ul><li><strong>Tue</strong> — intervals or tempo</li><li><strong>Thu</strong> — easy 5–8 km</li><li><strong>Sat</strong> — long run (+1.5 km/week)</li><li><strong>Sun</strong> — recovery jog or yoga</li></ul><p>Target pace: 5:40/km. Fuel with gels after 10 km.</p>' },
    { title: 'Recipes to try', folder: folder.Personal, tags: ['food'], age: 20,
      content: '<ul><li>Miso-glazed salmon with sesame greens</li><li>Shakshuka with feta</li><li>Overnight oats — peanut butter & banana</li></ul>' },
    { title: 'Gift ideas', folder: folder.Personal, tags: ['family', 'gifts'], age: 4,
      content: '<p><strong>Mom</strong>: ceramic workshop voucher, silk scarf, framed family photo</p><p><strong>Sam</strong>: vinyl record, espresso tasting set</p>' },
    { title: 'Spanish vocab — travel', folder: folder.Learning, tags: ['spanish'], age: 30,
      content: '<ul><li><em>¿Dónde está la estación?</em> — Where is the station?</li><li><em>La cuenta, por favor</em> — The bill, please</li><li><em>¿Cuánto cuesta?</em> — How much is it?</li></ul>' },
    { title: 'Quick thoughts', folder: null, tags: [], age: 0,
      content: '<p>Try time-blocking afternoons for deep work — mornings are already full of meetings.</p>' },
  ];
  await Note.insertMany(
    noteDefs.map(({ age, content, ...n }) => {
      const clean = sanitizeNoteHtml(content);
      return { ...n, user: uid, content: clean, plainText: htmlToText(clean), ...stamp(d(-age)) };
    }),
    { timestamps: false },
  );

  /* ───── Finance ───── */
  const transactions = [];
  const tx = (type, category, description, amount, date) => {
    if (date <= today) transactions.push({ user: uid, type, category, description, amount, date });
  };
  for (let m = -3; m <= 0; m++) {
    const month = addMonths(`${today.slice(0, 7)}-01`, m).slice(0, 7);
    const day = (n) => `${month}-${String(n).padStart(2, '0')}`;
    tx('income', 'Salary', 'Monthly salary — Northwind Labs', 5800, day(1));
    if (chance(0.7)) tx('income', 'Freelance', pick(['Logo design project', 'Landing page for bakery', 'UX audit']), money(450, 1200), day(int(8, 24)));
    if (m === -2) tx('income', 'Investments', 'Dividend payout', 86.4, day(15));
    tx('expense', 'Housing', 'Rent', 1650, day(3));
    tx('expense', 'Utilities', 'Electricity', money(62, 98), day(9));
    tx('expense', 'Utilities', 'Internet — Fiber 500', 59.99, day(12));
    tx('expense', 'Subscriptions', 'Spotify', 10.99, day(5));
    tx('expense', 'Subscriptions', 'Netflix', 15.49, day(14));
    tx('expense', 'Health', 'Iron Gym membership', 45, day(2));
    for (const week of [2, 9, 16, 23]) {
      tx('expense', 'Groceries', pick(['Whole Foods', 'Trader Joe’s', 'Farmers market', 'Local grocer']), money(58, 142), day(week + int(0, 3)));
      for (let k = 0; k < int(1, 3); k++) {
        tx('expense', 'Dining', pick(['Sushi Zen', 'Blue Bottle Coffee', 'Taco Loco', 'Osteria Nonna', 'Pho Saigon', 'Brunch at Mae’s']), money(12, 68), day(week + int(0, 5)));
      }
      tx('expense', 'Transport', pick(['Uber', 'Metro card top-up', 'Gas station', 'Parking']), money(6, 48), day(week + int(0, 4)));
    }
    for (let k = 0; k < int(2, 3); k++) tx('expense', 'Shopping', pick(['Uniqlo', 'Amazon', 'IKEA', 'Running shoes', 'Bookstore']), money(22, 175), day(int(4, 27)));
    for (let k = 0; k < int(1, 2); k++) tx('expense', 'Entertainment', pick(['Cinema tickets', 'Concert tickets', 'Board game café', 'Museum entry']), money(14, 85), day(int(4, 27)));
    if (chance(0.6)) tx('expense', 'Health', pick(['Pharmacy', 'Physio session']), money(18, 90), day(int(5, 25)));
  }
  tx('expense', 'Travel', 'Flights to Lisbon', 418.6, d(-19));
  tx('expense', 'Gifts', 'Birthday gift for Sam', 64.5, d(-26));
  await Transaction.insertMany(transactions);
  await Budget.insertMany(
    [
      ['Housing', 1700], ['Groceries', 520], ['Dining', 260], ['Transport', 150], ['Shopping', 250],
      ['Entertainment', 120], ['Subscriptions', 40], ['Utilities', 180],
    ].map(([category, limit]) => ({ user: uid, category, limit })),
  );

  const [bank, cash, card, savingsAcct] = await Account.insertMany(
    [
      { name: 'Main checking', type: 'bank', balance: 4380.25, color: 'blue' },
      { name: 'Cash', type: 'cash', balance: 120, color: 'green' },
      { name: 'Credit card', type: 'credit_card', balance: 642.8, color: 'red' },
      { name: 'High-yield savings', type: 'savings', balance: 5200, color: 'teal' },
      { name: 'Index funds', type: 'investment', balance: 8750, color: 'violet' },
    ].map((a) => ({ ...a, user: uid })),
  );
  await RecurringTransaction.insertMany(
    [
      { type: 'income', amount: 5800, category: 'Salary', description: 'Monthly salary — Northwind Labs', frequency: 'monthly', nextDate: addMonths(`${today.slice(0, 7)}-01`, 1), account: bank._id },
      { type: 'expense', amount: 1650, category: 'Housing', description: 'Rent', frequency: 'monthly', nextDate: addMonths(`${today.slice(0, 7)}-03`, today.slice(8) >= '03' ? 1 : 0), account: bank._id },
      { type: 'expense', amount: 400, category: 'Savings', description: 'Auto-transfer to emergency fund', frequency: 'monthly', nextDate: addMonths(`${today.slice(0, 7)}-02`, today.slice(8) >= '02' ? 1 : 0), account: bank._id },
    ].map((r) => ({ ...r, user: uid })),
  );
  await Subscription.insertMany(
    [
      { name: 'Spotify', amount: 10.99, frequency: 'monthly', nextPayment: addMonths(`${today.slice(0, 7)}-05`, today.slice(8) >= '05' ? 1 : 0), category: 'Entertainment' },
      { name: 'Netflix', amount: 15.49, frequency: 'monthly', nextPayment: addMonths(`${today.slice(0, 7)}-14`, today.slice(8) >= '14' ? 1 : 0), category: 'Entertainment' },
      { name: 'Iron Gym', amount: 45, frequency: 'monthly', nextPayment: addMonths(`${today.slice(0, 7)}-02`, today.slice(8) >= '02' ? 1 : 0), category: 'Health' },
      { name: 'iCloud 200GB', amount: 2.99, frequency: 'monthly', nextPayment: d(int(1, 28)), category: 'Subscriptions' },
      { name: 'Domain — alexmorgan.dev', amount: 14, frequency: 'yearly', nextPayment: d(55), category: 'Subscriptions' },
      { name: 'Car insurance', amount: 720, frequency: 'yearly', nextPayment: d(18), category: 'Insurance' },
    ].map((s) => ({ ...s, user: uid })),
  );
  await SavingsGoal.insertMany(
    [
      { title: 'Emergency fund', targetAmount: 9000, currentAmount: 5200, monthlyContribution: 400, deadline: addMonths(today, 5), color: 'teal', goal: fund._id },
      { title: 'Lisbon trip', targetAmount: 1500, currentAmount: 1100, monthlyContribution: 200, deadline: d(12), color: 'orange' },
      { title: 'New laptop', targetAmount: 2200, currentAmount: 640, monthlyContribution: 150, color: 'violet' },
    ].map((g) => ({ ...g, user: uid })),
  );
  void cash;
  void card;
  void savingsAcct;

  /* ───── Health ───── */
  const healthLogs = [];
  let weight = 74.2;
  for (const key of rangeKeys(d(-59), today)) {
    weight = Math.round((weight - 0.03 + between(-0.15, 0.15)) * 10) / 10;
    if (key === today) {
      healthLogs.push({ user: uid, date: key, waterMl: 750, sleepHours: 7.3, sleepQuality: 4, mood: 4, energy: 4 });
      continue;
    }
    if (chance(0.08)) continue; // occasional missed day
    healthLogs.push({
      user: uid, date: key,
      waterMl: Math.round(between(1400, 3200) / 50) * 50,
      sleepHours: Math.round(between(5.9, 8.6) * 4) / 4,
      sleepQuality: int(2, 5), mood: int(2, 5), energy: int(2, 5),
      weightKg: chance(0.4) ? weight : null,
      steps: int(3800, 13500),
    });
  }
  await HealthLog.insertMany(healthLogs);

  const workouts = [];
  for (const key of rangeKeys(d(-59), d(-1))) {
    const wd = dayOfWeek(key);
    if ([2, 4].includes(wd) && chance(0.85)) workouts.push({ date: key, type: 'strength', title: 'Upper / lower split', durationMin: int(45, 65), intensity: 'high', calories: int(320, 480) });
    if ([1, 3].includes(wd) && chance(0.7)) {
      const km = Math.round(between(5, 9) * 10) / 10;
      workouts.push({ date: key, type: 'run', title: 'Easy run', durationMin: Math.round(km * 5.9), intensity: 'moderate', distanceKm: km, calories: Math.round(km * 68) });
    }
    if (wd === 6 && chance(0.9)) {
      const km = Math.round(between(10, 15) * 10) / 10;
      workouts.push({ date: key, type: 'run', title: 'Long run', durationMin: Math.round(km * 6.1), intensity: 'moderate', distanceKm: km, calories: Math.round(km * 70) });
    }
    if (wd === 0 && chance(0.6)) workouts.push({ date: key, type: 'yoga', title: 'Recovery flow', durationMin: 40, intensity: 'low', calories: 140 });
  }
  await Workout.insertMany(workouts.map((w) => ({ ...w, user: uid })));

  /* ───── Routines ───── */
  const routines = await Routine.insertMany(
    [
      { name: 'Morning kickstart', type: 'morning', timeOfDay: '06:45', description: 'Start calm and intentional.',
        steps: [['Drink a glass of water', 1], ['Meditate', 10], ['Stretch & mobility', 10], ['Journal 3 wins for today', 5], ["Review today's priorities", 5]] },
      { name: 'Evening wind-down', type: 'evening', timeOfDay: '21:30', description: 'Screens off, prepare for great sleep.',
        steps: [['Tidy desk & kitchen', 10], ['Plan tomorrow', 10], ['Read fiction', 20], ['Lights out by 22:30', 0]] },
      { name: 'Sunday reset', type: 'custom', timeOfDay: '17:00', days: [0], description: 'Set up the week ahead.',
        steps: [['Weekly review', 30], ['Meal prep', 60], ['Laundry', 20], ['Budget check-in', 10]] },
    ].map((r) => ({ ...r, user: uid, steps: r.steps.map(([title, durationMin]) => ({ title, durationMin })), ...stamp(d(-60)) })),
    { timestamps: false },
  );
  const routineLogs = [];
  for (const routine of routines) {
    for (const key of rangeKeys(d(-29), today)) {
      if (routine.days.length && !routine.days.includes(dayOfWeek(key))) continue;
      let steps;
      if (key === today) steps = routine.type === 'morning' ? routine.steps.slice(0, 3) : [];
      else steps = routine.steps.filter(() => chance(routine.type === 'morning' ? 0.85 : 0.7));
      if (steps.length) routineLogs.push({ user: uid, routine: routine._id, date: key, completedSteps: steps.map((s) => s._id) });
    }
  }
  await RoutineLog.insertMany(routineLogs);

  /* ───── Journal ───── */
  const journalTemplates = [
    { title: 'Momentum', content: 'Got through the case study draft faster than expected. The morning routine really sets the tone.', wins: ['Finished the fintech draft', 'Ran 8 km easy'], challenges: ['Afternoon slump around 3pm'], gratitude: ['Sam’s support', 'Good coffee'], lessons: 'Do the hard thing before lunch.', intention: 'Ship the hero section' },
    { title: 'Slow day', content: 'Low energy, skipped the evening routine. Need earlier nights.', wins: ['Cleared inbox'], challenges: ['Slept 5.9h', 'Doomscrolled'], gratitude: ['A quiet evening'], lessons: 'Screens after 10pm cost me the next morning.', intention: 'Lights out by 22:30' },
    { title: 'Long run Saturday', content: '14 km felt strong. Fuelling with gels after 10 km worked.', wins: ['Long run PR'], challenges: [], gratitude: ['Cool weather', 'Running club'], lessons: 'Fuel early.', intention: 'Recovery yoga tomorrow' },
    { title: 'Planning week', content: 'Quarterly planning went well. Portfolio deadline feels tight but doable if I protect two focus blocks a day.', wins: ['Team aligned on onboarding v2'], challenges: ['Too many meetings'], gratitude: ['Priya’s feedback'], lessons: 'Block focus time before the calendar fills.', intention: 'Two 90-minute focus blocks' },
    { title: 'Reset', content: 'Sunday reset done: meal prep, laundry, budget check-in. Spending on dining is creeping up.', wins: ['Budget review'], challenges: ['Dining budget at 80%'], gratitude: ['Slow morning'], lessons: 'Cook twice more this week.', intention: 'No takeout Mon–Wed' },
  ];
  const journalEntries = [];
  for (const key of rangeKeys(d(-27), today)) {
    if (key !== today && chance(0.35)) continue;
    const t = journalTemplates[int(0, journalTemplates.length - 1)];
    journalEntries.push({ user: uid, date: key, ...t, tags: [pick(['reflection', 'work', 'running', 'health'])], ...stamp(key) });
  }
  await JournalEntry.insertMany(journalEntries, { timestamps: false });

  /* ───── Focus sessions ───── */
  const focusSessions = [];
  const focusTargets = [
    { label: 'Portfolio case study', goal: portfolio._id, project: siteProject._id },
    { label: 'DSA practice', goal: null, project: null },
    { label: 'Deep work: hero section', goal: portfolio._id, project: siteProject._id },
    { label: 'Reading', goal: reading._id, project: null },
    { label: 'Trip planning', goal: null, project: lisbonProject._id },
  ];
  for (const key of rangeKeys(d(-29), d(-1))) {
    const wd = dayOfWeek(key);
    const sessions = wd === 0 || wd === 6 ? int(0, 1) : int(0, 3);
    for (let i = 0; i < sessions; i++) {
      const target = pick(focusTargets);
      const planned = pick([25, 25, 45, 50, 90]);
      const focused = Math.round(planned * between(0.7, 1) * 60);
      const startedAt = at(key, `${String(int(8, 19)).padStart(2, '0')}:${pick(['00', '15', '30'])}`);
      focusSessions.push({ user: uid, mode: planned === 25 ? 'pomodoro' : 'custom', status: 'completed', label: target.label, goal: target.goal, project: target.project, plannedMinutes: planned, focusedSeconds: focused, startedAt, endedAt: new Date(startedAt.getTime() + focused * 1000), date: key });
    }
  }
  await FocusSession.insertMany(focusSessions);

  /* ───── Reminders ───── */
  await Reminder.insertMany(
    [
      { title: "Mom's birthday", category: 'birthday', date: d(9), recurrence: 'yearly', leadDays: 7, important: true, notes: 'Gift + dinner reservation at 18:30.' },
      { title: 'Credit card payment due', category: 'bill', date: d(4), recurrence: 'monthly', leadDays: 3, important: true },
      { title: 'Dentist checkup', category: 'appointment', date: d(2), time: '14:00', leadDays: 1 },
      { title: 'Replace water filter', category: 'other', date: d(-1), recurrence: 'monthly', leadDays: 2 },
      { title: 'Netflix subscription renews', category: 'renewal', date: d(11), recurrence: 'monthly', leadDays: 2 },
      { title: 'Car insurance renewal', category: 'renewal', date: d(18), recurrence: 'yearly', leadDays: 14, notes: 'Compare quotes before auto-renew.' },
      { title: 'Quarterly tax estimate', category: 'deadline', date: d(26), leadDays: 10, important: true },
      { title: 'Wedding anniversary', category: 'birthday', date: d(40), recurrence: 'yearly', leadDays: 14, important: true },
      { title: 'Domain name renewal — alexmorgan.dev', category: 'renewal', date: d(55), recurrence: 'yearly', leadDays: 30 },
      { title: 'Submit expense report', category: 'deadline', date: d(-2), completed: true, completedAt: at(d(-2), '16:00') },
      // Passport expiry is not listed here — the Passport DEMO document below carries its own
      // expiryDate, which generates a linked reminder automatically (the same way a real upload
      // with an expiry date does), rather than a second, disconnected one.
    ].map((r) => ({ ...r, user: uid })),
  );

  /* ───── Documents ───── */
  // Minimal, valid, single-page PDFs generated in-memory (no bundled assets, no external fetch) —
  // clearly labelled SAMPLE/DEMO so nobody mistakes them for real records.
  function demoPdf(title, lines) {
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const body = [
      `BT /F1 18 Tf 50 730 Td (${esc(title)}) Tj ET`,
      `BT /F1 9 Tf 50 708 Td (SAMPLE / DEMO DOCUMENT \\267 not a real record) Tj ET`,
      ...lines.map((line, i) => `BT /F1 11 Tf 50 ${674 - i * 20} Td (${esc(line)}) Tj ET`),
    ].join('\n');
    const objects = [
      '<</Type/Catalog/Pages 2 0 R>>',
      '<</Type/Pages/Kids[3 0 R]/Count 1>>',
      '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>',
      '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
      `<</Length ${Buffer.byteLength(body)}>>\nstream\n${body}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((obj, i) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefStart = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, 'latin1');
  }

  const storage = getStorage();
  async function seedDocument({ title, category, lines, expiryDate, remindDaysBefore = 30 }) {
    const buffer = demoPdf(title, lines);
    const storageKey = await storage.save({ buffer, mimeType: 'application/pdf', userId: String(uid) });
    const doc = new Document({
      user: uid,
      title,
      originalName: `${title.replace(/\s+/g, '-')}.pdf`,
      mimeType: 'application/pdf',
      size: buffer.length,
      storageKey,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      category,
      tags: ['demo'],
      notes: 'Sample document for demo purposes only — not a real record.',
      expiryDate: expiryDate ?? null,
      remindDaysBefore: expiryDate ? remindDaysBefore : null,
    });
    if (doc.expiryDate) {
      // Mirrors syncExpiryReminder() in controllers/documents.js, so the demo shows a real,
      // working document → reminder link exactly as the app creates one on a real upload.
      const reminder = await Reminder.create({
        user: uid, title: `${doc.title} expires`, date: doc.expiryDate, category: 'renewal',
        leadDays: Math.min(60, doc.remindDaysBefore), notes: `Renew or update "${doc.title}" before it expires.`, important: true,
      });
      doc.reminder = reminder._id;
    }
    await doc.save();
    return doc;
  }

  const [panCard, passport, resume, degree, insuranceDoc, bankStatement, flightItinerary, employmentLetter, utilityBill] = await Promise.all([
    seedDocument({ title: 'PAN Card DEMO', category: 'identity', lines: ['Permanent Account Number: ABCDE1234F', 'Name: Alex Morgan', 'Date of Birth: 14-03-1994', "Father's Name: Robert Morgan"] }),
    seedDocument({ title: 'Passport DEMO', category: 'identity', expiryDate: addMonths(today, 7), remindDaysBefore: 60, lines: ['Passport No: N1234567', 'Surname: MORGAN', 'Given Name: ALEX', 'Nationality: UNITED STATES OF AMERICA', 'Date of Issue: 12 Jan 2022'] }),
    seedDocument({ title: 'Resume DEMO', category: 'work', lines: ['Alex Morgan', 'Product Designer', '5+ years of experience in UX/UI design', 'Portfolio: alexmorgan.dev'] }),
    seedDocument({ title: 'Degree Certificate DEMO', category: 'education', lines: ['Bachelor of Design', 'State University', 'Conferred: May 2019'] }),
    seedDocument({ title: 'Insurance DEMO', category: 'insurance', expiryDate: d(150), lines: ['Policy Holder: Alex Morgan', 'Policy Number: INS-88213-HD', 'Coverage: Health Insurance', 'Provider: Demo Insurance Co.'] }),
    seedDocument({ title: 'Bank Statement DEMO', category: 'finance', lines: ['Account Holder: Alex Morgan', 'Account: Main Checking ••••4821', 'Statement Period: last month'] }),
    seedDocument({ title: 'Flight Itinerary DEMO', category: 'travel', lines: ['Flight TP 1351', 'Lisbon (LIS) — Departs 07:40', 'Passenger: Alex Morgan', 'Booking Reference: DEMO123'] }),
    seedDocument({ title: 'Employment Letter DEMO', category: 'work', lines: ['To Whom It May Concern,', 'This confirms Alex Morgan is employed at Northwind Labs.', 'Position: Product Designer — Since March 2021'] }),
    seedDocument({ title: 'Utility Bill DEMO', category: 'bills', lines: ['Account Holder: Alex Morgan', 'Service: Electricity', 'Billing Period: last month'] }),
  ]);
  void panCard; void passport; void degree; void insuranceDoc; void bankStatement; void employmentLetter; void utilityBill;

  /* ───── Links (life graph) ───── */
  const notesByTitle = Object.fromEntries((await Note.find({ user: uid }).select('title').lean()).map((n) => [n.title, n._id]));
  const tripEvent = await Event.findOne({ user: uid, title: 'Lisbon trip' }).select('_id').lean();
  const linkDefs = [
    [{ type: 'goal', id: portfolio._id }, { type: 'note', id: notesByTitle['Portfolio case study outline'] }],
    [{ type: 'goal', id: marathon._id }, { type: 'note', id: notesByTitle['Half marathon training plan'] }],
    [{ type: 'project', id: lisbonProject._id }, { type: 'note', id: notesByTitle['Lisbon trip itinerary'] }],
    [{ type: 'project', id: lisbonProject._id }, { type: 'event', id: tripEvent?._id }],
    [{ type: 'project', id: lisbonProject._id }, { type: 'document', id: flightItinerary._id }],
    [{ type: 'goal', id: reading._id }, { type: 'note', id: notesByTitle['Book notes: Atomic Habits'] }],
    [{ type: 'goal', id: portfolio._id }, { type: 'document', id: resume._id }],
  ].filter(([a, b]) => a.id && b.id);
  const order = (x, y) => (`${x.type}:${x.id}` <= `${y.type}:${y.id}` ? [x, y] : [y, x]);
  await Link.insertMany(linkDefs.map(([x, y]) => { const [a, b] = order(x, y); return { user: uid, a, b }; }));

  /* ───── Activity log (derived from the seeded history) ───── */
  const activity = [];
  for (const t of completedTasks) activity.push({ user: uid, type: 'task_completed', entityType: 'task', title: t.title, date: t.completedOn, createdAt: t.completedAt });
  for (const s of focusSessions) activity.push({ user: uid, type: 'focus_session_completed', entityType: 'focus', title: s.label, date: s.date, createdAt: s.endedAt, meta: { minutes: Math.round(s.focusedSeconds / 60) } });
  for (const j of journalEntries) activity.push({ user: uid, type: 'journal_created', entityType: 'journal', title: j.title, date: j.date, createdAt: at(j.date, '21:30') });
  for (const w of workouts.slice(-25)) activity.push({ user: uid, type: 'workout_logged', entityType: 'workout', title: w.title, date: w.date, createdAt: at(w.date, '08:00'), meta: { minutes: w.durationMin } });
  await ActivityLog.insertMany(activity.filter((a) => a.date <= today), { timestamps: false });

  return {
    user: DEMO_USER.email,
    counts: {
      goals: goalDocs.length, projects: 3, tasks: openTasks.length + completedTasks.length, habits: habits.length, habitLogs: habitLogs.length,
      notes: noteDefs.length, transactions: transactions.length, healthLogs: healthLogs.length, workouts: workouts.length,
      routines: routines.length, reminders: 12, journal: journalEntries.length, focusSessions: focusSessions.length, links: linkDefs.length,
      documents: 9,
    },
  };
}

const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isDirectRun) {
  if (env.isProd && !process.argv.includes('--force')) {
    console.error('✖ Refusing to seed demo data in production (pass --force to override).');
    process.exit(1);
  }
  try {
    await connectDB(env.MONGODB_URI);
    const result = await seedDemo();
    console.log('✓ Demo data seeded:', result.counts);
    console.log(`  Sign in with ${DEMO_USER.email} / ${DEMO_USER.password}`);
  } catch (err) {
    console.error('✖ Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}
