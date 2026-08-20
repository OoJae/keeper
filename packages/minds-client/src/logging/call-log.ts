import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { MindsError, MindsHttpError, MindsShapeError } from '../errors.js';
import {
  isCognitionSampler,
  type AwaitOpts,
  type ConversationRef,
  type Exchange,
  type HealthReport,
  type HistoryOpts,
  type MindMessage,
  type MindTransport,
  type SendReceipt,
} from '../types.js';

const RAW_EXCERPT_BYTES = 2048;

export interface CallLogLine {
  ts: string;
  transport: string;
  op: string;
  alias: string | null;
  ok: boolean;
  latencyMs: number;
  httpStatus?: number;
  requestId?: string;
  cognitionBefore?: number | null;
  cognitionAfter?: number | null;
  cognitionDelta?: number | null;
  errClass?: string;
  errCode?: string;
  rawExcerpt?: string;
}

/**
 * JSONL, one appendFileSync per line. Not buffered and not async on purpose: at our
 * volume (a few calls a minute) the syscall cost is irrelevant, and an unbuffered file
 * survives a crash mid-demo — which is exactly when we need the evidence. Greppable and
 * jq-able for the demo-day cost slide.
 */
export class CallLog {
  readonly path: string;
  private warned = false;

  constructor(path: string) {
    this.path = resolvePath(path);
    try {
      mkdirSync(dirname(this.path), { recursive: true });
    } catch {
      // append() will report it once.
    }
  }

  append(line: CallLogLine): void {
    try {
      appendFileSync(this.path, `${JSON.stringify(line)}\n`, 'utf8');
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        console.warn(
          `minds-client: call log at ${this.path} is not writable (${
            e instanceof Error ? e.message : String(e)
          }); continuing without it`,
        );
      }
    }
  }
}

export interface WithCallLogOptions {
  /** Default true. Sampling costs two extra HTTP calls per exchange. */
  creditSampling?: boolean;
  /** Defaults to the transport's own readCognition() when it has one. */
  readCognition?: () => Promise<number | null>;
}

/**
 * A decorator, not a base class and not baked into the transports: logging is an
 * observability concern, and a transport that must also log is a transport that is
 * harder to test and impossible to reuse unlogged (e.g. inside a spike).
 */
