import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetRefusalCooldownForTests, handleCreatorCommand } from '../src/commands.js';
import { Mirror } from '../src/db/mirror.js';
import { EventRouter } from '../src/pipeline/router.js';
import { SequentialQueue } from '../src/pipeline/queue.js';
import { FakeSurface, FakeTransport, testConfig } from './fakes.js';

const GROUP = -1001;
const CREATOR = 900;
const MEMBER = 555;
const NOW = Date.UTC(2026, 7, 27, 9, 0, 0);
const config = testConfig({ groupChatId: GROUP, creatorTelegramId: CREATOR });

let mirror: Mirror;
let surface: FakeSurface;
let router: EventRouter;

const cmd = async (text: string, fromId = CREATOR): Promise<void> => {
  await handleCreatorCommand(
    { mirror, surface, config, router, now: () => NOW },
    {
      text,
      chatId: GROUP,
      fromId,
      messageId: 1,
      member: { telegramId: fromId, handle: 'someone', display: 'Someone' },
      tsMs: NOW,
    },
  );
};

/** A row shaped like something Keeper posted in the group, optionally reversible. */
const recordPosted = (messageId: number | null): number =>
  mirror.recordAction({
    eventId: null, // the unprompted paths: watcher and check-in
    action: 'reply',
    originalAction: 'reply',
    reasoning: 'day-2 check-in',
    confidence: 'high',
    gated: false,
    warnings: ['unprompted'],
    status: 'executed',
    detail: 'reply posted in group',
    rawReply: '',
    tsMs: NOW,
    ...(messageId === null ? {} : { postedChatId: GROUP, postedMessageId: messageId }),
    ...(messageId === null ? {} : { undo: { kind: 'delete_posted' as const, chatId: GROUP, messageId } }),
  });

beforeEach(() => {
  __resetRefusalCooldownForTests();
  mirror = Mirror.open(':memory:');
  surface = new FakeSurface();
  router = new EventRouter({
    mirror,
    surface,
    transport: new FakeTransport(''),
    queue: new SequentialQueue({ maxPending: 5, onError: () => {} }),
    config,
    now: () => NOW,
  });
});
afterEach(() => mirror.close());

describe('undo reaches what the Mind did on its own', () => {
  it('reverses an unprompted action, which is the one a creator most wants back', async () => {
    // The watcher and the check-in scheduler record with event_id NULL. They used to omit
    // the undo plan, so /keeper undo selected the row, deleted nothing, and still reported
    // success — on exactly the autonomous actions Phase 3 exists to show off.
    const id = recordPosted(4242);
    await cmd('/keeper undo');
    expect(surface.deleted).toContainEqual({ chatId: GROUP, messageId: 4242 });
    expect(mirror.listActions(5).find((a) => a.id === id)?.overridden).toBe(true);
  });

  it('does not let an un-undoable action swallow the undo', async () => {
    // A flag_creator whose DM succeeded is "executed" but reverses nothing. If it were
    // offered, the real action beneath it would stay live while the creator believed
    // they had taken it back.
    const reversible = recordPosted(77);
    recordPosted(null); // newer, but nothing to reverse
    await cmd('/keeper undo');
    expect(surface.deleted).toContainEqual({ chatId: GROUP, messageId: 77 });
    expect(mirror.listActions(5).find((a) => a.id === reversible)?.overridden).toBe(true);
  });

  it('walks back one action per undo', async () => {
    const older = recordPosted(10);
    const newer = recordPosted(11);
    await cmd('/keeper undo');
    await cmd('/keeper undo');
    const rows = mirror.listActions(5);
    expect(rows.find((a) => a.id === newer)?.overridden).toBe(true);
    expect(rows.find((a) => a.id === older)?.overridden).toBe(true);
    expect(surface.deleted).toHaveLength(2);
  });
});

describe('the log must not claim a reversal that did not happen', () => {
  it('leaves the row undoable when Telegram refuses the delete', async () => {
    const id = recordPosted(999);
    surface.deleteOutcome = { ok: false, reason: 'too_old', detail: 'message is older than 48h' }; // past Telegram's 48h window
    await cmd('/keeper undo');
    const row = mirror.listActions(5).find((a) => a.id === id);
    expect(row?.overridden).toBe(false);
    expect(mirror.latestUndoableAction()?.id).toBe(id); // still retryable
    expect(surface.groupMessages.at(-1)?.html).toContain('could not undo');
  });

  it('records WHEN the human intervened, not just that they did', async () => {
    const id = recordPosted(31);
    await cmd('/keeper undo');
    const row = mirror.listActions(5).find((a) => a.id === id);
    expect(row?.overriddenAtMs).toBe(NOW);
    expect(row?.overrideNote).toContain('undo by creator');
  });
});

describe('non-creator /keeper', () => {
  it('answers once, then stops feeding the flood', async () => {
    for (let i = 0; i < 6; i += 1) await cmd('/keeper undo', MEMBER);
    // One refusal, not six. Otherwise any member can drive bot posts into the group at will.
    expect(surface.groupMessages).toHaveLength(1);
    expect(surface.groupMessages[0]?.html).toContain('Only the creator');
  });

  it('never reverses anything on a member’s say-so', async () => {
    recordPosted(5);
    await cmd('/keeper undo', MEMBER);
    expect(surface.deleted).toHaveLength(0);
    expect(mirror.latestUndoableAction()).toBeDefined();
  });
});
