process.env['KEEPER_LOG_SILENT'] = '1';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Mirror, normalizeHandle } from '../src/db/mirror.js';

const T0 = Date.UTC(2026, 7, 20, 2, 0, 0);

let mirror: Mirror;
beforeEach(() => {
  mirror = Mirror.open(':memory:');
});
afterEach(() => {
  mirror.close();
});

describe('members', () => {
  it('returns prior state and current state from one call', () => {
    const first = mirror.touchMember({ telegramId: 1, handle: '@Marco_Cuts', display: 'Marco', tsMs: T0, spoke: true });
    expect(first.prior).toBeUndefined();
    expect(first.current).toMatchObject({ handle: 'marco_cuts', firstSeenMs: T0, lastSeenMs: T0, messageCount: 1 });

    const second = mirror.touchMember({ telegramId: 1, handle: 'marco_cuts', display: 'Marco C', tsMs: T0 + 1000, spoke: true });
    expect(second.prior?.lastSeenMs).toBe(T0);
    expect(second.current).toMatchObject({ display: 'Marco C', lastSeenMs: T0 + 1000, messageCount: 2 });
  });

  it('never rewinds last_seen when an out-of-order update arrives', () => {
    mirror.touchMember({ telegramId: 1, handle: 'm', display: 'M', tsMs: T0 + 5000, spoke: true });
    mirror.touchMember({ telegramId: 1, handle: 'm', display: 'M', tsMs: T0, spoke: true });
    expect(mirror.getMember(1)?.lastSeenMs).toBe(T0 + 5000);
    expect(mirror.getMember(1)?.firstSeenMs).toBe(T0);
  });

  it('matches handles case-insensitively and with or without the @', () => {
    mirror.touchMember({ telegramId: 2, handle: 'Lena_Learns', display: 'Lena', tsMs: T0, spoke: true });
    expect(mirror.findMemberByHandle('@LENA_LEARNS')?.telegramId).toBe(2);
    expect(mirror.findMemberByHandle('lena_learns')?.telegramId).toBe(2);
    expect(mirror.findMemberByHandle('nobody')).toBeUndefined();
    expect(normalizeHandle('  @@Rex ')).toBe('rex');
    expect(normalizeHandle(null)).toBeNull();
  });

  it('keeps the old handle when Telegram sends none', () => {
    mirror.touchMember({ telegramId: 3, handle: 'kai', display: 'Kai', tsMs: T0, spoke: true });
    mirror.touchMember({ telegramId: 3, handle: null, display: 'Kai', tsMs: T0 + 1, spoke: true });
    expect(mirror.getMember(3)?.handle).toBe('kai');
  });
});

describe('events and the Cognition budget', () => {
  it('counts only routed events inside the window, so a restart cannot reset the budget', () => {
    const day = 86_400_000;
    mirror.recordEvent({ memberTelegramId: 1, chatId: -1, type: 'message', content: 'a', tsMs: T0, routed: true, routeReason: 'heuristic:question' });
    mirror.recordEvent({ memberTelegramId: 1, chatId: -1, type: 'message', content: 'b', tsMs: T0 + 10, routed: false, routeReason: 'not_judgment_worthy' });
    mirror.recordEvent({ memberTelegramId: 1, chatId: -1, type: 'message', content: 'c', tsMs: T0 + day, routed: true, routeReason: 'heuristic:link' });

    expect(mirror.routedCountBetween(T0, T0 + day)).toBe(1);
    expect(mirror.routedCountBetween(T0, T0 + 2 * day)).toBe(2);
  });

  it('advances the ambient sampler on every message, routed or not', () => {
    // Counting only the not-routed ones latches the sampler on: the ordinal would stop
    // advancing after the first sample, so `ordinal % N === 0` stays true forever and the
    // day's whole Cognition budget burns in one burst.
    expect(mirror.ambientOrdinalNext()).toBe(1);
    mirror.recordEvent({ memberTelegramId: 1, chatId: -1, type: 'message', content: 'a', tsMs: T0, routed: false, routeReason: 'not_judgment_worthy' });
    expect(mirror.ambientOrdinalNext()).toBe(2);
    mirror.recordEvent({ memberTelegramId: 1, chatId: -1, type: 'message', content: 'b', tsMs: T0, routed: true, routeReason: 'heuristic:question' });
    expect(mirror.ambientOrdinalNext()).toBe(3);
    // Joins are not part of the ambient message stream.
    mirror.recordEvent({ memberTelegramId: 2, chatId: -1, type: 'member_joined', content: 'joined', tsMs: T0, routed: true, routeReason: 'member_joined' });
    expect(mirror.ambientOrdinalNext()).toBe(3);
  });

  it('spots the second delivery of one supergroup join', () => {
    const ts = T0 + 5_000;
    expect(mirror.hasJoinSince(77, -1, ts - 60_000)).toBe(false);
    mirror.recordEvent({ memberTelegramId: 77, chatId: -1, type: 'member_joined', content: 'joined', tsMs: ts, routed: true, routeReason: 'member_joined' });
    expect(mirror.hasJoinSince(77, -1, ts - 60_000)).toBe(true);
    // Scoped to the member, the chat, and the window.
    expect(mirror.hasJoinSince(78, -1, ts - 60_000)).toBe(false);
    expect(mirror.hasJoinSince(77, -2, ts - 60_000)).toBe(false);
    expect(mirror.hasJoinSince(77, -1, ts + 1)).toBe(false);
  });
});

describe('the moderation log', () => {
  it('round-trips warnings and the undo plan, and finds the latest undoable action', () => {
    mirror.recordAction({
      action: 'none', originalAction: 'none', reasoning: 'r', confidence: 'high', gated: false,
      warnings: [], status: 'skipped', detail: '', rawReply: '{}', tsMs: T0,
    });
    const id = mirror.recordAction({
      action: 'reply', originalAction: 'reply', reasoning: 'welcome back', confidence: 'high', gated: false,
      warnings: ['unfenced_directive'], status: 'executed', detail: 'posted',
      undo: { kind: 'delete_posted', chatId: -1, messageId: 7 }, rawReply: '<p>…</p>', tsMs: T0 + 1,
    });

    expect(mirror.latestAction()?.id).toBe(id);
    const undoable = mirror.latestUndoableAction();
    expect(undoable?.id).toBe(id);
    expect(undoable?.warnings).toEqual(['unfenced_directive']);
    expect(undoable?.undo).toEqual({ kind: 'delete_posted', chatId: -1, messageId: 7 });

    mirror.markOverridden(id, 'undo by creator');
    expect(mirror.latestUndoableAction()).toBeUndefined();
    expect(mirror.latestAction()?.overridden).toBe(true);
    expect(mirror.listActions()).toHaveLength(2);
  });
});

describe('settings', () => {
  it('persists the pause switch', () => {
    expect(mirror.isPaused()).toBe(false);
    mirror.setPaused(true, T0);
    expect(mirror.isPaused()).toBe(true);
    mirror.setPaused(false, T0 + 1);
    expect(mirror.isPaused()).toBe(false);
    expect(mirror.getSetting('nope')).toBeUndefined();
  });
});