export function withCallLog(
  transport: MindTransport,
  log: CallLog,
  options: WithCallLogOptions = {},
): MindTransport {
  const creditSampling = options.creditSampling ?? true;
  const readCognition =
    options.readCognition ??
    (isCognitionSampler(transport) ? () => transport.readCognition() : undefined);

  async function record<T>(op: string, alias: string | null, run: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await run();
      log.append({
        ts: new Date().toISOString(),
        transport: transport.kind,
        op,
        alias,
        ok: true,
        latencyMs: Date.now() - startedAt,
      });
      return result;
    } catch (e) {
      log.append({
        ts: new Date().toISOString(),
        transport: transport.kind,
        op,
        alias,
        ok: false,
        latencyMs: Date.now() - startedAt,
        ...describeError(e),
      });
      throw e;
    }
  }

  return {
    kind: transport.kind,

    ensureConversation(alias: string): Promise<ConversationRef> {
      return record('ensureConversation', alias, () => transport.ensureConversation(alias));
    },

    send(alias: string, text: string): Promise<SendReceipt> {
      return record('send', alias, () => transport.send(alias, text));
    },

    awaitReply(alias: string, opts: AwaitOpts): Promise<MindMessage> {
      return record('awaitReply', alias, () => transport.awaitReply(alias, opts));
    },

    getHistory(alias: string, opts?: HistoryOpts): Promise<MindMessage[]> {
      return record('getHistory', alias, () => transport.getHistory(alias, opts));
    },

    /**
     * healthCheck reports failure instead of throwing, so `ok` must come from the report
     * — otherwise every failed probe would be logged as a success.
     *
     * The MindTransport contract says healthCheck NEVER throws, and this decorator is
     * the MindTransport product code actually holds — so it upholds the contract here
     * rather than trusting the wrapped transport to. A probe that explodes is exactly
     * when the caller least wants an exception.
     */
    async healthCheck(): Promise<HealthReport> {
      const startedAt = Date.now();
      let report: HealthReport;
      try {
        report = await transport.healthCheck();
      } catch (e) {
        report = {
          ok: false,
          class: 'UNREACHABLE',
          detail: `healthCheck threw: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
      log.append({
        ts: new Date().toISOString(),
        transport: transport.kind,
        op: 'healthCheck',
        alias: null,
        ok: report.ok,
        latencyMs: Date.now() - startedAt,
        ...(report.ok ? {} : { errClass: report.class, rawExcerpt: excerpt(report.detail) }),
      });
      return report;
    },

    /**
     * Credit sampling wraps this op ONLY. It costs two extra HTTP round trips, which is
     * acceptable once per exchange and absurd on every getHistory poll.
     *
     * cognitionDelta is an ESTIMATE: it is the balance change across the exchange, and a
     * Mind may burn credits on background activity (proactive messages, scheduled skills)
     * inside the same window. Report it as an order-of-magnitude cost, never as a price.
     * Sign convention: after - before, so a burn is NEGATIVE.
     */
    async sendAndAwaitReply(
      alias: string,
      text: string,
      opts?: Partial<AwaitOpts>,
    ): Promise<Exchange> {
      const sample = creditSampling && readCognition !== undefined;
      const before = sample ? await safeSample(readCognition) : null;
      const startedAt = Date.now();

      try {
        const exchange = await transport.sendAndAwaitReply(alias, text, opts);
        const after = sample ? await safeSample(readCognition) : null;
        const delta = before !== null && after !== null ? after - before : null;

        log.append({
          ts: new Date().toISOString(),
          transport: transport.kind,
          op: 'sendAndAwaitReply',
          alias,
          ok: true,
          latencyMs: Date.now() - startedAt,
          cognitionBefore: before,
          cognitionAfter: after,
          cognitionDelta: delta,
        });

        return { ...exchange, cognitionDelta: delta };
      } catch (e) {
        const after = sample ? await safeSample(readCognition) : null;
        log.append({
          ts: new Date().toISOString(),
          transport: transport.kind,
          op: 'sendAndAwaitReply',
          alias,
          ok: false,
          latencyMs: Date.now() - startedAt,
          cognitionBefore: before,
          cognitionAfter: after,
          cognitionDelta: before !== null && after !== null ? after - before : null,
          ...describeError(e),
        });
        throw e;
      }
    },
  };
}

/** A failing credits read logs null and is otherwise invisible. */
async function safeSample(read: (() => Promise<number | null>) | undefined): Promise<number | null> {
  if (!read) return null;
  try {
    return await read();
  } catch {
    return null;
  }
}

function describeError(e: unknown): Partial<CallLogLine> {
  const out: Partial<CallLogLine> = {};
  if (e instanceof MindsError) {
    out.errClass = e.kind;
  } else if (e instanceof Error) {
    out.errClass = e.name;
  } else {
    out.errClass = 'unknown';
  }

  if (e instanceof MindsHttpError) {
    out.httpStatus = e.status;
    if (e.code !== undefined) out.errCode = e.code;
    if (e.requestId !== undefined) out.requestId = e.requestId;
    out.rawExcerpt = excerpt(e.body);
  } else if (e instanceof MindsShapeError) {
    out.rawExcerpt = excerpt(e.rawBody);
  } else if (e instanceof Error) {
    out.rawExcerpt = excerpt(e.message);
  }

  return out;
}

function excerpt(value: unknown): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value) ?? String(value);
  } catch {
    text = String(value);
  }
  return text.length > RAW_EXCERPT_BYTES ? `${text.slice(0, RAW_EXCERPT_BYTES)}…[truncated]` : text;
}
