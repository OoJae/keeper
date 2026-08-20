/**
 * The one interface product code sees.
 *
 * Two rules that the types cannot enforce on their own:
 *  - Cursors are OPAQUE STRINGS at this boundary. The Messaging API's cursor is a
 *    `fingerprint`; a future Telegram transport's would be a message id. Neither
 *    concept may leak into product code — it only ever stores and replays the string.
 *  - `raw` is ALWAYS carried. This is a beta platform whose responses are partly
 *    undocumented; discarding evidence makes the next drift undebuggable.
 */

export type TransportKind = 'messaging-api' | 'telegram-relay';

export type SenderKind = 'mind' | 'human' | 'unknown';

export type HealthClass = 'OK' | 'AUTH' | 'NOT_FOUND' | 'UNREACHABLE' | 'SHAPE';

export const DEFAULT_AWAIT_TIMEOUT_MS = 120_000;
export const DEFAULT_POLL_INTERVAL_MS = 3_000;
export const DEFAULT_HISTORY_PAGE_SIZE = 50;

export interface ConversationRef {
  readonly alias: string;
  readonly conversationId: string;
  readonly raw: unknown;
}

export interface SendReceipt {
  readonly alias: string;
  readonly sentText: string;
  /** Opaque resume point captured immediately BEFORE the send. */
  readonly cursor: string | null;
  readonly sentAt: Date;
  /**
   * High-water mark on the SERVER's clock: the newest `createdAt` seen in history
   * immediately before the send, or null when history was empty / untimestamped.
   * Pass it to {@link AwaitOpts.notBefore} so that a wrong cursor cannot promote an
   * old message into a "reply" — the cursor is an optimisation, this is the guard.
   */
  readonly notBefore: Date | null;
  readonly raw: unknown;
}

export interface AwaitOpts {
  /** Opaque cursor to poll forward from. `null` means "from the beginning of history". */
  readonly cursor: string | null;
  /** Default {@link DEFAULT_AWAIT_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
  /** Default {@link DEFAULT_POLL_INTERVAL_MS}; applied with +/-20% jitter. */
  readonly pollIntervalMs?: number;
  /** Defensive: ignore a record whose text is exactly this (an echo of our own send). */
  readonly skipEchoOfText?: string;
  /**
   * Reject any record whose `createdAt` is strictly older than this instant. Records
   * with no `createdAt` are NOT rejected (we cannot judge them, and rejecting them
   * would mean never seeing a reply on a server that omits timestamps).
   *
   * This is the ordering-independent safety net under the cursor: history paging order
   * is unverified (see transports/messaging-api.ts), so a cursor may be too permissive.
   * A timestamp floor taken from the server's own clock cannot be.
   */
  readonly notBefore?: Date | null;
}

export interface MindMessage {
  readonly id: string;
  readonly text: string | null;
  readonly sender: SenderKind;
  readonly at: Date | null;
  readonly raw: unknown;
}

export interface Exchange {
  readonly sent: SendReceipt;
  readonly reply: MindMessage;
  readonly latencyMs: number;
  /** Signed change in the Mind's credit balance; negative means credits were burned. */
  readonly cognitionDelta: number | null;
}

export interface HealthReport {
  readonly ok: boolean;
  readonly class: HealthClass;
  readonly detail: string;
  /**
   * The HTTP status, when the platform actually answered. `class` alone cannot carry this:
   * it folds 429/500/503 into UNREACHABLE, which reads as "no HTTP response at all" and
   * points the operator at their network. A rate-limited or briefly-500ing platform is not
   * unreachable, and on day 1 that difference decides a transport NO-GO. Absent when no
   * response was received (DNS, TLS, connection refused) or the transport cannot report it.
   */
  readonly status?: number;
}

export interface HistoryOpts {
  readonly limit?: number;
  readonly after?: string;
}

export interface MindTransport {
  readonly kind: TransportKind;

  /** Idempotent: resolves the alias, creating the conversation only if it does not exist. */
  ensureConversation(alias: string): Promise<ConversationRef>;

  send(alias: string, text: string): Promise<SendReceipt>;

  /**
   * Separate from {@link send} on purpose: a probe can await without sending, and a
   * process that crashed mid-exchange can resume from a persisted cursor.
   */
  awaitReply(alias: string, opts: AwaitOpts): Promise<MindMessage>;

  sendAndAwaitReply(alias: string, text: string, opts?: Partial<AwaitOpts>): Promise<Exchange>;

  getHistory(alias: string, opts?: HistoryOpts): Promise<MindMessage[]>;

  /** Never throws. Classifies whatever went wrong instead. */
  healthCheck(): Promise<HealthReport>;
}

/**
 * Optional capability. A transport that can price an exchange implements this; the
 * call log auto-detects it. Returns null rather than throwing when credits are
 * unreadable — cost telemetry must never break an exchange.
 */
export interface CognitionSampler {
  readCognition(): Promise<number | null>;
}

export function isCognitionSampler(value: unknown): value is CognitionSampler {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { readCognition?: unknown }).readCognition === 'function'
  );
}
