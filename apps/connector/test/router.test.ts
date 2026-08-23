process.env['KEEPER_LOG_SILENT'] = '1';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleCreatorCommand } from '../src/commands.js';
import { Mirror } from '../src/db/mirror.js';
import { SequentialQueue } from '../src/pipeline/queue.js';
import { EventRouter } from '../src/pipeline/router.js';
import { FakeSurface, FakeTransport, testConfig } from './fakes.js';

const NOW = Date.UTC(2026, 7, 27, 6, 0, 0);
const GROUP = -1001;
const CREATOR = 900;

let mirror: Mirror;
let surface: FakeSurface;
let transport: FakeTransport;
let queue: SequentialQueue;
let router: EventRouter;
const config = testConfig({ groupChatId: GROUP, creatorTelegramId: CREATOR });

function build(reply: string): void {
  mirror = Mirror.open(':memory:');
  surface = new FakeSurface();
  transport = new FakeTransport(reply);
  queue = new SequentialQueue({ maxPending: 5, onError: () => {} });
  router = new EventRouter({ mirror, surface, transport, queue, config, now: () => NOW });
}

const FENCED_REPLY =
  '<p>Lena is back — I remember her export question.</p>\n' +
  '```json\n' +
  '{"action":"reply","target_member":"@lena_learns","message":"<b>Welcome back, Lena!</b> Your choppy-export question is still open — Marco has a preset that fixes it.","reasoning":"returning member with an open loop","confidence":"high"}\n' +
  '```';

afterEach(() => {
  mirror.close();
});

describe('the core loop', () => {
  beforeEach(() => {
    build(FENCED_REPLY);
  });

  it('mirrors, routes, exchanges with the Mind, executes, and logs — end to end', async () => {
    const decision = router.ingest({
      kind: 'message',
      member: { telegramId: 12345, handle: 'lena_learns', display: 'Lena' },
      text: 'back at last — did anyone figure out the choppy exports thing?',
      chatId: GROUP,
      messageId: 77,
      tsMs: NOW,
    });

    expect(decision.routed).toBe(true);
    expect(decision.reason).toBe('heuristic:question');

    await queue.drain();

    // The envelope the Mind actually received.
    expect(transport.sentEnvelopes[0]).toContain('[KEEPER-EVENT]');
    expect(transport.sentEnvelopes[0]).toContain('member: @lena_learns (id:12345');

    // The action landed in the group, converted out of the Mind's HTML.
    expect(surface.groupMessages[0]?.html).toBe(
      '<b>Welcome back, Lena!</b> Your choppy-export question is still open — Marco has a preset that fixes it.',
    );
    expect(surface.groupMessages[0]?.opts.replyToMessageId).toBe(77);

    // And the moderation log carries the Mind's own reasoning and its raw reply.
    const action = mirror.latestAction();
    expect(action).toMatchObject({
      action: 'reply',
      originalAction: 'reply',
      confidence: 'high',
      gated: false,
      status: 'executed',
      targetHandle: 'lena_learns',
    });
    expect(action?.reasoning).toBe('returning member with an open loop');
    expect(action?.rawReply).toBe(FENCED_REPLY);
  });

  it('classifies a member returning after 48h and tells the Mind so', async () => {
    mirror.touchMember({
      telegramId: 12345,
      handle: 'lena_learns',
      display: 'Lena',
      tsMs: NOW - 3 * 86_400_000,
      spoke: true,
    });
    const decision = router.ingest({
      kind: 'message',
      member: { telegramId: 12345, handle: 'lena_learns', display: 'Lena' },
      text: 'hi',
      chatId: GROUP,
      messageId: 78,
      tsMs: NOW,
    });
    expect(decision.type).toBe('member_returned');
    expect(decision.reason).toBe('member_returned');
    await queue.drain();
    expect(transport.sentEnvelopes[0]).toContain('type: member_returned');
    expect(transport.sentEnvelopes[0]).toContain('last_seen: 2026-08-24 (3 days ago)');
  });

  it('mirrors without spending Cognition when nothing is judgment-worthy', async () => {
    const decision = router.ingest({
      kind: 'message',
      member: { telegramId: 1, handle: 'marco_cuts', display: 'Marco' },
      text: 'pinned it',
      chatId: GROUP,
      messageId: 79,
      tsMs: NOW,
    });
    expect(decision.routed).toBe(false);
    await queue.drain();
    expect(transport.sentEnvelopes).toHaveLength(0);
    expect(mirror.getMember(1)?.messageCount).toBe(1);
  });
});

