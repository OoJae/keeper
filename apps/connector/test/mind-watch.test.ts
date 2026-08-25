import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Mirror } from '../src/db/mirror.js';
import { MindWatcher, classifyUnprompted } from '../src/pipeline/mind-watch.js';
import { SequentialQueue } from '../src/pipeline/queue.js';
import { FakeSurface, FakeTransport, testConfig } from './fakes.js';

const GROUP = -1001;
const CREATOR = 900;
const NOW = Date.UTC(2026, 7, 27, 21, 0, 0);
const config = testConfig({ groupChatId: GROUP, creatorTelegramId: CREATOR });

let mirror: Mirror;
let surface: FakeSurface;
let transport: FakeTransport;
let queue: SequentialQueue;
let watcher: MindWatcher;

const mindMsg = (id: string, text: string, atMs = NOW): { id: string; text: string; sender: 'mind'; at: Date; raw: unknown } => ({
  id,
  text,
  sender: 'mind',
  at: new Date(atMs),
  raw: {},
});

beforeEach(() => {
  mirror = Mirror.open(':memory:');
  surface = new FakeSurface();
  transport = new FakeTransport();
  queue = new SequentialQueue({ maxPending: 5, onError: () => {} });
  watcher = new MindWatcher({ transport, mirror, surface, queue, config, now: () => NOW });
});
afterEach(() => mirror.close());

/** Adopt a baseline so the watcher is past cold start, like a connector that has run before. */
async function primed(): Promise<void> {
  transport.history = [mindMsg('fp-0', 'earlier chatter', NOW - 60_000)];
  await watcher.sweep();
}

describe('classifyUnprompted', () => {
  it('turns bare prose into a creator-only digest', () => {
    const c = classifyUnprompted('Quiet day. Marco helped two people; nobody needs you.');
    expect(c.kind).toBe('prose');
    expect(c.directive.action).toBe('digest');
  });

  it('downgrades an unanchored destructive directive to a creator flag', () => {
    const c = classifyUnprompted(
      '```json\n{"action":"delete","target_member":"@rex_hotkeys","reasoning":"spam","confidence":"high"}\n```',
    );
    expect(c.directive.action).toBe('flag_creator');
    expect(c.kind === 'directive' && c.converted).toBe('unsolicited_destructive');
  });

  it('lets an unprompted reply through — that is the day-2 check-in', () => {
    const c = classifyUnprompted(
      '```json\n{"action":"reply","message":"How did day one go?","reasoning":"check-in","confidence":"high"}\n```',
    );
    expect(c.directive.action).toBe('reply');
  });
});

