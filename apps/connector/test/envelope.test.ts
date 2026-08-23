process.env['KEEPER_LOG_SILENT'] = '1';

import { serializeEnvelope } from '@keeper/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Mirror } from '../src/db/mirror.js';
import { RETURN_THRESHOLD_MS, buildEnvelope, classifyEventType, envelopeHandle } from '../src/pipeline/envelope.js';

const HKT = 480;
const TS = Date.UTC(2026, 7, 27, 6, 2, 11); // 2026-08-27T14:02:11+08:00

function snapshot(overrides: Partial<{ firstSeenMs: number; lastSeenMs: number | null }> = {}) {
  return {
    telegramId: 12345,
    handle: 'lena_learns',
    display: 'Lena',
    firstSeenMs: Date.UTC(2026, 7, 20, 2, 0, 0),
    lastSeenMs: Date.UTC(2026, 7, 24, 2, 0, 0),
    messageCount: 4,
    ...overrides,
  };
}

describe('classifyEventType — the 48h boundary', () => {
  it('treats a message exactly 48h after last_seen as an ordinary message', () => {
    const prior = snapshot({ lastSeenMs: TS - RETURN_THRESHOLD_MS });
    expect(classifyEventType('message', prior, TS)).toBe('message');
  });

  it('treats one millisecond past 48h as a return', () => {
    const prior = snapshot({ lastSeenMs: TS - RETURN_THRESHOLD_MS - 1 });
    expect(classifyEventType('message', prior, TS)).toBe('member_returned');
  });

  it('never calls a first-timer a return', () => {
    expect(classifyEventType('message', undefined, TS)).toBe('message');
    expect(classifyEventType('message', snapshot({ lastSeenMs: null }), TS)).toBe('message');
  });

  it('maps the non-message kinds straight through', () => {
    expect(classifyEventType('join', undefined, TS)).toBe('member_joined');
    expect(classifyEventType('creator_command', snapshot(), TS)).toBe('creator_command');
    expect(classifyEventType('scheduled_digest', snapshot(), TS)).toBe('scheduled_digest');
  });
});

describe('buildEnvelope', () => {
  it('fills first_seen/last_seen from the mirror and serializes the spec wire format', () => {
    const event = buildEnvelope({
      kind: 'message',
      prior: snapshot(),
      member: { telegramId: 12345, handle: 'lena_learns', display: 'Lena' },
      content: 'back at last — did anyone ever figure out the choppy exports thing?',
      ts: new Date(TS),
      group: "Ada's Editing Lab",
      utcOffsetMinutes: HKT,
    });

    expect(event.type).toBe('member_returned');
    expect(serializeEnvelope(event)).toBe(
      [
        '[KEEPER-EVENT]',
        'type: member_returned',
        'member: @lena_learns (id:12345, display:"Lena")',
        'first_seen: 2026-08-20',
        'last_seen: 2026-08-24 (3 days ago)',
        'group: "Ada\'s Editing Lab"',
        'ts: 2026-08-27T14:02:11+08:00',
        '---',
        'back at last — did anyone ever figure out the choppy exports thing?',
      ].join('\n'),
    );
  });

  it('omits last_seen entirely for a member we have never seen', () => {
    const event = buildEnvelope({
      kind: 'message',
      prior: undefined,
      member: { telegramId: 777, handle: 'new_kid_kai', display: 'Kai' },
      content: 'hi everyone',
      ts: new Date(TS),
      group: "Ada's Editing Lab",
      utcOffsetMinutes: HKT,
    });
    expect(event.lastSeen).toBeUndefined();
    expect(serializeEnvelope(event)).not.toContain('last_seen');
    expect(serializeEnvelope(event)).toContain('first_seen: 2026-08-27');
  });

  it('synthesises a handle for Telegram users who have no username', () => {
    expect(envelopeHandle(null, 42)).toBe('@user42');
    expect(envelopeHandle('  @rex_hotkeys ', 42)).toBe('@rex_hotkeys');
  });
});

describe('envelope construction from real mirror state', () => {
  let mirror: Mirror;

  beforeEach(() => {
    mirror = Mirror.open(':memory:');
  });
  afterEach(() => {
    mirror.close();
  });

  function envelopeFor(telegramId: number, tsMs: number, kind: 'message' | 'join' = 'message') {
    const { prior } = mirror.touchMember({
      telegramId,
      handle: 'lena_learns',
      display: 'Lena',
      tsMs,
      spoke: kind === 'message',
    });
    return buildEnvelope({
      kind,
      prior,
      member: { telegramId, handle: 'lena_learns', display: 'Lena' },
      content: 'x',
      ts: new Date(tsMs),
      group: 'g',
      utcOffsetMinutes: HKT,
    });
  }

  it('reads prior state, not post-update state (otherwise nothing is ever a return)', () => {
    const day1 = Date.UTC(2026, 7, 20, 2, 0, 0);
    expect(envelopeFor(1, day1).type).toBe('message');

    // Same day, second message: still an ordinary message.
    expect(envelopeFor(1, day1 + 60_000).type).toBe('message');

    // Three days later: a return.
    const returned = envelopeFor(1, day1 + 3 * 86_400_000);
    expect(returned.type).toBe('member_returned');
    expect(returned.lastSeen?.getTime()).toBe(day1 + 60_000);
    expect(returned.firstSeen.getTime()).toBe(day1);
  });

  it('does not let a join advance last_seen, so the first real message still reads correctly', () => {
    const joinedAt = Date.UTC(2026, 7, 20, 2, 0, 0);
    expect(envelopeFor(2, joinedAt, 'join').type).toBe('member_joined');

    const firstWords = envelopeFor(2, joinedAt + 5 * 60_000);
    expect(firstWords.type).toBe('message');
    expect(firstWords.lastSeen).toBeUndefined();
    expect(mirror.getMember(2)?.messageCount).toBe(1);
  });
});
