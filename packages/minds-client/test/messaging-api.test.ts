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

    expect(calls[1]?.url.searchParams.get('limit')).toBe('1');
    expect(receipt.cursor).toBe('fp-old');
    expect(receipt.sentText).toBe('hello');
    expect(receipt.raw).toEqual({ accepted: true });
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
