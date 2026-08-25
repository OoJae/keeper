import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Mirror, MirrorLinkError } from '../src/db/mirror.js';
import { EventRouter } from '../src/pipeline/router.js';
import { SequentialQueue } from '../src/pipeline/queue.js';
import { FakeSurface, FakeTransport, testConfig } from './fakes.js';

const GROUP = -1001;
const SYNTHETIC = -2567697543; // what the seeded @lena_learns is known by
const REAL = 856123419; // her real Telegram account
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 27, 6, 0, 0);

let mirror: Mirror;
afterEach(() => mirror.close());

describe('member aliases', () => {
  beforeEach(() => {
    mirror = Mirror.open(':memory:');
  });

  it('passes through an id that is not aliased', () => {
    expect(mirror.resolveCanonicalId(REAL)).toBe(REAL);
  });

  it('resolves a linked id to the identity the Mind knows', () => {
    mirror.touchMember({ telegramId: SYNTHETIC, handle: 'lena_learns', display: 'Lena', tsMs: NOW - 4 * DAY, spoke: true });
    mirror.linkMember({ realTelegramId: REAL, canonicalTelegramId: SYNTHETIC, handle: 'lena_learns', tsMs: NOW });
    expect(mirror.resolveCanonicalId(REAL)).toBe(SYNTHETIC);
  });

  it('is idempotent, and refuses a conflicting relink without --force', () => {
    mirror.touchMember({ telegramId: SYNTHETIC, handle: 'lena_learns', display: 'Lena', tsMs: NOW, spoke: true });
    mirror.touchMember({ telegramId: -999, handle: 'other', display: 'Other', tsMs: NOW, spoke: true });
    const link = { realTelegramId: REAL, canonicalTelegramId: SYNTHETIC, handle: 'lena_learns', tsMs: NOW };
    expect(mirror.linkMember(link).status).toBe('linked');
    expect(mirror.linkMember(link).status).toBe('already_linked');
    expect(() =>
      mirror.linkMember({ ...link, canonicalTelegramId: -999 }),
    ).toThrow(MirrorLinkError);
    expect(mirror.linkMember({ ...link, canonicalTelegramId: -999, force: true }).status).toBe('relinked');
  });

  it('merges a real account that had already started its own history', () => {
    // The likely live case: she posts once before you remember to run the CLI.
    mirror.touchMember({ telegramId: SYNTHETIC, handle: 'lena_learns', display: 'Lena', tsMs: NOW - 4 * DAY, spoke: true });
    mirror.recordEvent({ memberTelegramId: SYNTHETIC, chatId: GROUP, messageId: 1, type: 'message', content: 'exports are choppy', tsMs: NOW - 4 * DAY, routed: true, routeReason: 'heuristic:question' });
    mirror.touchMember({ telegramId: REAL, handle: 'lena_learns', display: 'Lena', tsMs: NOW, spoke: true });
    mirror.recordEvent({ memberTelegramId: REAL, chatId: GROUP, messageId: 2, type: 'message', content: 'hello again', tsMs: NOW, routed: false, routeReason: 'x' });

    const outcome = mirror.linkMember({ realTelegramId: REAL, canonicalTelegramId: SYNTHETIC, handle: 'lena_learns', tsMs: NOW });

    expect(outcome.merged?.eventsMoved).toBe(1);
    expect(outcome.merged?.messageCount).toBe(2);
    // Earliest first_seen survives — that date is the evidence on camera.
    expect(outcome.merged?.firstSeenMs).toBe(NOW - 4 * DAY);
    expect(mirror.getMember(REAL)).toBeUndefined();
    expect(mirror.findMemberByHandle('lena_learns')?.telegramId).toBe(SYNTHETIC);
  });

  it('unlinks', () => {
    mirror.touchMember({ telegramId: SYNTHETIC, handle: 'lena_learns', display: 'Lena', tsMs: NOW, spoke: true });
    mirror.linkMember({ realTelegramId: REAL, canonicalTelegramId: SYNTHETIC, handle: 'lena_learns', tsMs: NOW });
    expect(mirror.unlinkMember(REAL)).toBe(true);
    expect(mirror.resolveCanonicalId(REAL)).toBe(REAL);
    expect(mirror.unlinkMember(REAL)).toBe(false);
  });

  it('THE DEMO BEAT: a message from her real account is a member_returned as the seeded Lena', async () => {
    // Seeded four days ago through the bot relay, then silent. She returns on camera from a
    // real phone. If this test ever goes red the highest-scoring 25 seconds of the video
    // does not work.
    mirror.touchMember({ telegramId: SYNTHETIC, handle: 'lena_learns', display: 'Lena', tsMs: NOW - 4 * DAY, spoke: true });
    mirror.linkMember({ realTelegramId: REAL, canonicalTelegramId: SYNTHETIC, handle: 'lena_learns', tsMs: NOW });

    const surface = new FakeSurface();
    const transport = new FakeTransport(
      '```json\n{"action":"reply","target_member":"@lena_learns","message":"Welcome back Lena — did the export fix land?","reasoning":"returning member, open loop","confidence":"high"}\n```',
    );
    const queue = new SequentialQueue({ maxPending: 5, onError: () => {} });
    const router = new EventRouter({
      mirror,
      surface,
      transport,
      queue,
      config: testConfig({ groupChatId: GROUP, creatorTelegramId: 900 }),
      now: () => NOW,
    });

    const decision = router.ingest({
      kind: 'message',
      member: { telegramId: REAL, handle: 'lena_learns', display: 'Lena' },
      text: "ok I'm back — did anyone crack the stuttery export thing?",
      chatId: GROUP,
      messageId: 77,
      tsMs: NOW,
    });
    await queue.drain();

    expect(decision.type).toBe('member_returned');
    // The envelope must carry the identity the Mind memorised, not the new account.
    const envelope = transport.sentEnvelopes[0] ?? '';
    expect(envelope).toContain(`member: @lena_learns (id:${SYNTHETIC}`);
    expect(envelope).toContain('type: member_returned');
    expect(envelope).toContain('(4 days ago)');
    // And exactly one member, not a second Lena.
    expect(mirror.listMembers()).toHaveLength(1);
    expect(surface.groupMessages).toHaveLength(1);
  });
});
