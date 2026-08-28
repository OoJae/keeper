import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createApi } from '../src/api/server.js';
import { publicId, isRealAccount } from '../src/api/redact.js';
import { Mirror } from '../src/db/mirror.js';
import { FakeSurface, testConfig } from './fakes.js';

const GROUP = -1001;
const NOW = Date.UTC(2026, 7, 28, 4, 0, 0);
/** Positive id = a real Telegram account. This is the shape that must never reach the public. */
const REAL_HUMAN = 7000000001;
/** Negative id = minted by our seeder for the fictional cast. */
const CAST = -2567697543;

const config = testConfig({ groupChatId: GROUP, apiAdminToken: 'tok' });
let mirror: Mirror;
let api: ReturnType<typeof createApi>;
let cacheDir: string;

async function get(path: string): Promise<any> {
  let payload = '';
  await api.handle(
    { method: 'GET', url: path, headers: {} } as unknown as IncomingMessage,
    {
      setHeader: () => {},
      writeHead() { return this; },
      end(b?: string) { payload = b ?? ''; return this; },
    } as unknown as ServerResponse,
  );
  return payload === '' ? null : JSON.parse(payload);
}

beforeEach(() => {
  mirror = Mirror.open(':memory:');
  // The API resolves the recall cache next to the call log, so give it a real one — the
  // withholding only means anything when there IS something to withhold.
  cacheDir = mkdtempSync(join(tmpdir(), 'keeper-redact-'));
  writeFileSync(
    join(cacheDir, 'member-recall.json'),
    JSON.stringify({
      members: {
        [String(REAL_HUMAN)]: {
          handle: '@quietfox', display: 'Fox',
          summary: 'A profile of a real person, written by an AI.',
          openLoops: ['what actually brought them in'],
          warmth: 'steady', warmthReason: 'quiet arrival',
          capturedAt: '2026-08-28T00:00:00.000Z', raw: '<p>internal</p>',
        },
      },
    }),
  );
  api = createApi({
    config, mirror, surface: new FakeSurface(),
    callLogPath: join(cacheDir, 'minds-calls.jsonl'), now: () => NOW,
  });
  mirror.touchMember({ telegramId: REAL_HUMAN, handle: '@quietfox', display: 'Fox', tsMs: NOW, spoke: true });
  mirror.touchMember({ telegramId: CAST, handle: 'lena_learns', display: 'Lena', tsMs: NOW, spoke: true });
  mirror.recordEvent({
    memberTelegramId: REAL_HUMAN, chatId: GROUP, messageId: 5, type: 'message',
    content: 'something a real person actually typed', tsMs: NOW, routed: true, routeReason: 'heuristic:question',
  });
  mirror.recordAction({
    eventId: null, action: 'reply', originalAction: 'reply',
    targetHandle: '@quietfox', targetTelegramId: REAL_HUMAN,
    message: 'welcome', reasoning: 'day-2 check-in', confidence: 'high', gated: false,
    warnings: [], status: 'executed', detail: 'posted',
    rawReply: '<p>the Mind said something internal here</p>', tsMs: NOW,
    postedChatId: GROUP, postedMessageId: 99,
    undo: { kind: 'delete_posted' as const, chatId: GROUP, messageId: 99 },
  });
});
afterEach(() => {
  mirror.close();
  rmSync(cacheDir, { recursive: true, force: true });
});

describe('a real person never reaches the public API', () => {
  it('pseudonymises the account and says that it did', async () => {
    const { members } = await get('/api/members');
    const real = members.find((m: any) => m.pseudonymous === true);

    expect(real).toBeDefined();
    expect(JSON.stringify(members)).not.toContain(String(REAL_HUMAN));
    expect(JSON.stringify(members)).not.toContain('@quietfox');
    expect(JSON.stringify(members)).not.toContain('Fox');
    // The fictional cast is untouched — the demo depends on them being legible.
    expect(members.find((m: any) => m.telegramId === CAST).handle).toBe('lena_learns');
  });

  it('keeps the row, because deleting it would delete the autonomy evidence', async () => {
    const { members } = await get('/api/members');
    // Phase 3 proved Keeper welcomes a newcomer and checks in the next day. That happened to a
    // real account, so anonymise the person and keep the fact.
    expect(members).toHaveLength(2);
    expect(members.find((m: any) => m.pseudonymous)?.messageCount).toBe(1);
  });

  it('withholds the Mind’s written assessment of a real person', async () => {
    const { members } = await get('/api/members');
    const real = members.find((m: any) => m.pseudonymous === true);
    expect(real.recall.summary).toContain('Withheld');
    expect(real.recall.openLoops).toHaveLength(0);
    expect(JSON.stringify(real.recall)).not.toContain('A profile of a real person');
    expect(JSON.stringify(real.recall)).not.toContain('what actually brought them in');
    // The warmth rating survives, because a colour on a graph is not a dossier.
    expect(real.recall.warmth).toBe('steady');
  });

  it('withholds their message content but keeps that the event happened', async () => {
    const { members } = await get('/api/members');
    const real = members.find((m: any) => m.pseudonymous === true);
    const detail = await get(`/api/members/${real.telegramId}`);
    expect(detail.events[0].content).toBe('[withheld — real account]');
    expect(detail.events[0].type).toBe('message');
    expect(detail.events[0].routed).toBe(true);
  });

  it('refuses a lookup by the real id, so the mapping cannot be probed', async () => {
    expect(await get(`/api/members/${REAL_HUMAN}`)).toEqual({ error: 'not_found' });
    // The public id does resolve.
    expect((await get(`/api/members/${publicId(REAL_HUMAN)}`)).member.pseudonymous).toBe(true);
  });

  it('maps real ids stably and only ever one way', () => {
    expect(publicId(REAL_HUMAN)).toBe(publicId(REAL_HUMAN));
    expect(publicId(REAL_HUMAN)).not.toBe(REAL_HUMAN);
    expect(isRealAccount(publicId(REAL_HUMAN))).toBe(false);
    expect(publicId(CAST)).toBe(CAST);
  });
});

