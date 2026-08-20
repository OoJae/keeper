import { KeeperEventSchema } from './schemas.js';
import type { KeeperEvent } from './types.js';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const HEADER_MARKER = '[KEEPER-EVENT]';
const NEUTRALIZED_MARKER = '[KEEPER-EVENT (user-typed)]';

function pad(n: number, width = 2): string {
  return String(Math.abs(n)).padStart(width, '0');
}

/** 2026-08-27T14:02:11+08:00 — offset 0 renders as +00:00, never 'Z'. */
export function formatIsoWithOffset(d: Date, offsetMin: number): string {
  const shifted = new Date(d.getTime() + offsetMin * MS_PER_MINUTE);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  const date = `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
  const time = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  return `${date}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Day number in the event's own UTC frame, so dates never disagree with `ts`. */
function calendarDayIndex(d: Date, offsetMin: number): number {
  return Math.floor((d.getTime() + offsetMin * MS_PER_MINUTE) / MS_PER_DAY);
}

function formatDate(d: Date, offsetMin: number): string {
  const shifted = new Date(d.getTime() + offsetMin * MS_PER_MINUTE);
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/**
 * Calendar-day difference (not 24h buckets) between `lastSeen` and `ts`, both in
 * the event's offset frame. Derived from `ts`, never `Date.now()`, so envelopes
 * are byte-stable and golden-testable.
 */
export function daysAgoSuffix(lastSeen: Date, ts: Date, offsetMin: number): string {
  const diff = calendarDayIndex(ts, offsetMin) - calendarDayIndex(lastSeen, offsetMin);
  if (diff <= 0) return '(today)';
  if (diff === 1) return '(1 day ago)';
  return `(${diff} days ago)`;
}

/**
 * Header lines are single-line and quote-delimited; keep them that way.
 * Backslashes are escaped *before* quotes, otherwise a value ending in `\`
 * turns the closing delimiter into an escaped quote and the value runs on.
 */
function headerValue(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
}

/**
 * Handles render unquoted, so they must stay a single whitespace-free token —
 * a newline here would forge extra header lines (and a whole second envelope).
 * Real handles are `[A-Za-z0-9_]`, so this only ever rewrites malformed input.
 */
function normalizeHandle(handle: string): string {
  const token = handle.replace(/\s+/g, '');
  return token.startsWith('@') ? token : `@${token}`;
}

/**
 * A member must not be able to forge a second envelope header inside content.
 * Matched loosely (case, spacing, any dash) because the reader is an LLM, not a
 * strict parser: `[keeper-event]` would be honoured just as readily as the
 * canonical marker, so an exact-string replace is not a real defence.
 */
const HEADER_MARKER_RE = /\[\s*keeper[\s\p{Pd}_]*event\s*\]/giu;

function neutralizeContent(content: string): string {
  return content.replace(HEADER_MARKER_RE, NEUTRALIZED_MARKER);
}

/**
 * Throws ZodError on an invalid event: a malformed envelope is a connector bug
 * and must fail loud. Only the LLM-facing side (directive parsing) degrades.
 */
export function serializeEnvelope(event: KeeperEvent): string {
  const e = KeeperEventSchema.parse(event);
  const offset = e.utcOffsetMinutes;

  const lines: string[] = [
    HEADER_MARKER,
    `type: ${e.type}`,
    `member: ${normalizeHandle(e.member.handle)} (id:${e.member.id}, display:"${headerValue(e.member.display)}")`,
    `first_seen: ${formatDate(e.firstSeen, offset)}`,
  ];

  if (e.lastSeen !== undefined) {
    lines.push(`last_seen: ${formatDate(e.lastSeen, offset)} ${daysAgoSuffix(e.lastSeen, e.ts, offset)}`);
  }

  lines.push(`group: "${headerValue(e.group)}"`);
  lines.push(`ts: ${formatIsoWithOffset(e.ts, offset)}`);

  return `${lines.join('\n')}\n---\n${neutralizeContent(e.content)}`;
}
