import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, isDateKey, nextOccurrence, startOfWeek } from '../src/utils/dates.js';
import { computeHabitStats } from '../src/services/habits.js';
import { htmlToText, sanitizeNoteHtml } from '../src/utils/html.js';

describe('date utilities', () => {
  it('validates date keys strictly', () => {
    assert.equal(isDateKey('2026-02-28'), true);
    assert.equal(isDateKey('2026-02-30'), false);
    assert.equal(isDateKey('2026-2-3'), false);
  });

  it('adds days and months with month-end clamping', () => {
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2024-02-29', 12), '2025-02-28');
  });

  it('computes week starts and recurrences', () => {
    assert.equal(startOfWeek('2026-09-17', 1), '2026-09-14'); // Thursday → Monday
    assert.equal(startOfWeek('2026-09-17', 0), '2026-09-13'); // → Sunday
    assert.equal(nextOccurrence('2026-09-15', 'weekly', 2), '2026-09-29');
    assert.equal(nextOccurrence('2026-09-15', 'yearly'), '2027-09-15');
    assert.equal(nextOccurrence('2026-09-15', 'none'), null);
  });
});

describe('habit stats', () => {
  const createdAt = new Date('2026-08-01T00:00:00Z');

  it('does not break a daily streak when today is not yet done', () => {
    const habit = { frequency: 'daily', days: [], createdAt };
    const stats = computeHabitStats(habit, ['2026-09-12', '2026-09-13', '2026-09-14'], '2026-09-15');
    assert.equal(stats.currentStreak, 3);
    assert.equal(stats.doneToday, false);
  });

  it('skips unscheduled days for weekday habits', () => {
    const habit = { frequency: 'daily', days: [1, 3, 5], createdAt }; // Mon/Wed/Fri
    // Mon 7, Wed 9, Fri 11, Mon 14 → streak 4 on Tue 15
    const stats = computeHabitStats(habit, ['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14'], '2026-09-15');
    assert.equal(stats.currentStreak, 4);
    assert.equal(stats.scheduledToday, false);
  });

  it('counts weekly streaks by target', () => {
    const habit = { frequency: 'weekly', timesPerWeek: 2, createdAt };
    const dates = ['2026-08-31', '2026-09-02', '2026-09-07', '2026-09-08', '2026-09-14'];
    const stats = computeHabitStats(habit, dates, '2026-09-15', 1);
    assert.equal(stats.currentStreak, 2); // current week (1/2) doesn't break it
    assert.equal(stats.weekCount, 1);
    assert.equal(stats.streakUnit, 'week');
  });
});

describe('note sanitization', () => {
  it('strips scripts and unsafe attributes but keeps formatting', () => {
    const dirty = '<p onclick="x()">Hi <strong>there</strong></p><script>alert(1)</script><a href="javascript:alert(1)">bad</a>';
    const clean = sanitizeNoteHtml(dirty);
    assert.ok(!clean.includes('script'));
    assert.ok(!clean.includes('onclick'));
    assert.ok(!clean.includes('javascript:'));
    assert.ok(clean.includes('<strong>there</strong>'));
    assert.equal(htmlToText('<p>A &amp; B</p><p>C</p>'), 'A & B C');
  });
});
