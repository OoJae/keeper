import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { Mirror } from '../src/db/mirror.js';
import { SeedInbox, syntheticMemberId } from '../src/seed-inbox.js';

const GROUP = -1001;
let mirror: Mirror;

afterEach(() => {
  mirror.close();
});

function setup(): { path: string; inbox: SeedInbox; seen: number[] } {
  const path = join(mkdtempSync(join(tmpdir(), 'keeper-inbox-')), 'seed-inbox.jsonl');
  mirror = Mirror.open(':memory:');
  const seen: number[] = [];
  const router = {
    ingest: (input: { messageId?: number }) => {
      seen.push(input.messageId ?? -1);
      return { eventId: seen.length, routed: false, reason: 'test', type: 'message' as const };
    },
  };
  const inbox = new SeedInbox({ path, router, mirror, groupChatId: GROUP });
  return { path, inbox, seen };
}

const line = (id: number): string =>
  `${JSON.stringify({
    handle: 'marco_cuts',
    display: 'Marco',
    text: `line ${id}`,
    tsMs: 1_787_000_000_000 + id,
    chatId: GROUP,
    messageId: id,
  })}\n`;

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 150));
};

describe('seed inbox', () => {
  it('ingests each appended line exactly once', async () => {
    // The connector attempted every day-2 line twice on 2026-08-25. The unique index caught
    // it, but the read side should not be handing the same line over more than once.
    const { path, inbox, seen } = setup();
    appendFileSync(path, line(1));
    inbox.start();
    await settle();
    appendFileSync(path, line(2));
    await settle();
    appendFileSync(path, line(3));
    await settle();
    inbox.stop();
    expect(seen).toEqual([1, 2, 3]);
  });

  it('does not re-ingest anything already consumed after a restart', async () => {
    const { path, inbox, seen } = setup();
    appendFileSync(path, line(1) + line(2));
    inbox.start();
    await settle();
    inbox.stop();
    expect(seen).toEqual([1, 2]);

    // Same mirror, so the persisted offset carries over — exactly a connector restart.
    const seenAfter: number[] = [];
    const second = new SeedInbox({
      path,
      router: {
        ingest: (input: { messageId?: number }) => {
          seenAfter.push(input.messageId ?? -1);
          return { eventId: 1, routed: false, reason: 'test', type: 'message' as const };
        },
      },
      mirror,
      groupChatId: GROUP,
    });
    second.start();
    await settle();
    second.stop();
    expect(seenAfter).toEqual([]);
  });

  it('ignores a line addressed to another chat', async () => {
    const { path, inbox, seen } = setup();
    appendFileSync(path, JSON.stringify({ handle: 'x', display: 'X', text: 'elsewhere', tsMs: 1, chatId: -999, messageId: 7 }) + '\n');
    inbox.start();
    await settle();
    inbox.stop();
    expect(seen).toEqual([]);
  });

  it('gives a cast member the same synthetic id every time', () => {
    expect(syntheticMemberId('lena_learns')).toBe(syntheticMemberId('LENA_LEARNS'));
    expect(syntheticMemberId('lena_learns')).toBeLessThan(0);
  });
});
