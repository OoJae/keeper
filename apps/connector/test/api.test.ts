import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { createApi } from '../src/api/server.js';
import { Mirror } from '../src/db/mirror.js';
import { FakeSurface, testConfig } from './fakes.js';

const GROUP = -1001;
const NOW = Date.UTC(2026, 7, 28, 4, 0, 0);
const TOKEN = 'test-admin-token';
const config = testConfig({ groupChatId: GROUP, apiAdminToken: TOKEN });

let mirror: Mirror;
let surface: FakeSurface;
let api: ReturnType<typeof createApi>;

/** Drives the handler without binding a port. */
async function call(
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const req = { method, url: path, headers } as unknown as IncomingMessage;
  let status = 0;
  let payload = '';
  const res = {
    setHeader: () => {},
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: string) {
      payload = chunk ?? '';
      return this;
    },
  } as unknown as ServerResponse;
  await api.handle(req, res);
  return { status, body: payload === '' ? null : JSON.parse(payload) };
}

const recordPosted = (messageId: number | null): number =>
  mirror.recordAction({
    eventId: null,
    action: 'reply',
    originalAction: 'reply',
    reasoning: 'day-2 check-in',
    confidence: 'high',
    gated: false,
    warnings: [],
    status: 'executed',
    detail: 'reply posted in group',
    rawReply: '',
    tsMs: NOW,
    ...(messageId === null ? {} : { postedChatId: GROUP, postedMessageId: messageId }),
    ...(messageId === null ? {} : { undo: { kind: 'delete_posted' as const, chatId: GROUP, messageId } }),
  });

beforeEach(() => {
  mirror = Mirror.open(':memory:');
  surface = new FakeSurface();
  api = createApi({
    config,
    mirror,
    surface,
    callLogPath: '/nonexistent/minds-calls.jsonl',
    now: () => NOW,
  });
});
afterEach(() => mirror.close());

describe('reads are public', () => {
  it('serves health, members and the log without any credential', async () => {
    mirror.touchMember({ telegramId: 555, handle: 'marco_cuts', display: 'Marco', tsMs: NOW, spoke: true });
    recordPosted(10);

    const health = await call('GET', '/api/health');
    expect(health.status).toBe(200);
    expect(health.body.writesEnabled).toBe(true);

    const members = await call('GET', '/api/members');
    expect(members.status).toBe(200);
    expect(members.body.members).toHaveLength(1);

    const actions = await call('GET', '/api/actions');
    expect(actions.body.actions).toHaveLength(1);
  });

  it('separates the unprompted feed, because that IS the autonomy claim', async () => {
    recordPosted(11); // eventId null — unprompted
    mirror.recordAction({
      eventId: 7, // triggered by a member message
      action: 'reply',
      originalAction: 'reply',
      reasoning: 'answered a question',
      confidence: 'high',
      gated: false,
      warnings: [],
      status: 'executed',
      detail: 'reply posted in group',
      rawReply: '',
      tsMs: NOW,
    });

    const all = await call('GET', '/api/actions');
    const unprompted = await call('GET', '/api/unprompted');
    expect(all.body.actions).toHaveLength(2);
    expect(unprompted.body.actions).toHaveLength(1);
    expect(unprompted.body.actions[0].eventId).toBeNull();
  });

  it('never reports credits it did not measure', async () => {
    const res = await call('GET', '/api/cognition');
    expect(res.status).toBe(200);
    expect(res.body.estimatedCreditsToday).toBeNull();
  });
});

describe('the one write is gated', () => {
  it('refuses undo without the token, and changes nothing', async () => {
    const id = recordPosted(4242);
    const res = await call('POST', `/api/actions/${id}/undo`);
    expect(res.status).toBe(401);
    expect(surface.deleted).toHaveLength(0);
    expect(mirror.getAction(id)?.overridden).toBe(false);
  });

  it('refuses a wrong token', async () => {
    const id = recordPosted(4242);
    const res = await call('POST', `/api/actions/${id}/undo`, { 'x-keeper-admin-token': 'guess' });
    expect(res.status).toBe(401);
    expect(surface.deleted).toHaveLength(0);
  });

  it('undoes by id with the token — not merely the most recent action', async () => {
    const first = recordPosted(100);
    recordPosted(200); // newer; /keeper undo would take this one

    const res = await call('POST', `/api/actions/${first}/undo`, { 'x-keeper-admin-token': TOKEN });
    expect(res.status).toBe(200);
    expect(surface.deleted).toContainEqual({ chatId: GROUP, messageId: 100 });
    expect(mirror.getAction(first)?.overridden).toBe(true);
    expect(mirror.getAction(first)?.overriddenAtMs).toBe(NOW);
  });

  /**
   * The Phase 4 regression, now reachable from a second surface. A failed reversal that still
   * marked the row overridden lied in the log AND made the live action unreachable, because an
   * overridden row is never offered again.
   */
  it('does NOT mark the row overridden when the reversal fails', async () => {
    const id = recordPosted(4242);
    surface.deleteOutcome = { ok: false, reason: 'too_old', detail: 'message is too old to delete' };

    const res = await call('POST', `/api/actions/${id}/undo`, { 'x-keeper-admin-token': TOKEN });
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('failed');
    expect(mirror.getAction(id)?.overridden).toBe(false);
  });

  it('will not undo an action that changed nothing in the group', async () => {
    const id = recordPosted(null); // a DM'd digest: executed, but reverses nothing
    const res = await call('POST', `/api/actions/${id}/undo`, { 'x-keeper-admin-token': TOKEN });
    expect(res.status).toBe(409);
    expect(res.body.reason).toBe('nothing_reversible');
  });

  it('404s an action that does not exist', async () => {
    const res = await call('POST', '/api/actions/9999/undo', { 'x-keeper-admin-token': TOKEN });
    expect(res.status).toBe(404);
  });

  it('disables writes entirely when no token is configured', async () => {
    const openApi = createApi({
      config: testConfig({ groupChatId: GROUP, apiAdminToken: '' }),
      mirror,
      surface,
      callLogPath: '/nonexistent/minds-calls.jsonl',
      now: () => NOW,
    });
    const id = recordPosted(4242);
    let status = 0;
    let payload = '';
    await openApi.handle(
      { method: 'POST', url: `/api/actions/${id}/undo`, headers: {} } as unknown as IncomingMessage,
      {
        setHeader: () => {},
        writeHead(c: number) { status = c; return this; },
        end(b?: string) { payload = b ?? ''; return this; },
      } as unknown as ServerResponse,
    );
    expect(status).toBe(503);
    expect(JSON.parse(payload).error).toBe('writes_disabled');
    expect(surface.deleted).toHaveLength(0);
  });
});
