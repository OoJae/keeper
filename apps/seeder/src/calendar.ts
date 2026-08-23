/**
 * Sprint day <-> real calendar date.
 *
 * Day 1 is 2026-08-20, the day the demo group was created (BUILD_PLAN.md §6). Every
 * other date in the sprint is derived from that one constant, so there is exactly one
 * place to look when "what day are we on?" comes up.
 *
 * WHY THIS FILE EXISTS AT ALL: BUILD_PLAN §8 forbids faking a timestamp. The temptation
 * this guards against is the 2am one — running day 6's script on day 4 "to get ahead", or
 * re-running day 2 late "because I missed it". Both produce a group whose visible history
 * disagrees with the story we tell judges. The seeder therefore always knows today's
 * sprint day, prints the real date it is about to write into, and makes the operator opt
 * in loudly (--anyway) before posting a day's script on the wrong date.
 *
 * There is deliberately NO way to set a message's timestamp. Telegram stamps messages
 * server-side at send time and we never touch it — that is the whole point.
 */

/** Day 1 of the sprint: the day the demo group opened. Local time; HK has no DST. */
export const DAY_ONE = { year: 2026, month: 8, day: 20 } as const;

/** Sprint day we record the demo video (BUILD_PLAN §6: Aug 26). */
export const RECORDING_DAY = 7;

/** Sprint day we submit on DoraHacks (BUILD_PLAN §6: Aug 27, a day early). */
export const SUBMISSION_DAY = 8;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Noon local time, so day arithmetic can never be knocked over by a DST edge. */
function localNoon(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

const DAY_ONE_DATE = localNoon(DAY_ONE.year, DAY_ONE.month, DAY_ONE.day);

/** The real date sprint day `n` falls on. */
export function dateForDay(n: number): Date {
  return new Date(DAY_ONE_DATE.getTime() + (n - 1) * MS_PER_DAY);
}

/** Which sprint day a real date is. Day 1 = 2026-08-20; can return <1 or >8. */
export function dayForDate(date: Date = new Date()): number {
  const noon = localNoon(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return Math.round((noon.getTime() - DAY_ONE_DATE.getTime()) / MS_PER_DAY) + 1;
}

/** Today's sprint day. */
export function today(): number {
  return dayForDate(new Date());
}

/** "Sun 23 Aug" — short enough for a header line. */
export function shortDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "2026-08-23" — for anything that gets pasted into docs. */
export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type DayTiming = 'today' | 'past' | 'future';

export function timingOf(n: number): DayTiming {
  const now = today();
  if (n === now) return 'today';
  return n < now ? 'past' : 'future';
}

/** "day 4 · Sun 23 Aug (today)" — the header every command prints before it acts. */
export function describeDay(n: number): string {
  const date = dateForDay(n);
  const timing = timingOf(n);
  const now = today();
  const suffix =
    timing === 'today'
      ? 'today'
      : timing === 'past'
        ? `${now - n} day${now - n === 1 ? '' : 's'} ago`
        : `in ${n - now} day${n - now === 1 ? '' : 's'}`;
  return `day ${n} · ${shortDate(date)} (${suffix})`;
}
