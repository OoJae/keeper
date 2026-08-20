import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MindReplyTimeoutError, MindsHttpError, MindsUnreachableError } from '../src/errors.js';
import {
  MessagingApiTransport,
  __resetProcessAuthHeaderForTests,
} from '../src/transports/messaging-api.js';

interface Call {
  method: string;
  url: URL;
  authHeader: string;
  authValue: string | null;
  body: unknown;
}

interface StubReply {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
  throws?: unknown;
}

let calls: Call[] = [];
let replies: StubReply[] = [];
let statePath: string;

function stubFetch(): void {
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const authHeader = Object.keys(headers).find((h) => h.toLowerCase().endsWith('-key')) ?? '';
    calls.push({
      method: init.method ?? 'GET',
      url: new URL(input),
      authHeader,
      authValue: headers[authHeader] ?? null,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const reply = replies.shift();
    if (!reply) throw new Error(`unexpected request: ${init.method} ${input}`);
    if (reply.throws) throw reply.throws;
    return new Response(reply.body === undefined ? '' : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...(reply.headers ?? {}) },
    });
  });
}

function transport(authHeader: 'x-api-key' | 'auto' = 'x-api-key'): MessagingApiTransport {
  return new MessagingApiTransport({
    builderApiKey: 'key-123',
    mindId: 'mind-abc',
    baseUrl: 'https://api.build.hellominds.ai',
    authHeader,
    statePath,
    onNote: () => {},
  });
}

const record = (fingerprint: string, senderType: number | null, messageText: string): unknown => ({
  fingerprint,
  senderType,
  messageText,
  createdAt: '2026-08-20T10:00:00.000Z',
});

beforeEach(() => {
  calls = [];
  replies = [];
  statePath = join(mkdtempSync(join(tmpdir(), 'keeper-minds-')), 'minds-state.json');
  __resetProcessAuthHeaderForTests();
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  expect(replies, 'test left unconsumed stub replies').toHaveLength(0);
});

describe('ensureConversation', () => {
  it('resolves an existing alias with a single GET', async () => {
    replies = [{ status: 200, body: { conversationId: 'conv-1', alias: 'group:42' } }];
    const ref = await transport().ensureConversation('group:42');

    expect(ref).toMatchObject({ alias: 'group:42', conversationId: 'conv-1' });
    expect(calls[0]?.url.pathname).toBe('/v1/messaging/conversations/group%3A42');
    expect(JSON.parse(readFileSync(statePath, 'utf8')).conversations['group:42'].conversationId).toBe(
      'conv-1',
    );
  });

  it('creates the conversation on 404 and does not re-resolve on the next call', async () => {
    replies = [
      { status: 404, body: { message: 'not found' } },
      { status: 200, body: { conversationId: 'conv-2' } },
    ];
    const t = transport();
    await t.ensureConversation('group:7');
    const again = await t.ensureConversation('group:7');

    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ method: 'POST' });
    expect(calls[1]?.body).toEqual({ alias: 'group:7', mindId: 'mind-abc' });
    expect(again.conversationId).toBe('conv-2');
  });

  it('re-resolves from the server when the state file is lost', async () => {
    replies = [
      { status: 200, body: { conversationId: 'conv-3' } },
      { status: 200, body: { conversationId: 'conv-3' } },
    ];
    await transport().ensureConversation('group:9');
    // A fresh instance with the same path but an in-memory cache that never saw it.
    statePath = join(mkdtempSync(join(tmpdir(), 'keeper-minds-')), 'gone.json');
    expect((await transport().ensureConversation('group:9')).conversationId).toBe('conv-3');
  });
});

