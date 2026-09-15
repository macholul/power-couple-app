import { addDaysToKey, dateKeyIn, monthStartOfKey, weekdayOfKey } from "@/lib/dates";
import type { DaySchedule, Task, TaskCompletion } from "@/lib/types/database";

export type DayLevel = 0 | 1 | 2 | 3; // missed | one done | both done | free / not settled yet

export interface StreakSide {
  userId: string;
  timezone: string | null;
}

export interface DayStatus {
  dateKey: string;
  /** goals scheduled that day, per side (0 = free day) */
  scheduled: [number, number];
  /** all scheduled goals confirmed, per side (vacuously true on free days) */
  done: [boolean, boolean];
  level: DayLevel;
}

const MAX_LOOKBACK_DAYS = 365;

export interface StreakSummary {
  coupleStreak: number;
  /** same order as the `sides` argument */
  ownStreaks: [number, number];
  /** the viewer's current month up to their today, oldest first */
  monthDays: DayStatus[];
}

/**
 * Streaks and the month grid, with each partner judged by their own local
 * calendar (sides can be in different timezones, so one can be on Tuesday
 * while the other is still finishing Monday).
 *
 * A calendar day D counts for a side when every goal scheduled on D is
 * confirmed; free days are skipped, not broken. A day that hasn't ended yet
 * in a side's timezone (D >= their today) can count once fully done but
 * never breaks a streak.
 *
 * Past days with a `day_schedules` record are judged ONLY against that
 * frozen record, so editing a goal's weekdays later can never rewrite
 * history. Days without a record (before the feature, or the app was never
 * opened) fall back to deriving the schedule from the current goals. Goals in
 * a record that are not among `tasks` belong to another couple and are
 * ignored.
 *
 * `sides[0]` is the viewer; their timezone frames the month grid.
 */
export function computeStreaks(
  sides: [StreakSide, StreakSide],
  tasks: Task[],
  completions: TaskCompletion[],
  daySchedules: DaySchedule[] = [],
  now: Date = new Date(),
): StreakSummary {
  const approved = new Set(
    completions
      .filter((completion) => completion.status === "approved")
      .map((completion) => `${completion.task_id}:${completion.scheduled_date}`),
  );

  const todayKeys = [dateKeyIn(sides[0].timezone, now), dateKeyIn(sides[1].timezone, now)] as const;

  // per side: goals owned by that side, with lifetime bounds in THEIR calendar
  const sideTasks = sides.map((side) =>
    tasks
      .filter((task) => task.assigned_to === side.userId)
      .map((task) => ({
        id: task.id,
        weekdays: task.scheduled_weekdays,
        createdKey: dateKeyIn(side.timezone, new Date(task.created_at)),
        archivedKey: task.archived_at
          ? dateKeyIn(side.timezone, new Date(task.archived_at))
          : null,
      })),
  );

  // per side: frozen schedule records keyed by their local date. Only this
  // couple's goals count: someone who paired before keeps the days they froze
  // back then, and those name goals this couple can neither see nor confirm.
  const coupleTaskIds = new Set(tasks.map((task) => task.id));
  const sideRecords = sides.map((side) => {
    const map = new Map<string, string[]>();
    for (const record of daySchedules) {
      if (record.user_id !== side.userId) continue;
      map.set(record.date_key, record.task_ids.filter((taskId) => coupleTaskIds.has(taskId)));
    }
    return map;
  });

  const sideStatus = (sideIndex: 0 | 1, dateKey: string) => {
    // a finished day with a frozen record is judged only against that record:
    // schedule edits made later can never change what the day expected
    if (dateKey < todayKeys[sideIndex]) {
      const frozen = sideRecords[sideIndex].get(dateKey);
      if (frozen) {
        let missing = 0;
        for (const taskId of frozen) {
          if (!approved.has(`${taskId}:${dateKey}`)) missing += 1;
        }
        return { scheduled: frozen.length, done: missing === 0 };
      }
    }

    const weekday = weekdayOfKey(dateKey);
    let scheduled = 0;
    let missing = 0;
    for (const task of sideTasks[sideIndex]) {
      if (!task.weekdays.includes(weekday)) continue;
      if (task.createdKey > dateKey) continue; // goal didn't exist yet that day
      if (task.archivedKey !== null && dateKey >= task.archivedKey) continue; // retired by then
      scheduled += 1;
      if (!approved.has(`${task.id}:${dateKey}`)) missing += 1;
    }
    return { scheduled, done: missing === 0 };
  };

  const statusAt = (dateKey: string): DayStatus => {
    const a = sideStatus(0, dateKey);
    const b = sideStatus(1, dateKey);
    const busySides = (a.scheduled > 0 ? 1 : 0) + (b.scheduled > 0 ? 1 : 0);
    const doneCount =
      (a.scheduled > 0 && a.done ? 1 : 0) + (b.scheduled > 0 && b.done ? 1 : 0);
    // a day that hasn't ended for one of the sides isn't settled yet
    const unsettled = dateKey >= todayKeys[0] || dateKey >= todayKeys[1];

    let level: DayLevel = 0;
    if (busySides === 0) level = 3;
    else if (doneCount === busySides) level = 2;
    else if (unsettled) level = 3;
    else if (doneCount > 0) level = 1;

    return {
      dateKey,
      scheduled: [a.scheduled, b.scheduled],
      done: [a.done, b.done],
      level,
    };
  };

  // own streak: walk that side's own calendar back from their today
  const ownStreakFor = (sideIndex: 0 | 1): number => {
    let streak = 0;
    let cursor = todayKeys[sideIndex];
    for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
      const { scheduled, done } = sideStatus(sideIndex, cursor);
      const dayOver = cursor < todayKeys[sideIndex];
      if (scheduled > 0 && done) streak += 1;
      else if (scheduled === 0 || !dayOver) {
        // free day, or a day still in progress: skip without breaking
      } else break;
      cursor = addDaysToKey(cursor, -1);
    }
    return streak;
  };

  // couple streak: a day counts once BOTH sides have completed it in their
  // own calendars; days not yet over for either side skip instead of break
  const coupleStreak = (() => {
    let streak = 0;
    let cursor = todayKeys[0] > todayKeys[1] ? todayKeys[0] : todayKeys[1];
    for (let i = 0; i < MAX_LOOKBACK_DAYS; i++) {
      const day = statusAt(cursor);
      const busy = day.scheduled[0] + day.scheduled[1] > 0;
      const bothDone = busy && day.done[0] && day.done[1];
      const unsettled = cursor >= todayKeys[0] || cursor >= todayKeys[1];
      if (bothDone) streak += 1;
      else if (!busy || unsettled) {
        // free or not over yet everywhere: skip without breaking
      } else break;
      cursor = addDaysToKey(cursor, -1);
    }
    return streak;
  })();

  // month grid framed by the viewer's calendar
  const monthDays: DayStatus[] = [];
  let cursor = monthStartOfKey(todayKeys[0]);
  while (cursor <= todayKeys[0]) {
    monthDays.push(statusAt(cursor));
    cursor = addDaysToKey(cursor, 1);
  }

  return {
    coupleStreak,
    ownStreaks: [ownStreakFor(0), ownStreakFor(1)],
    monthDays,
  };
}
