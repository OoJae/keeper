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
/**
 * REBASED 2026-08-24. The plan assumed the group opened Aug 20, but it was actually
 * created on Aug 24 — days 1-4 never happened. Backfilling them would stamp a week of
 * "history" with today's timestamps, which BUILD_PLAN §8 forbids ("Never fake a
 * timestamp; you don't need to"), and a judge scrolling the group would see it.
 *
 * So the sprint is four real days: Aug 24-27, recording and submitting on the 27th with
 * Aug 28 as buffer. The arc that carries the demo survives, because a three-day gap is
 * genuinely days: Lena asks on day 1, stays silent through days 2-3, and returns on
 * camera on day 4. See COMPRESSION below for the day mapping.
 */
export const DAY_ONE = { year: 2026, month: 8, day: 24 } as const;

/** Sprint day we record the demo video (BUILD_PLAN §6: Aug 26). */
export const RECORDING_DAY = 4;

/** Sprint day we submit on DoraHacks (BUILD_PLAN §6: Aug 27, a day early). */
export const SUBMISSION_DAY = 4;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Days are reckoned in the COMMUNITY's timezone, not the machine's.
 *
 * "Ada's Editing Lab" is in Hong Kong (+08:00), the connector already bins its day
 * boundaries there (KEEPER_UTC_OFFSET_MINUTES), and the submission deadline is HKT. The
 * seeder used to use the machine's local timezone instead, so on a laptop in WAT (+01:00)
 * it insisted it was still day 2 while the connector had already rolled over to day 3 —
 * seven hours where the two halves disagreed about what day the community was living in.
 *
 * Same env var as the connector, same default, so they cannot drift apart again.
 */
const OFFSET_MINUTES = (() => {
  const raw = Number(process.env['KEEPER_UTC_OFFSET_MINUTES']);
  return Number.isFinite(raw) && raw >= -840 && raw <= 840 ? raw : 480;
})();

/** Midday in the community's frame, so DST edges cannot knock the arithmetic over. */
function communityNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0) - OFFSET_MINUTES * 60_000);
}

const DAY_ONE_DATE = communityNoon(DAY_ONE.year, DAY_ONE.month, DAY_ONE.day);

/** The real date sprint day `n` falls on. */
export function dateForDay(n: number): Date {
  return new Date(DAY_ONE_DATE.getTime() + (n - 1) * MS_PER_DAY);
}

/** Which sprint day a real instant falls in, in the community's frame. */
export function dayForDate(date: Date = new Date()): number {
  const shifted = date.getTime() + OFFSET_MINUTES * 60_000;
  const dayStart = Math.floor(shifted / MS_PER_DAY) * MS_PER_DAY - OFFSET_MINUTES * 60_000;
  const noon = dayStart + 12 * 60 * 60 * 1000;
  return Math.round((noon - DAY_ONE_DATE.getTime()) / MS_PER_DAY) + 1;
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

/**
 * Real sprint day -> the scripted days it now carries. The original seven-day script is
 * kept verbatim in cast.ts (its content is good and its beats are load-bearing); this
 * only changes which real day each scripted day is posted on.
 *
 * day 1 (Aug 24) — the cast introduces itself AND Lena asks her export question, so the
 *                  open loop starts as early as physically possible.
 * day 2 (Aug 25) — Marco answers people; the community settles into its rhythm.
 * day 3 (Aug 26) — Marco again, Ada's new video lands, the spam drop appears.
 * day 4 (Aug 27) — recording day, then submission.
 *
 * Marco appearing helpfully on days 1, 2 and 3 is what makes the Top Contributor
 * nomination something the Mind actually watched happen, rather than a single instance.
 */
export const COMPRESSION: Record<number, readonly number[]> = {
  1: [1, 2],
  2: [3, 4],
  3: [5, 6],
  4: [7],
};

/** The scripted days that make up a real sprint day. */
export function scriptedDaysFor(realDay: number): readonly number[] {
  return COMPRESSION[realDay] ?? [];
}