describe('send', () => {
  it('captures the pre-send fingerprint as the cursor', async () => {
    replies = [
      { status: 200, body: { conversationId: 'c' } },
      { status: 200, body: [record('fp-old', 0, 'earlier')] },
      { status: 200, body: { accepted: true } },
    ];
    const receipt = await transport().send('a', 'hello');

    // A whole page, not limit=1: with one record the cursor is whichever END of the
    // conversation the server pages from, and that ordering is unverified.
    expect(calls[1]?.url.searchParams.get('limit')).toBe('50');
    expect(receipt.cursor).toBe('fp-old');
    expect(receipt.sentText).toBe('hello');
    expect(receipt.raw).toEqual({ accepted: true });
  });

  it('picks the pre-send high-water mark by createdAt, not by position', async () => {
    // An oldest-first server hands back [oldest .. newest]; a newest-first server the
    // reverse. Both must yield the same cursor and the same notBefore.
    const chrono = [
      { fingerprint: 'fp-1', senderType: 1, messageText: 'hi', createdAt: '2026-08-17T10:00:00.000Z' },
      { fingerprint: 'fp-2', senderType: 0, messageText: 'stale reply', createdAt: '2026-08-17T10:00:05.000Z' },
      { fingerprint: 'fp-3', senderType: 1, messageText: 'thanks', createdAt: '2026-08-17T10:01:00.000Z' },
    ];
    for (const page of [chrono, [...chrono].reverse()]) {
      calls = [];
      statePath = join(mkdtempSync(join(tmpdir(), 'keeper-minds-')), 'minds-state.json');
      replies = [
        { status: 200, body: { conversationId: 'c' } },
        { status: 200, body: page },
        { status: 200, body: { accepted: true } },
      ];
      const receipt = await transport().send('a', 'are you there?');
      expect(receipt.cursor).toBe('fp-3');
      expect(receipt.notBefore?.toISOString()).toBe('2026-08-17T10:01:00.000Z');
    }
  });

  it('prefers a fingerprint returned by the send response', async () => {
    replies = [
      { status: 200, body: { conversationId: 'c' } },
      { status: 200, body: [record('fp-old', 0, 'earlier')] },
      { status: 200, body: { fingerprint: 'fp-mine' } },
    ];
    expect((await transport().send('a', 'hi')).cursor).toBe('fp-mine');
  });

  it('uses a null cursor on an empty history', async () => {
    replies = [
      { status: 200, body: { conversationId: 'c' } },
      { status: 200, body: [] },
      { status: 200, body: {} },
    ];
    expect((await transport().send('a', 'hi')).cursor).toBeNull();
  });
});

