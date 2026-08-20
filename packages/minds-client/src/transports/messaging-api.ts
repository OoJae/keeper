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

/** Cap on server-supplied `Retry-After`. Beyond this, failing fast beats stalling. */
const MAX_RETRY_AFTER_MS = 30_000;

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
  /**
   * Absolute `Date.now()` budget for the CALLER (e.g. awaitReply's deadline). Retries
   * that would sleep past it are not attempted, so a retry storm can never turn a
   * `timeoutMs: 5_000` await into a minutes-long stall.
   */
  deadline?: number;
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

    // Snapshot history BEFORE posting. Without this there is no way to tell a fresh
    // reply from history we have already seen. A FULL page is read, not limit=1: with
    // limit=1 the single record is whichever END of the conversation the server pages
    // from, and that ordering is unverified — reading a page lets us pick the newest by
    // its own `createdAt` instead of by position (see newestOf()).
    const before = await this.fetchHistory(alias, { limit: DEFAULT_HISTORY_PAGE_SIZE });
    const highWater = newestOf(before);
    const f0 = highWater?.fingerprint ?? null;

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

    return {
      alias,
      sentText: text,
      cursor,
      sentAt,
      notBefore: highWater ? recordTime(highWater) : null,
      raw: posted.body,
    };
  }

  // ------------------------------------------------------------------ awaitReply

  async awaitReply(alias: string, opts: AwaitOpts): Promise<MindMessage> {
    const timeoutMs = opts.timeoutMs ?? DEFAULT_AWAIT_TIMEOUT_MS;
    const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    const floor = opts.notBefore ?? null;
    let cursor = opts.cursor;

    for (;;) {
      const records = await this.fetchHistory(
        alias,
        { limit: DEFAULT_HISTORY_PAGE_SIZE, ...(cursor !== null ? { after: cursor } : {}) },
        deadline,
      );

      for (const record of records) {
        const message = toMindMessage(record);
        if (message.sender !== 'mind') continue;
        if (opts.cursor !== null && record.fingerprint === opts.cursor) continue;
        if (opts.skipEchoOfText !== undefined && message.text === opts.skipEchoOfText) continue;
        // Timestamp floor. The cursor alone cannot be trusted to exclude old traffic
        // while the paging order is unverified; a server-clock timestamp can.
        if (floor !== null && message.at !== null && message.at.getTime() < floor.getTime()) continue;
        this.rememberCursor(alias, record.fingerprint); // so a resume does not re-deliver it
        return message; // first match wins
      }

      // `after` is forward-only, so advancing past everything we just rejected means
      // old traffic is never re-read no matter how long we poll.
      const last = records.at(-1);
      if (last) {
        cursor = last.fingerprint;
        this.rememberCursor(alias, cursor);
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
      notBefore: opts.notBefore !== undefined ? opts.notBefore : sent.notBefore,
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
    deadline?: number,
  ): Promise<MessageRecord[]> {
    const res = await this.request({
      method: 'GET',
      path: `/v1/messaging/histories/${encodeURIComponent(alias)}`,
      query,
      ...(deadline !== undefined ? { deadline } : {}),
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
            status: e.status,
          };
        }
        if (e.isNotFound) {
          return { ok: false, class: 'NOT_FOUND', detail: e.message, status: e.status };
        }
        return { ok: false, class: 'UNREACHABLE', detail: e.message, status: e.status };
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

  private rememberCursor(alias: string, fingerprint: string | null): void {
    this.mutateState((s) => {
      const entry = s.conversations[alias];
      if (entry) entry.lastSeenFingerprint = fingerprint;
    });
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
        if (delay !== undefined && this.affordable(delay, req.deadline)) {
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

      const retryDelay = this.retryDelayFor(res, body, { n409, n502, n429 });
      if (retryDelay !== null && this.affordable(retryDelay, req.deadline)) {
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

  /** A retry we cannot afford within the caller's budget is not a retry, it is a stall. */
  private affordable(delayMs: number, deadline: number | undefined): boolean {
    if (deadline === undefined) return true;
    return Date.now() + delayMs < deadline;
  }

  private retryDelayFor(
    res: Response,
    body: unknown,
    counts: { n409: number; n502: number; n429: number },
  ): number | null {
    if (res.status === 409) return RETRY_DELAYS_MS.conflict409[counts.n409] ?? null;
    if (res.status === 502) return RETRY_DELAYS_MS.badGateway502[counts.n502] ?? null;
    if (res.status === 429) {
      const budget = RETRY_DELAYS_MS.rateLimit429[counts.n429];
      if (budget === undefined) return null;
      // Server guidance wins over our fixed budget, but only up to a cap: an
      // unclamped `Retry-After: 86400` would park a demo for a day.
      const guided = retryAfterMs(res, body);
      return guided === null ? budget : Math.min(guided, MAX_RETRY_AFTER_MS);
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
 * Newest record in a page, chosen by the SERVER's own `createdAt` rather than by
 * position — because the paging order is UNVERIFIED (spike:api-smoke must settle it)
 * and position is the one thing that depends on it. Falls back to the last element
 * only when no record carries a timestamp.
 *
 * Residual risk, deliberately accepted: on an oldest-first server whose history is
 * longer than one page, page 1 is not the newest page, so this high-water mark is too
 * low. `AwaitOpts.notBefore` is the guard that keeps that from becoming a false reply
 * (it is derived from the same timestamps, so a too-low cursor only costs re-reads).
 */
function newestOf(records: MessageRecord[]): MessageRecord | null {
  let best: MessageRecord | null = null;
  let bestAt = Number.NEGATIVE_INFINITY;
  for (const record of records) {
    const at = recordTime(record)?.getTime() ?? Number.NEGATIVE_INFINITY;
    if (best === null || at >= bestAt) {
      best = record;
      bestAt = at;
    }
  }
  return best;
}

function recordTime(record: MessageRecord): Date | null {
  if (record.createdAt === undefined) return null;
  const d = new Date(record.createdAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Honours `Retry-After` as a header AND as a JSON body field; callers clamp the result. */
function retryAfterMs(res: Response, body: unknown): number | null {
  const raw =
    res.headers.get('retry-after') ??
    res.headers.get('retry_after') ??
    retryAfterFromBody(body);
  if (raw === null || raw === '') return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(String(raw));
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function retryAfterFromBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const rec = body as Record<string, unknown>;
  for (const key of ['retry_after', 'retryAfter', 'retryAfterSeconds'] as const) {
    const value = rec[key];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
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
