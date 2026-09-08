// Weekday convention everywhere: 0 = Sunday .. 6 = Saturday, matching JS
// Date.getDay() and Postgres extract(dow). Date keys are YYYY-MM-DD strings;
// they compare correctly with < and >.

const FALLBACK_TZ = "UTC";

function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return FALLBACK_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return FALLBACK_TZ;
  }
}

/** The calendar date (YYYY-MM-DD) of `date` as experienced in `timeZone`. */
export function dateKeyIn(timeZone: string | null | undefined, date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** The weekday (0=Sun..6=Sat) of the calendar date `dateKey`, tz-independent. */
export function weekdayOfKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

/** dateKey shifted by `days` calendar days (negative to go back). */
export function addDaysToKey(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** First day of the month containing `dateKey`. */
export function monthStartOfKey(dateKey: string): string {
  return `${dateKey.slice(0, 8)}01`;
}

/** Server-local date key; only for coarse query bounds, never day judgment. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
