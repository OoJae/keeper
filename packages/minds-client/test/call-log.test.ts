import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { MindsHttpError } from '../src/errors.js';
import { CallLog, withCallLog, type CallLogLine } from '../src/logging/call-log.js';
import type {
  AwaitOpts,
  ConversationRef,
  Exchange,
  HealthReport,
  MindMessage,
  MindTransport,
  SendReceipt,
} from '../src/types.js';

class FakeTransport implements MindTransport {
  readonly kind = 'messaging-api' as const;
  cognition: number | null = 1000;
  failSendAndAwait: unknown = null;
  cognitionThrows = false;
  readCognitionCalls = 0;

  async readCognition(): Promise<number | null> {
    this.readCognitionCalls += 1;
    if (this.cognitionThrows) throw new Error('credits endpoint down');
    const value = this.cognition;
    if (this.cognition !== null) this.cognition -= 3; // each read is "later"
    return value;
  }

  async ensureConversation(alias: string): Promise<ConversationRef> {
    return { alias, conversationId: 'c', raw: {} };
  }
  async send(alias: string, text: string): Promise<SendReceipt> {
    return { alias, sentText: text, cursor: 'fp-0', sentAt: new Date(), notBefore: null, raw: {} };
  }
  async awaitReply(_alias: string, _opts: AwaitOpts): Promise<MindMessage> {
    return { id: 'fp-1', text: 'ok', sender: 'mind', at: null, raw: {} };
  }
  async sendAndAwaitReply(alias: string, text: string): Promise<Exchange> {
    if (this.failSendAndAwait) throw this.failSendAndAwait;
    return {
      sent: await this.send(alias, text),
      reply: await this.awaitReply(alias, { cursor: null }),
      latencyMs: 5,
      cognitionDelta: null,
    };
  }
  async getHistory(): Promise<MindMessage[]> {
    return [];
  }
  async healthCheck(): Promise<HealthReport> {
    return { ok: true, class: 'OK', detail: '' };
  }
}

let logPath: string;
let log: CallLog;
let fake: FakeTransport;

const lines = (): CallLogLine[] =>
  readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CallLogLine);

beforeEach(() => {
  logPath = join(mkdtempSync(join(tmpdir(), 'keeper-log-')), 'nested', 'minds-calls.jsonl');
  log = new CallLog(logPath);
  fake = new FakeTransport();
});

describe('withCallLog', () => {
  it('samples credits around sendAndAwaitReply only, and reports the delta', async () => {
    const t = withCallLog(fake, log, { creditSampling: true });
    const exchange = await t.sendAndAwaitReply('a', 'hi');

    // after - before, so a burn is negative.
    expect(exchange.cognitionDelta).toBe(-3);
    expect(fake.readCognitionCalls).toBe(2);

    const [line] = lines();
    expect(line).toMatchObject({
      op: 'sendAndAwaitReply',
      transport: 'messaging-api',
      alias: 'a',
      ok: true,
      cognitionBefore: 1000,
      cognitionAfter: 997,
      cognitionDelta: -3,
    });
    expect(typeof line?.latencyMs).toBe('number');
  });

  it('does not sample credits on any other op', async () => {
    const t = withCallLog(fake, log, { creditSampling: true });
    await t.ensureConversation('a');
    await t.getHistory('a');
    await t.send('a', 'x');
    await t.healthCheck();

    expect(fake.readCognitionCalls).toBe(0);
    expect(lines().map((l) => l.op)).toEqual(['ensureConversation', 'getHistory', 'send', 'healthCheck']);
    expect(lines().every((l) => l.cognitionDelta === undefined)).toBe(true);
  });

  it('logs a failing healthCheck as ok:false even though it never throws', async () => {
    const unhealthy: MindTransport = {
      ...fake,
      kind: 'messaging-api',
      healthCheck: async () => ({ ok: false, class: 'AUTH', detail: '401 — bad key' }),
      sendAndAwaitReply: (a, t) => fake.sendAndAwaitReply(a, t),
      ensureConversation: (a) => fake.ensureConversation(a),
      send: (a, t) => fake.send(a, t),
      awaitReply: (a, o) => fake.awaitReply(a, o),
      getHistory: () => fake.getHistory(),
    };

    const report = await withCallLog(unhealthy, log).healthCheck();

    expect(report.class).toBe('AUTH');
    expect(lines()[0]).toMatchObject({ op: 'healthCheck', ok: false, errClass: 'AUTH' });
    expect(lines()[0]?.rawExcerpt).toContain('401');
  });

  it('degrades to a null delta when the credits read fails, without breaking the exchange', async () => {
    fake.cognitionThrows = true;
    const t = withCallLog(fake, log, { creditSampling: true });
    const exchange = await t.sendAndAwaitReply('a', 'hi');

    expect(exchange.reply.text).toBe('ok');
    expect(exchange.cognitionDelta).toBeNull();
    expect(lines()[0]?.cognitionDelta).toBeNull();
  });

  it('skips sampling entirely when creditSampling is off', async () => {
    const t = withCallLog(fake, log, { creditSampling: false });
    await t.sendAndAwaitReply('a', 'hi');
    expect(fake.readCognitionCalls).toBe(0);
    expect(lines()[0]?.cognitionDelta).toBeNull();
  });

  it('logs failures with the error class, status and a raw excerpt, then rethrows', async () => {
    fake.failSendAndAwait = new MindsHttpError({
      status: 429,
      method: 'POST',
      url: 'https://api.build.hellominds.ai/v1/messaging/message',
      body: { code: 'rate_limited', message: 'slow down' },
      code: 'rate_limited',
      requestId: 'req-77',
    });

    await expect(withCallLog(fake, log).sendAndAwaitReply('a', 'hi')).rejects.toBeInstanceOf(
      MindsHttpError,
    );

    expect(lines()[0]).toMatchObject({
      ok: false,
      errClass: 'http',
      errCode: 'rate_limited',
      httpStatus: 429,
      requestId: 'req-77',
    });
    expect(lines()[0]?.rawExcerpt).toContain('slow down');
  });
});
