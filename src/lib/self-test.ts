/**
 * On-device tests for the pure logic ported from the web app.
 *
 * These run on Hermes rather than in Node on purpose. The whole app's
 * day-boundary behaviour rests on Intl.DateTimeFormat honouring an IANA
 * `timeZone`, and Hermes is a different engine from V8 with its own Intl
 * implementation. A green Node test would prove nothing about the phone.
 *
 * Every `expected` value below was computed with Node's Intl beforehand, so a
 * failure here means Hermes disagrees with the reference implementation.
 */
import { addDaysToKey, dateKeyIn, monthStartOfKey, weekdayOfKey } from '@/lib/dates';
import { computeStreaks, type StreakSide } from '@/lib/streaks';
import { THEMES, themeFor, otherCharacter } from '@/lib/theme';
import type { DaySchedule, Task, TaskCompletion } from '@/lib/types/database';

export interface TestResult {
  group: string;
  name: string;
  pass: boolean;
  expected: string;
  actual: string;
}

const results: TestResult[] = [];

function check(group: string, name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ group, name, pass: a === e, expected: e, actual: a });
}

// ---------------------------------------------------------------- fixtures

const U1 = 'u1';
const U2 = 'u2';

function task(over: Partial<Task> & Pick<Task, 'id' | 'assigned_to'>): Task {
  return {
    couple_id: 'c1',
    title: 'goal',
    scheduled_weekdays: [0, 1, 2, 3, 4, 5, 6],
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  } as Task;
}

/** an approved completion of `taskId` on `dateKey` */
function done(taskId: string, dateKey: string, by = U1): TaskCompletion {
  return {
    id: `${taskId}-${dateKey}`,
    task_id: taskId,
    submitted_by: by,
    photo_url: 'p.jpg',
    status: 'approved',
    scheduled_date: dateKey,
    reviewed_by: by === U1 ? U2 : U1,
    submitted_at: `${dateKey}T10:00:00Z`,
    reviewed_at: `${dateKey}T11:00:00Z`,
  };
}

const utcSides: [StreakSide, StreakSide] = [
  { userId: U1, timezone: 'UTC' },
  { userId: U2, timezone: 'UTC' },
];

// noon UTC on Sunday 2026-03-15
const NOW = new Date('2026-03-15T12:00:00Z');

// ------------------------------------------------------------------ dates

