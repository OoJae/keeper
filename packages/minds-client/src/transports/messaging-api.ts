import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import {
  MindReplyTimeoutError,
  MindsHttpError,
  MindsShapeError,
  MindsUnreachableError,
} from '../errors.js';
import {
  CognitionBalanceSchema,
  ConversationListSchema,
  ConversationSchema,
  MessageRecordListSchema,
  SendResponseSchema,
  parseOrThrow,
  toMindMessage,
  unwrapArray,
  type MessageRecord,
} from '../schemas.js';
import {
  DEFAULT_AWAIT_TIMEOUT_MS,
  DEFAULT_HISTORY_PAGE_SIZE,
  DEFAULT_POLL_INTERVAL_MS,
  type AwaitOpts,
  type CognitionSampler,
  type ConversationRef,
  type Exchange,
  type HealthReport,
  type HistoryOpts,
  type MindMessage,
  type MindTransport,
  type SendReceipt,
} from '../types.js';

export type AuthHeaderMode = 'x-api-key' | 'x-access-key' | 'auto';
type AuthHeaderName = 'X-Api-Key' | 'X-Access-Key';

export interface MessagingApiTransportOptions {
  builderApiKey: string;
  mindId: string;
  baseUrl: string;
  authHeader: AuthHeaderMode;
  statePath: string;
  requestTimeoutMs?: number;
  /** Injected so tests and spikes can capture retry/auth notes without a console. */
  onNote?: (note: string) => void;
}

/** Mirrors the official client's policy (see docs/API-NOTES.md "Errors / retries / limits"). */
const RETRY_DELAYS_MS = {
  conflict409: [200, 400, 800],
  badGateway502: [300, 600],
  rateLimit429: [1000, 2000, 4000],
  network: [300, 900],
} as const;

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Which auth header actually works is remembered for the whole process, not per
 * instance: the answer is a property of the deployed platform, and re-probing it on
 * every new transport would double every 401 into two round trips.
 */
let processAuthHeader: AuthHeaderName | null = null;
let authNoteEmitted = false;

/** Test seam only — production code never resets this. */
export function __resetProcessAuthHeaderForTests(): void {
  processAuthHeader = null;
  authNoteEmitted = false;
}

interface StateFile {
  version: 1;
  conversations: Record<
    string,
    { conversationId: string; lastSeenFingerprint: string | null; updatedAt: string; raw?: unknown }
  >;
}

interface HttpResult {
  status: number;
  body: unknown;
  text: string;
  requestId: string | undefined;
}

interface HttpRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  json?: unknown;
  /** Return the 404 instead of throwing — used where "absent" is a normal answer. */
  tolerate404?: boolean;
}

export class MessagingApiTransport implements MindTransport, CognitionSampler {
  readonly kind = 'messaging-api' as const;

  private readonly opts: Required<Omit<MessagingApiTransportOptions, 'onNote'>> & {
    onNote: (note: string) => void;
  };
  private readonly statePath: string;
  private state: StateFile | null = null;

  constructor(options: MessagingApiTransportOptions) {
    this.opts = {
      ...options,
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
      requestTimeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      onNote: options.onNote ?? ((note) => console.warn(note)),
    };
    this.statePath = resolvePath(options.statePath);
  }

  // ---------------------------------------------------------------- conversations

  /**
   * Conversations are addressed by alias server-side, so the alias IS the persistence
   * mechanism: losing the state file costs one extra GET per alias, never data.
   */
  async ensureConversation(alias: string): Promise<ConversationRef> {
    const cached = this.readState().conversations[alias];
    if (cached) {
      return { alias, conversationId: cached.conversationId, raw: cached.raw ?? cached };
    }

    const found = await this.request({
      method: 'GET',
      path: `/v1/messaging/conversations/${encodeURIComponent(alias)}`,
      tolerate404: true,
    });

    let raw: unknown;
    if (found.status === 404) {
      const created = await this.request({
        method: 'POST',
        path: '/v1/messaging/conversation',
        json: { alias, mindId: this.opts.mindId },
      });
      raw = created.body;
    } else {
      raw = found.body;
    }

    const conversation = parseOrThrow(
      ConversationSchema,
      found.status === 404 ? 'POST /v1/messaging/conversation' : 'GET /v1/messaging/conversations/{alias}',
      raw,
    );

    this.mutateState((s) => {
      s.conversations[alias] = {
        conversationId: conversation.conversationId,
        lastSeenFingerprint: s.conversations[alias]?.lastSeenFingerprint ?? null,
        updatedAt: new Date().toISOString(),
        raw,
      };
    });

    return { alias, conversationId: conversation.conversationId, raw };
  }