describe('awaitReply', () => {
  it('returns the first mind record, skipping humans and our own echo', async () => {
    replies = [
      {
        status: 200,
        body: [record('fp-1', 1, 'human chatter'), record('fp-2', 0, 'hello')],
      },
      { status: 200, body: [record('fp-3', 2, 'the answer')] },
    ];
    const reply = await transport().awaitReply('a', {
      cursor: 'fp-0',
      pollIntervalMs: 1,
      timeoutMs: 5000,
      skipEchoOfText: 'hello',
    });

    expect(reply).toMatchObject({ id: 'fp-3', text: 'the answer', sender: 'mind' });
    // Forward-only: the second poll starts after the last record of the first page.
    expect(calls[0]?.url.searchParams.get('after')).toBe('fp-0');
    expect(calls[1]?.url.searchParams.get('after')).toBe('fp-2');
  });

  it('never treats an unknown senderType as the Mind', async () => {
    replies = [{ status: 200, body: [record('fp-9', 99, 'who am i')] }];
    await expect(
      transport().awaitReply('a', { cursor: null, pollIntervalMs: 1, timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(MindReplyTimeoutError);
  });

  it('never returns a record older than notBefore, even with a bad cursor', async () => {
    // The catastrophic case: cursor points too far back, so a 3-day-old Mind message is
    // inside the page. The timestamp floor must reject it rather than call it a reply.
    replies = [
      {
        status: 200,
        body: [
          { fingerprint: 'fp-2', senderType: 0, messageText: 'stale', createdAt: '2026-08-17T10:00:05.000Z' },
          { fingerprint: 'fp-4', senderType: 1, messageText: 'ours', createdAt: '2026-08-20T12:00:00.000Z' },
        ],
      },
      {
        status: 200,
        body: [{ fingerprint: 'fp-5', senderType: 0, messageText: 'fresh', createdAt: '2026-08-20T12:00:02.000Z' }],
      },
    ];
    const reply = await transport().awaitReply('a', {
      cursor: 'fp-1',
      pollIntervalMs: 1,
      timeoutMs: 5000,
      notBefore: new Date('2026-08-20T11:59:00.000Z'),
    });
    expect(reply).toMatchObject({ id: 'fp-5', text: 'fresh' });
  });

  it('does not reject a record that carries no createdAt', async () => {
    replies = [{ status: 200, body: [{ fingerprint: 'fp-x', senderType: 0, messageText: 'no clock' }] }];
    const reply = await transport().awaitReply('a', {
      cursor: null,
      pollIntervalMs: 1,
      timeoutMs: 5000,
      notBefore: new Date('2999-01-01T00:00:00.000Z'),
    });
    expect(reply.id).toBe('fp-x');
  });

  it('persists the fingerprint it returned, so a resume does not re-deliver it', async () => {
    replies = [
      { status: 200, body: { conversationId: 'c' } },
      { status: 200, body: [record('fp-r', 0, 'the answer')] },
    ];
    const t = transport();
    await t.ensureConversation('a');
    await t.awaitReply('a', { cursor: 'fp-0', pollIntervalMs: 1, timeoutMs: 5000 });
    expect(t.getCachedCursor('a')).toBe('fp-r');
  });

  it('does not blow past timeoutMs when the server sends a long Retry-After', async () => {
    replies = [{ status: 429, body: { message: 'slow' }, headers: { 'retry-after': '30' } }];
    const started = Date.now();
    await expect(
      transport().awaitReply('a', { cursor: 'fp-0', pollIntervalMs: 1, timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(MindsHttpError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('reports a resumable cursor on timeout', async () => {
    replies = [{ status: 200, body: [record('fp-h', 1, 'human')] }];
    await transport()
      .awaitReply('a', { cursor: null, pollIntervalMs: 1, timeoutMs: 0 })
      .then(
        () => expect.unreachable('should have timed out'),
        (e: MindReplyTimeoutError) => {
          expect(e.kind).toBe('timeout');
          expect(e.cursor).toBe('fp-h');
          expect(e.alias).toBe('a');
        },
      );
  });
});

describe('retries', () => {
  it('retries 502 then succeeds', async () => {
    replies = [
      { status: 502, body: { message: 'bad gateway' } },
      { status: 200, body: { conversationId: 'c' } },
    ];
    expect((await transport().ensureConversation('a')).conversationId).toBe('c');
    expect(calls).toHaveLength(2);
  });

  it('gives up on 429 after the budget and throws MindsHttpError', async () => {
    replies = [
      { status: 429, body: { code: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 429, body: { code: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 429, body: { code: 'rate_limited' }, headers: { 'retry-after': '0' } },
      { status: 429, body: { code: 'rate_limited' }, headers: { 'retry-after': '0' } },
    ];
    const err = await transport()
      .ensureConversation('a')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MindsHttpError);
    expect((err as MindsHttpError).status).toBe(429);
    expect((err as MindsHttpError).code).toBe('rate_limited');
    expect(calls).toHaveLength(4);
  });

  it('retries network failures twice then throws MindsUnreachableError', async () => {
    const boom = new Error('ECONNREFUSED');
    replies = [{ status: 0, throws: boom }, { status: 0, throws: boom }, { status: 0, throws: boom }];
    await expect(transport().ensureConversation('a')).rejects.toBeInstanceOf(MindsUnreachableError);
    expect(calls).toHaveLength(3);
  });

  it('does not retry a 400', async () => {
    replies = [{ status: 400, body: { code: 'alias_mind_mismatch' } }];
    await expect(transport().ensureConversation('a')).rejects.toBeInstanceOf(MindsHttpError);
    expect(calls).toHaveLength(1);
  });

  it('honours retry_after from the JSON body, not only from the header', async () => {
    replies = [
      { status: 429, body: { retry_after: 0, message: 'slow' } },
      { status: 200, body: { conversationId: 'c' } },
    ];
    const started = Date.now();
    expect((await transport().ensureConversation('a')).conversationId).toBe('c');
    // Without body support this would fall back to the fixed 1000 ms budget.
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('clamps an absurd Retry-After instead of parking the process for a day', async () => {
    vi.useFakeTimers();
    try {
      const notes: string[] = [];
      replies = [
        { status: 429, body: { message: 'slow' }, headers: { 'retry-after': '86400' } },
        { status: 200, body: { conversationId: 'c' } },
      ];
      const t = new MessagingApiTransport({
        builderApiKey: 'key-123',
        mindId: 'mind-abc',
        baseUrl: 'https://api.build.hellominds.ai',
        authHeader: 'x-api-key',
        statePath,
        onNote: (n) => notes.push(n),
      });
      const pending = t.ensureConversation('a');
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await pending).conversationId).toBe('c');
      expect(notes.join('\n')).toContain('retrying in 30000ms');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('error envelope', () => {
  // Captured live from the platform on 2026-08-20.
  const AUTH_401 = {
    method: 'GET',
    url: '/v1/messaging/conversations',
    error: {
      extraInfo: [],
      type: 'AUTH_FAILED',
      subType: 'UNKNOWN_ERROR',
      message: 'Invalid or expired access key',
    },
  };
  const MISSING_HEADER_400 = {
    method: 'GET',
    url: '/v1/messaging/conversations',
    error: {
      extraInfo: [],
      type: 'BAD_INPUT',
      subType: 'VALIDATION_FAILED',
      message: 'Authentication required: x-api-key header required in build mode',
    },
  };

  it('reads code and message out of the nested error object', async () => {
    replies = [{ status: 401, body: AUTH_401 }];
    const err = (await transport()
      .ensureConversation('a')
      .catch((e: unknown) => e)) as MindsHttpError;

    expect(err.code).toBe('AUTH_FAILED');
    expect(err.apiMessage).toBe('Invalid or expired access key');
    expect(err.body).toEqual(AUTH_401);
    expect(err.isAuth).toBe(true);
  });

  it('joins type and subType when the subType is informative', async () => {
    replies = [{ status: 400, body: MISSING_HEADER_400 }];
    const err = (await transport()
      .ensureConversation('a')
      .catch((e: unknown) => e)) as MindsHttpError;
    expect(err.code).toBe('BAD_INPUT/VALIDATION_FAILED');
  });

  it('classifies a missing-auth-header 400 as AUTH, not UNREACHABLE', async () => {
    replies = [{ status: 400, body: MISSING_HEADER_400 }];
    expect((await transport().healthCheck()).class).toBe('AUTH');
  });
});

describe('auth fallback', () => {
  it('retries once with X-Access-Key on 401 in auto mode and remembers it', async () => {
    replies = [
      { status: 401, body: { message: 'nope' } },
      { status: 200, body: { conversationId: 'c' } },
      { status: 200, body: [] },
    ];
    const t = transport('auto');
    await t.ensureConversation('a');
    await t.getHistory('a');

    expect(calls[0]?.authHeader).toBe('X-Api-Key');
    expect(calls[1]?.authHeader).toBe('X-Access-Key');
    expect(calls[2]?.authHeader).toBe('X-Access-Key'); // remembered, no second probe
  });

  it('does not fall back when the header is pinned', async () => {
    replies = [{ status: 401, body: { message: 'nope' } }];
    await expect(transport('x-api-key').ensureConversation('a')).rejects.toBeInstanceOf(MindsHttpError);
    expect(calls).toHaveLength(1);
  });
});

describe('healthCheck', () => {
  it.each([
    [200, [{ conversationId: 'c' }], 'OK', true],
    [401, { message: 'no' }, 'AUTH', false],
    [404, { message: 'no' }, 'NOT_FOUND', false],
  ] as const)('classifies %i as %s', async (status, body, expected, ok) => {
    replies = [{ status, body }];
    const report = await transport().healthCheck();
    expect(report.class).toBe(expected);
    expect(report.ok).toBe(ok);
  });

  it('classifies a drifted payload as SHAPE and still does not throw', async () => {
    replies = [{ status: 200, body: [{ id: 'no-conversation-id' }] }];
    const report = await transport().healthCheck();
    expect(report).toMatchObject({ ok: false, class: 'SHAPE' });
  });

  it('classifies a dead host as UNREACHABLE', async () => {
    const boom = new Error('getaddrinfo ENOTFOUND');
    replies = [{ status: 0, throws: boom }, { status: 0, throws: boom }, { status: 0, throws: boom }];
    expect((await transport().healthCheck()).class).toBe('UNREACHABLE');
  });
});

describe('readCognition', () => {
  it('returns the balance and null on failure', async () => {
    replies = [{ status: 200, body: { mindId: 'mind-abc', cognition: 812 } }];
    expect(await transport().readCognition()).toBe(812);

    replies = [{ status: 500, body: { message: 'down' } }];
    expect(await transport().readCognition()).toBeNull();
  });
});
