process.env['KEEPER_LOG_SILENT'] = '1';

import { describe, expect, it } from 'vitest';

import {
  dayWindow,
  decideRoute,
  shoutRatio,
  type BudgetConfig,
  type PrefilterInput,
} from '../src/pipeline/prefilter.js';

const BUDGET: BudgetConfig = { dailyMindBudget: 40, priorityReserve: 10, ambientSampleRate: 12 };

function input(overrides: Partial<PrefilterInput> = {}): PrefilterInput {
  return {
    type: 'message',
    text: 'nice cut',
    mentionsBot: false,
    hasLinkEntity: false,
    paused: false,
    routedToday: 0,
    ambientOrdinal: 1,
    ...overrides,
  };
}

describe('decideRoute — what reaches the Mind', () => {
  it('routes joins, returns, creator commands and scheduled digests as priority events', () => {
    expect(decideRoute(input({ type: 'member_joined', text: 'Kai joined' }), BUDGET)).toMatchObject({
      route: true,
      reason: 'member_joined',
    });
    expect(decideRoute(input({ type: 'member_returned' }), BUDGET)).toMatchObject({
      route: true,
      reason: 'member_returned',
    });
    expect(decideRoute(input({ type: 'creator_command', text: 'why' }), BUDGET)).toMatchObject({
      route: true,
      reason: 'creator_command',
    });
    expect(decideRoute(input({ type: 'scheduled_digest', text: '' }), BUDGET)).toMatchObject({
      route: true,
      reason: 'scheduled_digest',
    });
  });

  it('does not route ordinary chatter — that is the whole point of the budget', () => {
    const decision = decideRoute(input({ text: 'pinned version is up' }), BUDGET);
    expect(decision.route).toBe(false);
    expect(decision.reason).toBe('not_judgment_worthy');
  });

  it('routes messages that trip a heuristic', () => {
    const cases: Array<[Partial<PrefilterInput>, string]> = [
      [{ mentionsBot: true, text: '@keeperbot help' }, 'heuristic:mention'],
      [{ text: 'this edit is garbage lol' }, 'heuristic:profanity'],
      [{ text: 'check https://sketchy.example/deal' }, 'heuristic:link'],
      [{ text: 'free crypto at t.me/joinme' }, 'heuristic:link'],
      [{ text: 'buy now', hasLinkEntity: true }, 'heuristic:link'],
      [{ text: 'WHY IS NOBODY ANSWERING ME' }, 'heuristic:shouting'],
      [{ text: 'how do I fix choppy exports?' }, 'heuristic:question'],
    ];
    for (const [patch, reason] of cases) {
      const decision = decideRoute(input({ text: 'x?', ...patch }), BUDGET);
      expect(decision.route, JSON.stringify(patch)).toBe(true);
      expect(decision.reason, JSON.stringify(patch)).toBe(reason);
    }
  });

  it('reports a spam link as a link even when it also contains a question mark', () => {
    expect(decideRoute(input({ text: 'wanna make $$$? https://scam.example' }), BUDGET).reason).toBe(
      'heuristic:link',
    );
  });

  it('samples 1-in-N otherwise-uninteresting messages', () => {
    const routed = [1, 11, 12, 13, 24].map(
      (ordinal) => decideRoute(input({ text: 'ok', ambientOrdinal: ordinal }), BUDGET).route,
    );
    expect(routed).toEqual([false, false, true, false, true]);
  });

  it('never samples when the rate is 0', () => {
    const decision = decideRoute(input({ text: 'ok', ambientOrdinal: 12 }), { ...BUDGET, ambientSampleRate: 0 });
    expect(decision.route).toBe(false);
  });

  it('blocks everything except creator commands while paused', () => {
    expect(decideRoute(input({ paused: true, type: 'member_joined' }), BUDGET)).toMatchObject({
      route: false,
      reason: 'paused',
    });
    expect(decideRoute(input({ paused: true, text: 'help?' }), BUDGET).route).toBe(false);
    expect(decideRoute(input({ paused: true, type: 'creator_command', text: 'resume' }), BUDGET).route).toBe(true);
  });

  it('ignores empty message bodies', () => {
    expect(decideRoute(input({ text: '   ' }), BUDGET)).toMatchObject({ route: false, reason: 'empty' });
  });
});

describe('decideRoute — the daily Cognition cap is enforced, not aspirational', () => {
  it('stops ordinary traffic once the unreserved slice is spent', () => {
    const decision = decideRoute(input({ text: 'help?', routedToday: 30 }), BUDGET);
    expect(decision.route).toBe(false);
    expect(decision.reason).toBe('daily_cap');
    expect(decision.detail).toContain('heuristic:question');
  });

  it('still lets a join through on the reserve', () => {
    expect(decideRoute(input({ type: 'member_joined', routedToday: 30 }), BUDGET).route).toBe(true);
    expect(decideRoute(input({ type: 'member_joined', routedToday: 39 }), BUDGET).route).toBe(true);
  });

  it('stops even priority events at the hard ceiling', () => {
    const decision = decideRoute(input({ type: 'member_joined', routedToday: 40 }), BUDGET);
    expect(decision).toMatchObject({ route: false, reason: 'daily_cap_priority' });
  });

  it('degrades safely when the reserve is the whole budget', () => {
    const decision = decideRoute(input({ text: 'help?' }), { ...BUDGET, dailyMindBudget: 5, priorityReserve: 5 });
    expect(decision.route).toBe(false);
  });
});

describe('shoutRatio', () => {
  it('ignores short strings and punctuation', () => {
    expect(shoutRatio('OK!')).toBe(0);
    expect(shoutRatio('!!!!!!!!!!!!')).toBe(0);
  });

  it('measures letters only', () => {
    expect(shoutRatio('THIS IS FINE!!!')).toBe(1);
    expect(shoutRatio('this is fine')).toBe(0);
  });
});

describe('dayWindow', () => {
  it('brackets the local day in the community offset, not UTC', () => {
    // 2026-08-27T00:30:00+08:00 === 2026-08-26T16:30:00Z
    const nowMs = Date.UTC(2026, 7, 26, 16, 30, 0);
    const { fromMs, toMs } = dayWindow(nowMs, 480);
    expect(new Date(fromMs).toISOString()).toBe('2026-08-26T16:00:00.000Z');
    expect(toMs - fromMs).toBe(86_400_000);
    expect(nowMs).toBeGreaterThanOrEqual(fromMs);
    expect(nowMs).toBeLessThan(toMs);
  });
});