  // ------------------------------------------------------------------------ send

  async send(alias: string, text: string): Promise<SendReceipt> {
    await this.ensureConversation(alias);

    // Capture the newest fingerprint BEFORE posting. Without this there is no way to
    // tell a fresh reply from history we have already seen.
    const before = await this.fetchHistory(alias, { limit: 1 });
    const f0 = newestFingerprint(before);

    const sentAt = new Date();
    const posted = await this.request({
      method: 'POST',
      path: '/v1/messaging/message',
      json: { alias, messageText: text },
    });

    // The send response shape is undocumented. If it hands us a fingerprint it is
    // strictly better than F0 (no window between the history read and the post).
    const parsed = parseOrThrow(SendResponseSchema, 'POST /v1/messaging/message', posted.body ?? {});
    const cursor = parsed.fingerprint ?? f0;

    this.mutateState((s) => {
      const entry = s.conversations[alias];
      if (entry) entry.lastSeenFingerprint = cursor;
    });

    return { alias, sentText: text, cursor, sentAt, raw: posted.body };
  }

  // ------------------------------------------------------------------ awaitReply

  async awaitReply(alias: string, opts: AwaitOpts): Promise<MindMessage> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_AWAIT_TIMEOUT_MS;
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    let cursor = opts.cursor;