export function runSelfTests(): TestResult[] {
  results.length = 0;

  check('dates', 'dateKeyIn UTC', dateKeyIn('UTC', new Date('2026-03-15T12:00:00Z')), '2026-03-15');
  check(
    'dates',
    'dateKeyIn Tokyo rolls forward',
    dateKeyIn('Asia/Tokyo', new Date('2026-03-15T20:00:00Z')),
    '2026-03-16',
  );
  check(
    'dates',
    'dateKeyIn LA rolls back',
    dateKeyIn('America/Los_Angeles', new Date('2026-03-15T04:00:00Z')),
    '2026-03-14',
  );
  check(
    'dates',
    'dateKeyIn Istanbul',
    dateKeyIn('Europe/Istanbul', new Date('2026-03-15T22:30:00Z')),
    '2026-03-16',
  );
  check(
    'dates',
    'invalid tz falls back to UTC',
    dateKeyIn('Not/AZone', new Date('2026-03-15T12:00:00Z')),
    '2026-03-15',
  );
  check('dates', 'null tz falls back to UTC', dateKeyIn(null, new Date('2026-03-15T12:00:00Z')), '2026-03-15');
  check('dates', 'weekdayOfKey sunday=0', weekdayOfKey('2026-03-15'), 0);
  check('dates', 'weekdayOfKey monday=1', weekdayOfKey('2026-03-16'), 1);
  check('dates', 'addDaysToKey month boundary', addDaysToKey('2026-02-28', 1), '2026-03-01');
  check('dates', 'addDaysToKey year boundary back', addDaysToKey('2026-01-01', -1), '2025-12-31');
  check('dates', 'addDaysToKey leap year', addDaysToKey('2024-02-28', 1), '2024-02-29');
  check('dates', 'monthStartOfKey', monthStartOfKey('2026-03-15'), '2026-03-01');

  // ---------------------------------------------------------------- streaks

  // A. three consecutive fully-done days, then a miss
  {
    const tasks = [task({ id: 't1', assigned_to: U1 }), task({ id: 't2', assigned_to: U2 })];
    const completions = [
      done('t1', '2026-03-15'), done('t1', '2026-03-14'), done('t1', '2026-03-13'),
      done('t2', '2026-03-15', U2), done('t2', '2026-03-14', U2), done('t2', '2026-03-13', U2),
    ];
    const s = computeStreaks(utcSides, tasks, completions, [], NOW);
    check('streaks', 'own streaks count consecutive days', s.ownStreaks, [3, 3]);
    check('streaks', 'couple streak needs both sides', s.coupleStreak, 3);
  }

  // B. a rest day is skipped, never broken
  {
    const tasks = [task({ id: 't1', assigned_to: U1, scheduled_weekdays: [1] })]; // mondays only
    const completions = [done('t1', '2026-03-09')]; // the monday before
    const s = computeStreaks(utcSides, tasks, completions, [], NOW);
    check('streaks', 'unscheduled days do not break a streak', s.ownStreaks[0], 1);
  }

  // C. today is still in progress — cannot break anything
  {
    const tasks = [task({ id: 't1', assigned_to: U1 })];
    const completions = [done('t1', '2026-03-14'), done('t1', '2026-03-13')]; // nothing today
    const s = computeStreaks(utcSides, tasks, completions, [], NOW);
    check('streaks', 'unfinished today does not break', s.ownStreaks[0], 2);
  }

  // D. a frozen day_schedules record wins over today's weekday settings.
  //    t1 is now sunday-only, but the record says it was scheduled on
  //    saturday the 14th — so the 14th must still count.
  {
    const tasks = [task({ id: 't1', assigned_to: U1, scheduled_weekdays: [0] })];
    const completions = [done('t1', '2026-03-14')]; // a saturday
    const schedules: DaySchedule[] = [
      { user_id: U1, date_key: '2026-03-14', task_ids: ['t1'], updated_at: '2026-03-14T23:00:00Z' },
    ];
    const withRecord = computeStreaks(utcSides, tasks, completions, schedules, NOW);
    const withoutRecord = computeStreaks(utcSides, tasks, completions, [], NOW);
    check('streaks', 'frozen schedule credits the day', withRecord.ownStreaks[0], 1);
    check('streaks', 'without the record that day is free', withoutRecord.ownStreaks[0], 0);
  }

  // E. an archived goal stops being expected from its archive date on
  {
    const tasks = [
      task({ id: 't1', assigned_to: U1, archived_at: '2026-03-14T00:00:00Z' }),
    ];
    const completions = [done('t1', '2026-03-13')];
    const s = computeStreaks(utcSides, tasks, completions, [], NOW);
    check('streaks', 'archived goal is not expected after archiving', s.ownStreaks[0], 1);
  }

  // F. partners in different timezones are on different calendar days
  {
    const split: [StreakSide, StreakSide] = [
      { userId: U1, timezone: 'Asia/Tokyo' },
      { userId: U2, timezone: 'America/Los_Angeles' },
    ];
    const at = new Date('2026-03-15T20:00:00Z');
    check('streaks', 'tokyo side is already on the 16th', dateKeyIn(split[0].timezone, at), '2026-03-16');
    check('streaks', 'LA side is still on the 15th', dateKeyIn(split[1].timezone, at), '2026-03-15');

    // month grid is framed by the VIEWER (side 0) — tokyo, so it runs to the 16th
    const s = computeStreaks(split, [task({ id: 't1', assigned_to: U1 })], [], [], at);
    check('streaks', 'month grid ends on the viewer today', s.monthDays.length, 16);
    check('streaks', 'month grid starts at the 1st', s.monthDays[0].dateKey, '2026-03-01');
  }

  // G. a goal created mid-month is not expected before it existed
  {
    const tasks = [task({ id: 't1', assigned_to: U1, created_at: '2026-03-14T00:00:00Z' })];
    const completions = [done('t1', '2026-03-14'), done('t1', '2026-03-15')];
    const s = computeStreaks(utcSides, tasks, completions, [], NOW);
    check('streaks', 'days before a goal existed are free', s.ownStreaks[0], 2);
  }

  // ------------------------------------------------------------------ theme

  // themeFor mirrors the web's defaulting: anything that is not "baris" is mae
  check('theme', 'themeFor baris', themeFor('baris').key, 'baris');
  check('theme', 'themeFor mae', themeFor('mae').key, 'mae');
  check('theme', 'themeFor null defaults to mae', themeFor(null).key, 'mae');
  check('theme', 'themeFor junk defaults to mae', themeFor('nonsense').key, 'mae');
  check('theme', 'otherCharacter flips', otherCharacter('mae'), 'baris');

  // Metro turns require()d images into numeric asset ids at bundle time. A
  // missing file would fail the build, but a mis-wired alias could yield
  // undefined — so assert every chibi actually resolved.
  const imageKeys = ['cutePoseImg', 'waveImg', 'madImg', 'faceImg'] as const;
  const unresolved: string[] = [];
  for (const key of ['mae', 'baris'] as const) {
    for (const field of imageKeys) {
      if (THEMES[key][field] == null) unresolved.push(`${key}.${field}`);
    }
  }
  check('theme', 'all 8 chibi images resolved', unresolved, []);
  check('theme', 'mae stage gradient shape', THEMES.mae.stageGradient, {
    inner: '#FFD1E3',
    outer: '#FFE3EE',
    centerY: 0.8,
  });

  return [...results];
}
