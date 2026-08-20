import type { ZodIssue } from 'zod';

/**
 * Every error this package throws carries a `kind` discriminant so callers can
 * `switch` instead of instanceof-chaining across package boundaries (source-linked
 * workspace packages can end up with two class identities under some tool setups;
 * the string discriminant is immune to that).
 */
export type MindsErrorKind =
  | 'unreachable'
  | 'http'
  | 'shape'
  | 'timeout'
  | 'transport_unavailable'
  | 'config';

export abstract class MindsError extends Error {
  abstract readonly kind: MindsErrorKind;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export function isMindsError(e: unknown): e is MindsError {
  return e instanceof MindsError;
}

/** No HTTP response at all: DNS failure, ECONNREFUSED, TLS failure, or request timeout. */
export class MindsUnreachableError extends MindsError {
  readonly kind = 'unreachable' as const;
  readonly method: string;
  readonly url: string;
  readonly attempts: number;

  constructor(args: { method: string; url: string; attempts: number; cause?: unknown }) {
    super(
      `Minds API unreachable after ${args.attempts} attempt(s): ${args.method} ${args.url}` +
        (args.cause instanceof Error ? ` — ${args.cause.message}` : ''),
      { cause: args.cause },
    );
    this.method = args.method;
    this.url = args.url;
    this.attempts = args.attempts;
  }
}

/** An HTTP response we could not use, thrown only after the retry budget is spent. */
export class MindsHttpError extends MindsError {
  readonly kind = 'http' as const;
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly body: unknown;
  readonly method: string;
  readonly url: string;
  /** The platform's own error text, kept separate from our composed `message`. */
  readonly apiMessage?: string;

  constructor(args: {
    status: number;
    method: string;
    url: string;
    body: unknown;
    code?: string;
    requestId?: string;
    message?: string;
  }) {
    super(
      `Minds API ${args.status} on ${args.method} ${args.url}` +
        (args.code ? ` [${args.code}]` : '') +
        (args.message ? `: ${args.message}` : '') +
        (args.requestId ? ` (requestId=${args.requestId})` : ''),
    );
    this.status = args.status;
    this.method = args.method;
    this.url = args.url;
    this.body = args.body;
    if (args.code !== undefined) this.code = args.code;
    if (args.requestId !== undefined) this.requestId = args.requestId;
    if (args.message !== undefined) this.apiMessage = args.message;
  }

  get isAuth(): boolean {
    if (this.status === 401 || this.status === 403) return true;
    if (this.code?.startsWith('AUTH_FAILED') === true) return true;
    // LIVE-VERIFIED 2026-08-20: a *missing* auth header answers 400, not 401 —
    // {"error":{"type":"BAD_INPUT","subType":"VALIDATION_FAILED",
    //  "message":"Authentication required: x-api-key header required in build mode"}}
    return this.status === 400 && /authentication required/i.test(this.apiMessage ?? '');
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/**
 * The platform answered, but not in a shape we depend on. We never coerce or guess:
 * a loud, copy-pasteable banner is the whole point — it is the fastest possible path
 * from "the demo broke" to "here is the field that changed".
 */
export class MindsShapeError extends MindsError {
  readonly kind = 'shape' as const;
  readonly endpoint: string;
  readonly zodIssues: ZodIssue[];
  readonly rawBody: unknown;

  constructor(endpoint: string, zodIssues: ZodIssue[], rawBody: unknown) {
    super(
      `SHAPE DRIFT at ${endpoint}: ${zodIssues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`,
    );
    this.endpoint = endpoint;
    this.zodIssues = zodIssues;
    this.rawBody = rawBody;
  }

  override toString(): string {
    const rule = '='.repeat(72);
    const issues = this.zodIssues
      .map((i) => `  - ${i.path.join('.') || '<root>'}: ${i.message} (${i.code})`)
      .join('\n');
    return [
      rule,
      `SHAPE DRIFT at ${this.endpoint}`,
      rule,
      'The Minds API returned something we do not understand. Raw body:',
      safeStringify(this.rawBody),
      '',
      'Zod issues:',
      issues || '  (none)',
      rule,
    ].join('\n');
  }
}

/** Polled past the deadline without a Mind reply. `cursor` is a resumable poll point. */
export class MindReplyTimeoutError extends MindsError {
  readonly kind = 'timeout' as const;
  readonly alias: string;
  /** Where polling had advanced to — persist this to resume instead of re-reading history. */
  readonly cursor: string | null;
  readonly waitedMs: number;

  constructor(args: { alias: string; cursor: string | null; waitedMs: number }) {
    super(
      `Mind did not reply on alias "${args.alias}" within ${args.waitedMs}ms ` +
        `(resume cursor: ${args.cursor ?? 'null'})`,
    );
    this.alias = args.alias;
    this.cursor = args.cursor;
    this.waitedMs = args.waitedMs;
  }
}

/** Thrown by transports that exist at type level only (see transports/telegram-relay.ts). */
export class TransportUnavailableError extends MindsError {
  readonly kind = 'transport_unavailable' as const;
  readonly transport: string;
  readonly detail: string;

  constructor(transport: string, detail: string) {
    super(`Transport "${transport}" is not implemented: ${detail}`);
    this.transport = transport;
    this.detail = detail;
  }
}

/** Bad or missing environment. Message always states the exact fix. */
export class MindsConfigError extends MindsError {
  readonly kind = 'config' as const;
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      ['Minds client configuration is invalid. Fix your .env:', ...problems.map((p) => `  - ${p}`)].join(
        '\n',
      ),
    );
    this.problems = problems;
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