    for (;;) {
      const records = await this.fetchHistory(alias, {
        limit: DEFAULT_HISTORY_PAGE_SIZE,
        ...(cursor !== null ? { after: cursor } : {}),
      });

      for (const record of records) {
        const message = toMindMessage(record);
        if (message.sender !== 'mind') continue;
        if (opts.cursor !== null && record.fingerprint === opts.cursor) continue;
        if (opts.skipEchoOfText !== undefined && message.text === opts.skipEchoOfText) continue;
        return message; // first match wins
      }

      // `after` is forward-only, so advancing past everything we just rejected means
      // old traffic is never re-read no matter how long we poll.
      const last = records.at(-1);
      if (last) {
        cursor = last.fingerprint;
        this.mutateState((s) => {
          const entry = s.conversations[alias];
          if (entry) entry.lastSeenFingerprint = cursor;
        });
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new MindReplyTimeoutError({ alias, cursor, waitedMs: Date.now() - startedAt });
      }
      await sleep(Math.min(jitter(pollIntervalMs), remaining));
    }
  }

  async sendAndAwaitReply(
    alias: string,
    text: string,
    opts: Partial<AwaitOpts> = {},
  ): Promise<Exchange> {
    const sent = await this.send(alias, text);
    const reply = await this.awaitReply(alias, {
      cursor: opts.cursor !== undefined ? opts.cursor : sent.cursor,
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.pollIntervalMs !== undefined ? { pollIntervalMs: opts.pollIntervalMs } : {}),
      skipEchoOfText: opts.skipEchoOfText ?? text,
    });
    return {
      sent,
      reply,
      latencyMs: Date.now() - sent.sentAt.getTime(),
      cognitionDelta: null, // filled in by withCallLog when credit sampling is on
    };
  }

  // --------------------------------------------------------------------- history

  async getHistory(alias: string, opts: HistoryOpts = {}): Promise<MindMessage[]> {
    const records = await this.fetchHistory(alias, {
      limit: opts.limit ?? DEFAULT_HISTORY_PAGE_SIZE,
      ...(opts.after !== undefined ? { after: opts.after } : {}),
    });
    return records.map(toMindMessage);
  }

  private async fetchHistory(
    alias: string,
    query: { limit?: number; after?: string },
  ): Promise<MessageRecord[]> {
    const res = await this.request({
      method: 'GET',
      path: `/v1/messaging/histories/${encodeURIComponent(alias)}`,
      query,
    });
    return parseOrThrow(
      MessageRecordListSchema,
      'GET /v1/messaging/histories/{alias}',
      unwrapArray(res.body),
    );
  }

  // ---------------------------------------------------------------------- health

  async healthCheck(): Promise<HealthReport> {
    try {
      const res = await this.request({ method: 'GET', path: '/v1/messaging/conversations' });
      const list = parseOrThrow(
        ConversationListSchema,
        'GET /v1/messaging/conversations',
        unwrapArray(res.body),
      );
      return {
        ok: true,
        class: 'OK',
        detail: `${list.length} conversation(s) visible; auth header ${processAuthHeader ?? this.primaryHeaderName()}`,
      };
    } catch (e) {
      if (e instanceof MindsShapeError) {
        return { ok: false, class: 'SHAPE', detail: e.message };
      }
      if (e instanceof MindsHttpError) {
        if (e.isAuth) {
          return {
            ok: false,
            class: 'AUTH',
            detail: `${e.status} — check MINDS_BUILDER_API_KEY and MINDS_AUTH_HEADER (${e.message})`,
          };
        }
        if (e.isNotFound) {
          return { ok: false, class: 'NOT_FOUND', detail: e.message };
        }
        return { ok: false, class: 'UNREACHABLE', detail: e.message };
      }
      if (e instanceof MindsUnreachableError) {
        return { ok: false, class: 'UNREACHABLE', detail: e.message };
      }
      return { ok: false, class: 'UNREACHABLE', detail: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Cost telemetry. Returns null on any failure — never breaks the caller. */
  async readCognition(): Promise<number | null> {
    try {
      const res = await this.request({
        method: 'GET',
        path: `/v1/minds/${encodeURIComponent(this.opts.mindId)}/credits`,
      });
      const balance = parseOrThrow(
        CognitionBalanceSchema,
        'GET /v1/minds/{mindId}/credits',
        res.body,
      );
      return balance.cognition;
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------ state file

  /** Opaque resume point for a crashed process. Null when nothing is cached. */
  getCachedCursor(alias: string): string | null {
    return this.readState().conversations[alias]?.lastSeenFingerprint ?? null;
  }

  private readState(): StateFile {
    if (this.state) return this.state;
    let loaded: StateFile = { version: 1, conversations: {} };
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.statePath, 'utf8'));
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as StateFile).conversations === 'object'
      ) {
        loaded = { version: 1, conversations: (parsed as StateFile).conversations ?? {} };
      }
    } catch {
      // Missing or corrupt state is recoverable: aliases re-resolve against the server.
    }
    this.state = loaded;
    return loaded;
  }

  /** Single process, no locking: read-modify-write the whole file. */
  private mutateState(fn: (state: StateFile) => void): void {
    const state = this.readState();
    fn(state);
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      writeFileSync(this.statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    } catch (e) {
      this.opts.onNote(
        `minds-client: could not write state file ${this.statePath} (${
          e instanceof Error ? e.message : String(e)
        }); continuing without cache`,
      );
    }
  }

  // ----------------------------------------------------------------------- HTTP

  private primaryHeaderName(): AuthHeaderName {
    return this.opts.authHeader === 'x-access-key' ? 'X-Access-Key' : 'X-Api-Key';
  }

  private async request(req: HttpRequest): Promise<HttpResult> {
    const url = this.buildUrl(req.path, req.query);
    let headerName: AuthHeaderName = processAuthHeader ?? this.primaryHeaderName();
    let authRetried = false;
    let n409 = 0;
    let n502 = 0;
    let n429 = 0;
    let nNetwork = 0;

    for (;;) {
      const init: RequestInit = {
        method: req.method,
        headers: {
          [headerName]: this.opts.builderApiKey,
          Accept: 'application/json',
          ...(req.json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(this.opts.requestTimeoutMs),
        ...(req.json !== undefined ? { body: JSON.stringify(req.json) } : {}),
      };

      const attempt = await tryFetch(url, init);

      if (!attempt.ok) {
        const delay = RETRY_DELAYS_MS.network[nNetwork];
        if (delay !== undefined) {
          nNetwork += 1;
          this.opts.onNote(
            `minds-client retry: network error on ${req.method} ${url} — attempt ${nNetwork} in ${delay}ms`,
          );
          await sleep(delay);
          continue;
        }
        throw new MindsUnreachableError({
          method: req.method,
          url,
          attempts: nNetwork + 1,
          cause: attempt.cause,
        });
      }

      const res = attempt.res;
      const text = await res.text().catch(() => '');
      const body = safeJsonParse(text);
      const requestId = extractRequestId(res, body);

      if (res.ok) {
        if (this.opts.authHeader === 'auto' && processAuthHeader === null) {
          processAuthHeader = headerName;
          if (headerName === 'X-Access-Key' && !authNoteEmitted) {
            authNoteEmitted = true;
            this.opts.onNote(
              'AUTH NOTE: X-Api-Key rejected, X-Access-Key accepted — platform behind its own changelog. ' +
                'Pin MINDS_AUTH_HEADER=x-access-key to skip the probe.',
            );
          }
        }
        return { status: res.status, body, text, requestId };
      }

      if (res.status === 404 && req.tolerate404) {
        return { status: 404, body, text, requestId };
      }

      if (
        (res.status === 401 || res.status === 403) &&
        this.opts.authHeader === 'auto' &&
        headerName === 'X-Api-Key' &&
        !authRetried
      ) {
        authRetried = true;
        headerName = 'X-Access-Key';
        this.opts.onNote(
          `minds-client: ${res.status} with X-Api-Key on ${req.method} ${url} — retrying once with X-Access-Key`,
        );
        continue;
      }

      const retryDelay = this.retryDelayFor(res, { n409, n502, n429 });
      if (retryDelay !== null) {
        if (res.status === 409) n409 += 1;
        else if (res.status === 502) n502 += 1;
        else n429 += 1;
        this.opts.onNote(
          `minds-client retry: ${res.status} on ${req.method} ${url} — retrying in ${retryDelay}ms`,
        );
        await sleep(retryDelay);
        continue;
      }

      throw new MindsHttpError({
        status: res.status,
        method: req.method,
        url,
        body,
        ...pickErrorFields(body),
        ...(requestId !== undefined ? { requestId } : {}),
      });
    }
  }

  private retryDelayFor(
    res: Response,
    counts: { n409: number; n502: number; n429: number },
  ): number | null {
    if (res.status === 409) return RETRY_DELAYS_MS.conflict409[counts.n409] ?? null;
    if (res.status === 502) return RETRY_DELAYS_MS.badGateway502[counts.n502] ?? null;
    if (res.status === 429) {
      const budget = RETRY_DELAYS_MS.rateLimit429[counts.n429];
      if (budget === undefined) return null;
      return retryAfterMs(res) ?? budget;
    }
    return null;
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.opts.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

// ------------------------------------------------------------------- free helpers

type FetchAttempt = { ok: true; res: Response } | { ok: false; cause: unknown };

async function tryFetch(url: string, init: RequestInit): Promise<FetchAttempt> {
  try {
    return { ok: true, res: await fetch(url, init) };
  } catch (cause) {
    return { ok: false, cause };
  }
}

/**
 * ASSUMPTION (unverified, spike:api-smoke must confirm): the histories endpoint returns
 * records oldest-first, so with limit=1 the single record is the newest. If the API turns
 * out to page newest-first, this and awaitReply's cursor advance both need to flip.
 */
function newestFingerprint(records: MessageRecord[]): string | null {
  return records.at(-1)?.fingerprint ?? null;
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after') ?? res.headers.get('retry_after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function extractRequestId(res: Response, body: unknown): string | undefined {
  const header = res.headers.get('x-request-id') ?? res.headers.get('request-id');
  if (header) return header;
  if (typeof body === 'object' && body !== null) {
    const rec = body as Record<string, unknown>;
    const id = rec['requestId'] ?? rec['request_id'];
    if (typeof id === 'string') return id;
  }
  return undefined;
}

/**
 * LIVE-VERIFIED 2026-08-20 — the real error envelope is nested, NOT the flat
 * `{ code, message, requestId }` that the official client's MindsApiError implies:
 *   { method, url, error: { extraInfo: [], type: "AUTH_FAILED",
 *                           subType: "UNKNOWN_ERROR", message: "Invalid or expired access key" } }
 * The flat branch below is kept for any surface that still answers the old way.
 */
function pickErrorFields(body: unknown): { code?: string; message?: string } {
  if (typeof body !== 'object' || body === null) return {};
  const rec = body as Record<string, unknown>;
  const out: { code?: string; message?: string } = {};

  const nested = rec['error'];
  if (typeof nested === 'object' && nested !== null) {
    const err = nested as Record<string, unknown>;
    const type = typeof err['type'] === 'string' ? err['type'] : undefined;
    const subType = typeof err['subType'] === 'string' ? err['subType'] : undefined;
    if (type !== undefined) {
      out.code = subType !== undefined && subType !== 'UNKNOWN_ERROR' ? `${type}/${subType}` : type;
    }
    if (typeof err['message'] === 'string') out.message = err['message'];
    if (out.code !== undefined || out.message !== undefined) return out;
  }

  if (typeof rec['code'] === 'string') out.code = rec['code'];
  if (typeof rec['message'] === 'string') out.message = rec['message'];
  else if (typeof nested === 'string') out.message = nested;
  return out;
}

function safeJsonParse(text: string): unknown {
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function jitter(ms: number): number {
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
