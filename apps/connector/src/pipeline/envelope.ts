/**
 * Member Identity Envelope construction (BUILD_PLAN §3.1).
 *
 * The serialization itself lives in `@keeper/protocol`; this module's only job is to
 * decide the event TYPE and fill in first_seen/last_seen from the mirror. Both inputs
 * are values, never `Date.now()`, so the whole thing is a pure function and the 48h
 * boundary is testable to the millisecond.
 */
import type { EventType, KeeperEvent } from '@keeper/protocol';

import type { MemberSnapshot } from '../db/mirror.js';

/**
 * BUILD_PLAN Phase 3: a member whose last message is more than 48h old is a
 * `member_returned`, which the charter turns into a history-referencing welcome-back.
 */
export const RETURN_THRESHOLD_MS = 48 * 60 * 60 * 1000;

export type RawEventKind = 'message' | 'join' | 'creator_command' | 'scheduled_digest';

export interface EnvelopeInput {
  kind: RawEventKind;
  /** Mirror state BEFORE this event. Undefined = we have never seen this member. */
  prior: MemberSnapshot | undefined;
  member: { telegramId: number; handle: string | null; display: string };
  content: string;
  ts: Date;
  group: string;
  utcOffsetMinutes: number;
}

/**
 * Telegram usernames are optional, and `@keeper/protocol` requires a non-empty handle
 * (it is the Mind's primary key for a member in prose). Synthesise a stable one from the
 * user id rather than inventing a name — the id is what actually identifies them.
 */
export function envelopeHandle(handle: string | null, telegramId: number): string {
  const trimmed = (handle ?? '').trim().replace(/^@+/, '');
  return trimmed === '' ? `@user${telegramId}` : `@${trimmed}`;
}

export function classifyEventType(
  kind: RawEventKind,
  prior: MemberSnapshot | undefined,
  tsMs: number,
): EventType {
  if (kind === 'join') return 'member_joined';
  if (kind === 'creator_command') return 'creator_command';
  if (kind === 'scheduled_digest') return 'scheduled_digest';

  const lastSeen = prior?.lastSeenMs;
  if (lastSeen === undefined || lastSeen === null) return 'message';
  return tsMs - lastSeen > RETURN_THRESHOLD_MS ? 'member_returned' : 'message';
}

export function buildEnvelope(input: EnvelopeInput): KeeperEvent {
  const tsMs = input.ts.getTime();
  const type = classifyEventType(input.kind, input.prior, tsMs);

  // A first-timer has no last_seen line at all (the protocol omits it when absent),
  // which is exactly the signal the charter uses to greet someone for the first time.
  const lastSeenMs = input.prior?.lastSeenMs ?? null;
  const firstSeenMs = input.prior?.firstSeenMs ?? tsMs;

  const event: KeeperEvent = {
    type,
    member: {
      handle: envelopeHandle(input.member.handle, input.member.telegramId),
      id: input.member.telegramId,
      display: input.member.display.trim() === '' ? `user${input.member.telegramId}` : input.member.display,
    },
    firstSeen: new Date(Math.min(firstSeenMs, tsMs)),
    group: input.group,
    ts: input.ts,
    utcOffsetMinutes: input.utcOffsetMinutes,
    content: input.content,
  };
  if (lastSeenMs !== null) event.lastSeen = new Date(lastSeenMs);
  return event;
}
