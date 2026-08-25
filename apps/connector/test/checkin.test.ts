import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Mirror } from '../src/db/mirror.js';
import { CheckinScheduler } from '../src/pipeline/checkin.js';
import { FakeSurface, testConfig } from './fakes.js';

const HK = 480;
const config = testConfig({ groupChatId: -1001, creatorTelegramId: 900, utcOffsetMinutes: HK });
const KAI = -1888000004;

/** 11:00 Hong Kong (past the 10:00 arming floor) on the given UTC day. */
const elevenAmHK = (day: number): number => Date.UTC(2026, 7, day, 3, 0, 0);

let mirror: Mirror;
let surface: FakeSurface;
let sent: string[];
let replies: string[];

function scheduler(nowMs: number): CheckinScheduler {
  return new CheckinScheduler({
    mirror,
    surface,
    transport: {
      sendAndAwaitReply: async (_a: string, text: string) => {
        sent.push(text);
        return { reply: { text: replies.shift() ?? '' } };
      },
    },
    queue: { enqueue: (_k: string, job: () => Promise<void>) => { void job(); return true; } },
    config,
    now: () => nowMs,
  });
}

const joined = { memberId: KAI, handle: 'new_kid_kai', display: 'Kai', tsMs: Date.UTC(2026, 7, 26, 12, 0, 0) };

const WELCOME_BACK =
  '```json\n{"action":"reply","target_member":"@new_kid_kai","message":"How did day one go, Kai? Did the phone footage import cleanly?","reasoning":"day-2 check-in","confidence":"high"}\n```';

beforeEach(() => {
  mirror = Mirror.open(':memory:');
  surface = new FakeSurface();
  sent = [];
  replies = [];
});
afterEach(() => mirror.close());

describe('CheckinScheduler', () => {
  it('owes a check-in the day AFTER the welcome, not the same day', () => {
    // Someone welcomed at 23:50 must not be checked on ten minutes later.
    scheduler(joined.tsMs).markDue(joined);
    const sameDay = scheduler(elevenAmHK(26)); // still 26 Aug local
    sameDay.tick();
    expect(sent).toHaveLength(0);
  });

  it('arms once on the due day, and never again', async () => {
    scheduler(joined.tsMs).markDue(joined);
    replies = [WELCOME_BACK];
    const due = scheduler(elevenAmHK(27));
    due.tick();
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toHaveLength(1);

    due.tick();
    scheduler(elevenAmHK(28)).tick(); // and not the day after either
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toHaveLength(1);
  });

  it('posts the check-in in the group when the Mind answers immediately', async () => {
    scheduler(joined.tsMs).markDue(joined);
    replies = [WELCOME_BACK];
    scheduler(elevenAmHK(27)).tick();
    await new Promise((r) => setTimeout(r, 10));
    expect(surface.groupMessages).toHaveLength(1);
    expect(surface.groupMessages[0]?.html).toContain('day one');
    // Unprompted: nobody in the group triggered it, which is what the autonomy feed selects on.
    const actions = mirror.listActions(10).filter((a) => a.eventId === null);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.warnings).toContain('day2_checkin');
  });

  it('waits for the watcher when the Mind would rather send it itself', async () => {
    scheduler(joined.tsMs).markDue(joined);
    replies = ['<p>Noted — I will check in on Kai myself later today.</p>'];
    scheduler(elevenAmHK(27)).tick();
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toHaveLength(1);
    expect(surface.groupMessages).toHaveLength(0); // nothing forced into the group
  });

  it('THE IRON RULE: the arming text states only that a follow-up is due', async () => {
    // If this file ever wrote the check-in's content, Keeper would be reciting our words
    // rather than remembering the member. The only facts allowed are the handle and the
    // join date; everything else must come from the Mind.
    scheduler(joined.tsMs).markDue(joined);
    replies = [WELCOME_BACK];
    scheduler(elevenAmHK(27)).tick();
    await new Promise((r) => setTimeout(r, 10));
    const text = sent[0] ?? '';
    expect(text).toContain('your own memory of them');
    expect(text).toContain('@new_kid_kai');
    // No invented detail about who they are or what they said.
    expect(text.toLowerCase()).not.toContain('phone');
    expect(text.toLowerCase()).not.toContain('beginner');
  });

  it('does not re-arm after a restart', async () => {
    scheduler(joined.tsMs).markDue(joined);
    replies = [WELCOME_BACK, WELCOME_BACK];
    scheduler(elevenAmHK(27)).tick();
    await new Promise((r) => setTimeout(r, 10));
    // A fresh scheduler over the same mirror is exactly a connector restart.
    scheduler(elevenAmHK(27)).tick();
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toHaveLength(1);
  });

  it('stays quiet while paused, and can be disabled entirely', async () => {
    scheduler(joined.tsMs).markDue(joined);
    mirror.setPaused(true, elevenAmHK(27));
    scheduler(elevenAmHK(27)).tick();
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toHaveLength(0);

    mirror.setPaused(false, elevenAmHK(27));
    const off = new CheckinScheduler({
      mirror,
      surface,
      transport: { sendAndAwaitReply: async () => ({ reply: { text: '' } }) },
      queue: { enqueue: (_k: string, job: () => Promise<void>) => { void job(); return true; } },
      config: { ...config, checkinAtMinutes: -1 },
      now: () => elevenAmHK(27),
    });
    off.tick();
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toHaveLength(0);
  });

  it('does not arm before the configured hour', async () => {
    scheduler(joined.tsMs).markDue(joined);
    scheduler(Date.UTC(2026, 7, 27, 0, 30)).tick(); // 08:30 HKT, before the 10:00 floor
    await new Promise((r) => setTimeout(r, 10));
    expect(sent).toHaveLength(0);
  });

  it('does not double the @ when the envelope already supplied one', async () => {
    // envelopeHandle() returns "@name", and every render site adds its own @. The check-in
    // armed for 2026-08-27 had "@quietfox" stored, so the arming message said "@@quietfox".
    scheduler(joined.tsMs).markDue({ ...joined, handle: '@new_kid_kai' });
    replies = [WELCOME_BACK];
    scheduler(elevenAmHK(27)).tick();
    await new Promise((r) => setTimeout(r, 10));
    expect(sent[0]).toContain('@new_kid_kai');
    expect(sent[0]).not.toContain('@@');
  });
});