describe('operational internals are not public', () => {
  it('never publishes the Mind’s raw reply or the group’s coordinates', async () => {
    const { actions } = await get('/api/actions');
    const raw = JSON.stringify(actions);

    expect(actions[0].rawReply).toBeUndefined();
    expect(raw).not.toContain('the Mind said something internal here');
    expect(actions[0].postedChatId).toBeUndefined();
    expect(actions[0].postedMessageId).toBeUndefined();
    expect(actions[0].undo).toBeUndefined();
    expect(raw).not.toContain(String(GROUP));
    // The dashboard needs to know an undo APPLIES, never how to perform one.
    expect(actions[0].reversible).toBe(true);
  });

  it('keeps the reasoning, which is the whole point of the log', async () => {
    const { actions } = await get('/api/actions');
    expect(actions[0].reasoning).toBe('day-2 check-in');
    expect(actions[0].confidence).toBe('high');
  });

  it('does not leak a real id through an action’s target', async () => {
    const { actions } = await get('/api/actions');
    expect(JSON.stringify(actions)).not.toContain(String(REAL_HUMAN));
    expect(actions[0].targetHandle).not.toBe('@quietfox');
  });
});


describe('free text written by the Mind is scrubbed too', () => {
  /**
   * The regression this exists for. The first redaction pass mapped every structured field and
   * still leaked the real id five times, because the Mind writes prose ABOUT people and that
   * prose is the moderation log's whole value. Verbatim strings from the live deployment.
   */
  it('scrubs ids and handles out of reasoning, message and targetHandle', async () => {
    mirror.recordAction({
      eventId: null, action: 'reply', originalAction: 'reply',
      targetHandle: `quietfox (id:${REAL_HUMAN})`, targetTelegramId: null,
      message: `WHO JOINED: @quietfox (@quietfox, id:${REAL_HUMAN}) at 17:17Z today`,
      reasoning: `24h check-in per covenant. @quietfox (id:${REAL_HUMAN}, display:'Fox') joined 2026-08-26`,
      confidence: 'high', gated: false, warnings: [], status: 'executed',
      detail: `replied to @quietfox`, rawReply: '', tsMs: NOW,
    });

    const { actions } = await get('/api/actions');
    const serialised = JSON.stringify(actions);

    expect(serialised).not.toContain(String(REAL_HUMAN));
    expect(serialised.toLowerCase()).not.toContain('quietfox');
    // The reasoning survives as readable evidence — scrubbed, not deleted.
    const row = actions.find((a: any) => a.reasoning.includes('24h check-in'));
    expect(row.reasoning).toContain('joined 2026-08-26');
    expect(row.reasoning).toMatch(/member_[a-z0-9]+/);
  });

  it('scrubs a real person out of a CAST member’s recall, not just their own', async () => {
    // The Mind writes about the whole community, so a fictional member's summary can name the
    // real one. Redacting row-by-row would have missed this entirely.
    const { members } = await get('/api/members');
    expect(JSON.stringify(members)).not.toContain(String(REAL_HUMAN));
  });

  it("scrubs a short display name where the Mind writes it as display:'X'", async () => {
    // The bare word is left alone, but this shape is unambiguous, and it is how the leak
    // actually appeared on the live dashboard.
    mirror.recordAction({
      eventId: null, action: 'reply', originalAction: 'reply',
      reasoning: `member joined (id:${REAL_HUMAN}, display:'Fox') at 01:17`,
      confidence: 'high', gated: false, warnings: [], status: 'executed',
      detail: '', rawReply: '', tsMs: NOW,
    });
    const { actions } = await get('/api/actions');
    const row = actions.find((a: any) => a.reasoning.includes('at 01:17'));
    expect(row.reasoning).not.toContain("display:'Fox'");
    expect(row.reasoning).toMatch(/display:'member_[a-z0-9]+'/);
  });

  it('leaves short display names alone in ordinary prose, on purpose', async () => {
    // "Lol" is 3 characters and collides with ordinary English; mangling every "lol" in a chat
    // log to protect a string that identifies nobody would corrupt the evidence. Documented
    // limit, asserted so it stays a decision rather than drifting into a bug.
    mirror.recordAction({
      eventId: null, action: 'none', originalAction: 'none',
      reasoning: 'member said lol at the joke', confidence: 'high', gated: false,
      warnings: [], status: 'skipped', detail: '', rawReply: '', tsMs: NOW,
    });
    const { actions } = await get('/api/actions');
    expect(actions.find((a: any) => a.action === 'none').reasoning).toBe('member said lol at the joke');
  });
});