describe('the Cognition budget', () => {
  it('samples 1-in-N and keeps sampling 1-in-N — it does not latch on after the first sample', () => {
    build(FENCED_REPLY);
    const timeline: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const decision = router.ingest({
        kind: 'message',
        member: { telegramId: 500 + (i % 3), handle: `m${i % 3}`, display: `M${i % 3}` },
        text: 'nice cut',
        chatId: GROUP,
        messageId: 400 + i,
        tsMs: NOW + i * 1000,
      });
      timeline.push(decision.routed ? 'R' : '.');
    }
    // Counting the sampler's ordinal over not-routed messages only made it stick: once the
    // first sample fired the ordinal stopped advancing, so every later message sampled too
    // and one burst of chat spent the whole day's budget.
    expect(timeline.join('')).toBe('...........R...........R...........R....');
  });
});

describe('a supergroup join that Telegram delivers twice', () => {
  it('welcomes the newcomer once, not once per update', async () => {
    build(FENCED_REPLY);
    const member = { telegramId: 4242, handle: 'new_kid_kai', display: 'Kai' };
    // Telegram sends BOTH a chat_member update and a new_chat_members service message.
    const first = router.ingest({ kind: 'join', member, text: 'Kai joined the group.', chatId: GROUP, tsMs: NOW });
    const second = router.ingest({ kind: 'join', member, text: 'Kai joined the group.', chatId: GROUP, tsMs: NOW });
    await queue.drain();

    expect(first.routed).toBe(true);
    expect(second.routed).toBe(false);
    expect(second.reason).toBe('duplicate_join');
    expect(transport.sentEnvelopes).toHaveLength(1);
    expect(surface.groupMessages).toHaveLength(1);
    // Both deliveries are still mirrored — the log tells the truth about what arrived.
    expect(mirror.listMembers()).toHaveLength(1);
  });

  it('still welcomes a genuine re-join once the dedupe window has passed', async () => {
    build(FENCED_REPLY);
    const member = { telegramId: 4242, handle: 'new_kid_kai', display: 'Kai' };
    router.ingest({ kind: 'join', member, text: 'Kai joined the group.', chatId: GROUP, tsMs: NOW });
    const rejoin = router.ingest({ kind: 'join', member, text: 'Kai joined the group.', chatId: GROUP, tsMs: NOW + 6 * 60_000 });
    await queue.drain();
    expect(rejoin.routed).toBe(true);
    expect(transport.sentEnvelopes).toHaveLength(2);
  });
});

describe('when the Mind fails', () => {
  it('records the failure in the log and leaves the group untouched', async () => {
    build(FENCED_REPLY);
    transport.error = new Error('Mind did not reply within 180000ms');

    router.ingest({
      kind: 'message',
      member: { telegramId: 1, handle: 'marco_cuts', display: 'Marco' },
      text: 'anyone know why exports stutter?',
      chatId: GROUP,
      messageId: 80,
      tsMs: NOW,
    });
    await queue.drain();

    expect(surface.groupMessages).toHaveLength(0);
    expect(mirror.latestAction()).toMatchObject({ status: 'failed', reasoning: 'mind_exchange_failed' });
  });

  it('falls back to `none` when the reply contains no directive at all', async () => {
    build('<p>I had a think about it and decided to stay out of this one.</p>');
    router.ingest({
      kind: 'message',
      member: { telegramId: 1, handle: 'marco_cuts', display: 'Marco' },
      text: 'thoughts?',
      chatId: GROUP,
      messageId: 81,
      tsMs: NOW,
    });
    await queue.drain();

    expect(surface.groupMessages).toHaveLength(0);
    expect(mirror.latestAction()).toMatchObject({ action: 'none', status: 'skipped', confidence: 'low' });
  });
});

