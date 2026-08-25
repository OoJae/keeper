import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Mirror } from '../src/db/mirror.js';
import { DigestScheduler, localDayKey, localTimeOnDay } from '../src/pipeline/digest.js';
import { testConfig } from './fakes.js';

const HK = 480; // +08:00
const config = testConfig({ groupChatId: -1001, creatorTelegramId: 900, utcOffsetMinutes: HK });

let mirror: Mirror;
let ingested: Array<{ kind: string; text: string; responseChatId?: number }>;
let sent: string[];

function scheduler(nowMs: number): DigestScheduler {
  return new DigestScheduler({
    mirror,
    router: {
      ingest: (input: { kind: string; text: string; responseChatId?: number }) => {
        ingested.push(input);
        return { eventId: 1, routed: true, reason: 'scheduled_digest', type: 'scheduled_digest' as const };
      },
    } as never,
    transport: {
      sendAndAwaitReply: async (_a: string, text: string) => {
        sent.push(text);
        return {};
      },
    },
    queue: { enqueue: (_k: string, job: () => Promise<void>) => { void job(); return true; } },
    config,
    now: () => nowMs,
  });
}

/** 21:00 Hong Kong on 2026-08-27, expressed in UTC ms. */
const NINE_PM_HK = Date.UTC(2026, 7, 27, 13, 0, 0);

beforeEach(() => {
  mirror = Mirror.open(':memory:');
  ingested = [];
  sent = [];
});
afterEach(() => mirror.close());

describe('local time helpers', () => {
  it('names the local day, not the UTC one', () => {
    // 23:30 UTC on the 26th is already the 27th in Hong Kong.
    expect(localDayKey(Date.UTC(2026, 7, 26, 23, 30), HK)).toBe('2026-08-27');
  });

  it('places 21:00 local correctly', () => {
    expect(localTimeOnDay(NINE_PM_HK, HK, 21 * 60)).toBe(NINE_PM_HK);
  });
});

describe('DigestScheduler', () => {
  it('arms the Mind once, ahead of time, and asks it to choose the moment', () => {
    const s = scheduler(NINE_PM_HK - 2 * 60 * 60 * 1000); // inside the 3h lead
    s.tick();
    s.tick(); // idempotent for the day
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/on your own initiative/i);
    expect(sent[0]).toMatch(/do not send the digest now/i);
  });

  it('does not fall back when the Mind delivered one itself', () => {
    const s = scheduler(NINE_PM_HK - 2 * 60 * 60 * 1000);
    s.tick();
    s.markDelivered(NINE_PM_HK, 'mind');
    const later = scheduler(NINE_PM_HK + 2 * 60 * 60 * 1000); // past the cutoff
    later.tick();
    expect(ingested).toHaveLength(0);
  });

  it('falls back exactly once when nothing arrived by the cutoff', () => {
    scheduler(NINE_PM_HK - 2 * 60 * 60 * 1000).tick(); // arm
    const late = scheduler(NINE_PM_HK + 2 * 60 * 60 * 1000);
    late.tick();
    late.tick();
    const second = scheduler(NINE_PM_HK + 3 * 60 * 60 * 1000); // a restart later the same night
    second.tick();
    expect(ingested).toHaveLength(1);
    expect(ingested[0]?.kind).toBe('scheduled_digest');
    expect(ingested[0]?.responseChatId).toBe(900);
  });

  it('THE IRON RULE: the fallback envelope carries no statistics of our own', () => {
    // If the connector ever computed "3 joined, 2 went quiet", the Mind would be a
    // formatter and the memory claim would be false. The only number allowed is the date.
    scheduler(NINE_PM_HK - 2 * 60 * 60 * 1000).tick();
    scheduler(NINE_PM_HK + 2 * 60 * 60 * 1000).tick();
    const text = ingested[0]?.text ?? '';
    expect(text).toContain('from your own memory');
    const digits = text.replace(/2026-08-27/g, '').match(/\d/g) ?? [];
    expect(digits).toHaveLength(0);
  });

  it('stays quiet while paused', () => {
    mirror.setPaused(true, NINE_PM_HK);
    scheduler(NINE_PM_HK - 2 * 60 * 60 * 1000).tick();
    scheduler(NINE_PM_HK + 2 * 60 * 60 * 1000).tick();
    expect(sent).toHaveLength(0);
    expect(ingested).toHaveLength(0);
  });

  it('can be turned off entirely', () => {
    const off = new DigestScheduler({
      mirror,
      router: { ingest: () => ({ eventId: 1, routed: false, reason: 'x', type: 'message' as const }) } as never,
      transport: { sendAndAwaitReply: async () => ({}) },
      queue: { enqueue: (_k: string, job: () => Promise<void>) => { void job(); return true; } },
      config: { ...config, digestAtMinutes: -1 },
      now: () => NINE_PM_HK,
    });
    off.tick();
    expect(sent).toHaveLength(0);
  });
});