describe('MindWatcher', () => {
  it('dispatches nothing on a cold start, and adopts the newest as the baseline', async () => {
    transport.history = [mindMsg('fp-a', 'old digest', NOW - 86_400_000), mindMsg('fp-b', 'older still', NOW - 172_800_000)];
    const result = await watcher.sweep();
    expect(result.reason).toBe('cold_start');
    expect(result.dispatched).toBe(0);
    expect(surface.groupMessages).toHaveLength(0);
    expect(surface.directMessages).toHaveLength(0);
  });

  it('delivers an unprompted digest to the creator and never to the group', async () => {
    await primed();
    transport.history.push(
      mindMsg('fp-1', '```json\n{"action":"digest","message":"3 joined, Marco carried the room.","reasoning":"nightly","confidence":"high"}\n```'),
    );
    const result = await watcher.sweep();
    expect(result.dispatched).toBe(1);
    expect(surface.directMessages).toHaveLength(1);
    expect(surface.groupMessages).toHaveLength(0);
  });

  it('delivers bare prose to the creator, never to the group', async () => {
    await primed();
    transport.history.push(mindMsg('fp-2', '<p>Nothing needs you tonight.</p>'));
    await watcher.sweep();
    expect(surface.directMessages).toHaveLength(1);
    expect(surface.groupMessages).toHaveLength(0);
  });

  it('records unprompted actions with a null event id — that is the feed', async () => {
    await primed();
    transport.history.push(mindMsg('fp-3', '<p>Quiet day.</p>'));
    await watcher.sweep();
    const unprompted = mirror.listActions(10).filter((a) => a.eventId === null);
    expect(unprompted).toHaveLength(1);
    expect(unprompted[0]?.warnings).toContain('unprompted');
  });

  it('never re-delivers a message after a restart', async () => {
    await primed();
    transport.history.push(mindMsg('fp-4', '<p>digest one</p>'));
    await watcher.sweep();
    expect(surface.directMessages).toHaveLength(1);

    // Same mirror, new watcher: exactly a connector restart.
    const second = new MindWatcher({ transport, mirror, surface, queue, config, now: () => NOW });
    await second.sweep();
    expect(surface.directMessages).toHaveLength(1);
  });

  it('skips the reply an exchange already consumed', async () => {
    await primed();
    transport.history.push(mindMsg('fp-5', '<p>this was a reply to an envelope</p>'));
    const result = await watcher.sweep({ skipFingerprint: 'fp-5' });
    expect(result.dispatched).toBe(0);
    expect(surface.directMessages).toHaveLength(0);
  });

  it('refuses to act when a sweep finds a flood, and says so', async () => {
    await primed();
    for (let i = 0; i < 8; i += 1) transport.history.push(mindMsg(`fp-f${i}`, `<p>message ${i}</p>`));
    const result = await watcher.sweep();
    expect(result.reason).toBe('flood_guard');
    expect(result.dispatched).toBe(0);
    expect(surface.groupMessages).toHaveLength(0);
    expect(surface.directMessages).toHaveLength(1); // one warning to the creator
  });

  it('does not poll at all while paused', async () => {
    await primed();
    mirror.setPaused(true, NOW);
    const before = transport.historyCalls;
    const result = await watcher.sweep();
    expect(result.reason).toBe('paused');
    expect(transport.historyCalls).toBe(before);
  });

  it('cannot spend Cognition: it never sends', async () => {
    await primed();
    transport.history.push(mindMsg('fp-6', '<p>digest</p>'));
    await watcher.sweep();
    expect(transport.sentEnvelopes).toHaveLength(0);
  });

  it('serialises against Mind exchanges on the shared queue', async () => {
    await primed();
    const order: string[] = [];
    queue.enqueue(config.mindAlias, async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push('exchange');
    });
    expect(watcher.tick()).toBe(true);
    expect(watcher.tick()).toBe(false); // one pending sweep is enough
    await queue.drain();
    order.push('after-drain');
    expect(order[0]).toBe('exchange');
  });
});

describe('when the platform ignores the after cursor', () => {
  it('still considers each message only once', async () => {
    // LIVE-VERIFIED 2026-08-25: ?after=<newest fingerprint> returns the whole page anyway.
    // A FakeTransport that ignores `after` reproduces that exactly. Without a timestamp
    // floor the watcher re-dispatches history on every sweep.
    const mirror2 = Mirror.open(':memory:');
    const surface2 = new FakeSurface();
    const transport2 = new FakeTransport();
    // Ignore `after` entirely, like the real deployment.
    transport2.getHistory = async () => [...transport2.history];
    const queue2 = new SequentialQueue({ maxPending: 5, onError: () => {} });
    const w = new MindWatcher({ transport: transport2, mirror: mirror2, surface: surface2, queue: queue2, config, now: () => NOW });

    transport2.history = [mindMsg('fp-old', 'old chatter', NOW - 120_000)];
    await w.sweep(); // cold start adopts the present

    transport2.history.push(mindMsg('fp-new', '<p>tonight was quiet</p>', NOW));
    await w.sweep();
    expect(surface2.directMessages).toHaveLength(1);

    // Same page served again, and again. It must not re-deliver.
    await w.sweep();
    await w.sweep();
    expect(surface2.directMessages).toHaveLength(1);
    mirror2.close();
  });
});