describe('creator commands', () => {
  beforeEach(() => {
    build(FENCED_REPLY);
  });

  const creator = { telegramId: CREATOR, handle: 'ada_edits', display: 'Ada' };

  function command(text: string, fromId = CREATOR) {
    return handleCreatorCommand(
      { mirror, surface, config, router, now: () => NOW },
      { text, chatId: GROUP, fromId, messageId: 5, member: creator, tsMs: NOW },
    );
  }

  it('pauses and resumes, and pause actually stops routing', async () => {
    await command('/keeper pause');
    expect(mirror.isPaused()).toBe(true);

    const blocked = router.ingest({
      kind: 'message',
      member: { telegramId: 1, handle: 'marco_cuts', display: 'Marco' },
      text: 'help?',
      chatId: GROUP,
      messageId: 82,
      tsMs: NOW,
    });
    expect(blocked).toMatchObject({ routed: false, reason: 'paused' });

    await command('/keeper resume');
    expect(mirror.isPaused()).toBe(false);
  });

  it('refuses commands from anyone but the creator', async () => {
    const consumed = await command('/keeper pause', 555);
    expect(consumed).toBe(true);
    expect(mirror.isPaused()).toBe(false);
    expect(surface.groupMessages.at(-1)?.html).toContain('Only the creator');
  });

  it('explains the last action with /keeper why', async () => {
    router.ingest({
      kind: 'message',
      member: { telegramId: 12345, handle: 'lena_learns', display: 'Lena' },
      text: 'anyone?',
      chatId: GROUP,
      messageId: 83,
      tsMs: NOW,
    });
    await queue.drain();

    await command('/keeper why');
    const posted = surface.groupMessages.at(-1)?.html ?? '';
    expect(posted).toContain('returning member with an open loop');
    expect(posted).toContain('Confidence: high');
  });

  it('undoes the last executed action and marks it overridden', async () => {
    router.ingest({
      kind: 'message',
      member: { telegramId: 12345, handle: 'lena_learns', display: 'Lena' },
      text: 'anyone?',
      chatId: GROUP,
      messageId: 84,
      tsMs: NOW,
    });
    await queue.drain();
    const posted = surface.groupMessages[0]?.messageId;

    await command('/keeper undo');
    expect(surface.deleted).toEqual([{ chatId: GROUP, messageId: posted }]);
    expect(mirror.latestAction()?.overridden).toBe(true);
    expect(mirror.latestUndoableAction()).toBeUndefined();
  });

  it('routes /keeper ask to the Mind as a creator_command', async () => {
    await command('/keeper ask what do you remember about @lena_learns?');
    await queue.drain();
    expect(transport.sentEnvelopes[0]).toContain('type: creator_command');
    expect(transport.sentEnvelopes[0]).toContain('what do you remember about @lena_learns?');
  });

  it('answers a DMed /keeper ask in the DM, not in the community group', async () => {
    const dmChat = 900;
    await handleCreatorCommand(
      { mirror, surface, config, router, now: () => NOW },
      { text: '/keeper ask who is marco?', chatId: dmChat, fromId: CREATOR, member: creator, tsMs: NOW },
    );
    await queue.drain();
    expect(surface.groupMessages.map((m) => m.chatId)).not.toContain(GROUP);
    expect(surface.groupMessages.at(-1)?.chatId).toBe(dmChat);
  });

  it('escapes an unknown verb rather than echoing markup back into the group', async () => {
    await command('/keeper <b>boom</b>');
    expect(surface.groupMessages.at(-1)?.html).toContain('&lt;b&gt;boom&lt;/b&gt;');
  });

  it('ignores anything that is not a /keeper command', async () => {
    expect(await command('just chatting')).toBe(false);
  });
});
