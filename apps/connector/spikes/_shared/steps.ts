/**
 * Sequential step runner + the human-in-the-loop helper + shared Mind interactions.
 *
 * Transport types are DERIVED from @keeper/minds-client's own return types
 * (`ReturnType<typeof createMindClient>`), so this file makes no independent claims
 * about the adapter's shape — if the adapter changes, this fails to compile loudly
 * instead of drifting.
 */
import { createInterface } from 'node:readline/promises';

import { createMindClient } from '@keeper/minds-client';

import type { FailureClass, SpikeReporter } from './report.js';

export type MindTransport = ReturnType<typeof createMindClient>['transport'];
export type MindReply = Awaited<ReturnType<MindTransport['awaitReply']>>;
export type MindHistoryMessage = Awaited<ReturnType<MindTransport['getHistory']>>[number];
export type MindSendResult = Awaited<ReturnType<MindTransport['send']>>;

// --- failures ---------------------------------------------------------------

export class SpikeFailure extends Error {
  readonly code: string;
  readonly cls: FailureClass;

  constructor(code: string, cls: FailureClass, message: string) {
    super(message);
    this.name = 'SpikeFailure';
    this.code = code;
    this.cls = cls;
  }
}

export function failSpike(code: string, cls: FailureClass, message: string): never {
  throw new SpikeFailure(code, cls, message);
}

/**
 * Maps an adapter error onto a spike code+class. Classification is by error NAME
 * rather than `instanceof` so a future refactor of minds-client's class hierarchy
 * cannot silently turn an INFRA failure into an "unexpected error".
 */
export function classifyError(error: unknown): SpikeFailure {
  if (error instanceof SpikeFailure) return error;
  const err = error as { name?: string; message?: string; status?: number; code?: string; requestId?: string };
  const name = err?.name ?? '';
  const detail = detailOf(err);

  switch (name) {
    case 'MindsUnreachableError':
      return new SpikeFailure(
        'ENDPOINT_UNREACHABLE',
        'INFRA',
        `no HTTP response from the Minds API — ${detail}`,
      );
    case 'MindsShapeError':
      return new SpikeFailure(
        'SHAPE_DRIFT',
        'INFRA',
        `the API answered 2xx but the payload did not match our schema — ${detail}`,
      );
    case 'MindReplyTimeoutError':
      return new SpikeFailure(
        'MIND_SILENT',
        'MIND',
        `the Mind never replied within the timeout — ${detail}`,
      );
    case 'MindsHttpError': {
      const status = typeof err.status === 'number' ? err.status : 0;
      if (status === 404) {
        return new SpikeFailure('ENDPOINT_NOT_FOUND', 'INFRA', `endpoint not found — ${detail}`);
      }
      if (status === 401 || status === 403) {
        return new SpikeFailure(
          'AUTH_REJECTED',
          'INFRA',
          `the API rejected our credentials (${status}) — ${detail}`,
        );
      }
      if (status === 429) {
        return new SpikeFailure(
          'RATE_LIMITED',
          'INFRA',
          `rate limited (429) after the adapter's retries — ${detail}`,
        );
      }
      return new SpikeFailure('HTTP_ERROR', 'INFRA', `HTTP ${status || '???'} — ${detail}`);
    }
    default:
      return new SpikeFailure(
        'UNEXPECTED_ERROR',
        'PRECONDITION',
        `unexpected error (${name || 'unknown'}) — ${detail}`,
      );
  }
}

function detailOf(err: { message?: string; status?: number; code?: string; requestId?: string }): string {
  const bits = [err?.message ?? String(err)];
  if (err?.code) bits.push(`code=${err.code}`);
  if (err?.requestId) bits.push(`requestId=${err.requestId}`);
  return bits.join(' · ');
}

// --- step runner ------------------------------------------------------------

export interface Step {
  readonly name: string;
  run: () => Promise<void>;
}

/** Runs steps in order; the first failure stops the run. Returns true if all passed. */
export async function runSteps(r: SpikeReporter, steps: Step[]): Promise<boolean> {
  r.plan(steps.length);
  for (const step of steps) {
    r.step(step.name);
    try {
      await step.run();
      r.markStepPassed();
    } catch (error) {
      const failure = classifyError(error);
      if (failure.code === 'UNEXPECTED_ERROR') {
        r.plain(indentBlock((error as Error)?.stack ?? String(error)));
      }
      r.fail(failure.code, failure.cls, failure.message);
      return false;
    }
  }
  return true;
}

function indentBlock(text: string): string {
  return text
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n');
}

// --- human in the loop ------------------------------------------------------

export interface HumanMessage {
  /** What the human must do, in plain words. */
  readonly instructions: string;
  /** The exact text to copy-paste (printed unprefixed so it survives selection). */
  readonly copyPaste?: string;
}

export type HumanWait =
  | { until: () => Promise<boolean>; pollMs?: number; timeoutMs: number }
  | { pressEnter: true };

const BOX_WIDTH = 78;

/**
 * Prints a boxed HUMAN ACTION REQUIRED block, then waits — either for Enter or
 * until a predicate goes true. The copy-paste payload is printed WITHOUT any box
 * or prefix characters so it can be selected and pasted verbatim.
 */
export async function humanAction(
  r: SpikeReporter,
  message: string | HumanMessage,
  wait: HumanWait,
): Promise<void> {
  const msg: HumanMessage = typeof message === 'string' ? { instructions: message } : message;

  r.plain('');
  r.plain(`┌─ HUMAN ACTION REQUIRED ${'─'.repeat(Math.max(0, BOX_WIDTH - 24))}┐`);
  r.plain('');
  for (const l of msg.instructions.split('\n')) r.plain(`  ${l}`);
  if (msg.copyPaste !== undefined) {
    r.plain('');
    r.plain('  Copy everything between the two cut lines, exactly as it appears:');
    r.plain('');
    r.plain(`8<${'-'.repeat(BOX_WIDTH - 6)}cut`);
    r.plain(msg.copyPaste);
    r.plain(`8<${'-'.repeat(BOX_WIDTH - 6)}cut`);
  }
  r.plain('');
  r.plain(`└${'─'.repeat(BOX_WIDTH)}┘`);
  r.plain('');

  if ('pressEnter' in wait) {
    if (!process.stdin.isTTY) {
      failSpike(
        'HUMAN_STEP_SKIPPED',
        'PRECONDITION',
        'this step needs a human at the keyboard but stdin is not a TTY. ' +
          'Re-run this spike in an interactive terminal (not piped, not CI).',
      );
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      await rl.question('Press Enter when you have done the above… ');
    } finally {
      rl.close();
    }
    r.info('human confirmed the step is done');
    return;
  }

  const pollMs = wait.pollMs ?? 5_000;
  const deadline = Date.now() + wait.timeoutMs;
  const totalS = Math.round(wait.timeoutMs / 1000);
  let lastPrinted = 0;
  for (;;) {
    if (await wait.until()) {
      clearTicker();
      r.info('condition satisfied — continuing');
      return;
    }
    if (Date.now() >= deadline) {
      clearTicker();
      failSpike(
        'HUMAN_STEP_SKIPPED',
        'PRECONDITION',
        `waited ${totalS}s for the human step above and it never completed. ` +
          'Do the step, then re-run this spike.',
      );
    }
    const elapsedS = Math.round((wait.timeoutMs - (deadline - Date.now())) / 1000);
    if (process.stdout.isTTY) {
      process.stdout.write(`\rwaiting… ${elapsedS}s/${totalS}s`);
    } else if (elapsedS - lastPrinted >= 30) {
      lastPrinted = elapsedS;
      process.stdout.write(`waiting… ${elapsedS}s/${totalS}s\n`);
    }
    await sleep(pollMs);
  }
}

function clearTicker(): void {
  if (process.stdout.isTTY) process.stdout.write('\r'.padEnd(40, ' ') + '\r');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// --- shared Mind interactions ----------------------------------------------

/**
 * Every spike calls this first: a dead platform must fail fast with an INFRA verdict
 * before any Mind-level step can muddy the GO/NO-GO.
 */
export async function healthGate(r: SpikeReporter, transport: MindTransport): Promise<void> {
  const health = await transport.healthCheck();
  r.raw('health-check', health);
  if (health.ok) {
    r.pass(`transport "${transport.kind}" is healthy (${health.class}) — ${health.detail}`);
    return;
  }
  const map: Record<string, { code: string; cls: FailureClass }> = {
    AUTH: { code: 'AUTH_REJECTED', cls: 'INFRA' },
    NOT_FOUND: { code: 'ENDPOINT_NOT_FOUND', cls: 'INFRA' },
    UNREACHABLE: { code: 'ENDPOINT_UNREACHABLE', cls: 'INFRA' },
    SHAPE: { code: 'SHAPE_DRIFT', cls: 'INFRA' },
  };
  const mapped = map[health.class] ?? { code: 'HTTP_ERROR', cls: 'INFRA' as FailureClass };
  failSpike(
    mapped.code,
    mapped.cls,
    `health check failed (${health.class}) — ${health.detail}. ` +
      'Nothing downstream of this can be trusted; fix the transport first.',
  );
}

export interface ExchangeOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  /** Label used in log lines and raw dumps. */
  readonly label?: string;
  /** When true, a silent Mind is returned as null instead of failing the step. */
  readonly tolerateSilence?: boolean;
}

export interface ExchangeResult {
  readonly sent: MindSendResult;
  readonly reply: MindReply | null;
  readonly latencyMs: number;
}

/** send() + awaitReply(), with both raw payloads dumped for evidence. */
export async function exchange(
  r: SpikeReporter,
  transport: MindTransport,
  alias: string,
  text: string,
  options: ExchangeOptions = {},
): Promise<ExchangeResult> {
  const label = options.label ?? 'exchange';
  r.info(`-> ${label}: ${text}`);
  const sent = await transport.send(alias, text);
  r.raw(`${label}-send-response`, sent.raw);
  r.info(`send accepted · cursor=${sent.cursor ?? 'null'} · sentAt=${sent.sentAt.toISOString()}`);

  const started = Date.now();
  try {
    const reply = await transport.awaitReply(alias, {
      cursor: sent.cursor,
      timeoutMs: options.timeoutMs ?? 120_000,
      pollIntervalMs: options.pollIntervalMs ?? 3_000,
      skipEchoOfText: text,
    });
    const latencyMs = Date.now() - started;
    r.raw(`${label}-reply`, reply.raw);
    r.info(`<- ${label} reply after ${(latencyMs / 1000).toFixed(1)}s [${reply.sender}]: ${reply.text ?? '<no text>'}`);
    return { sent, reply, latencyMs };
  } catch (error) {
    const failure = classifyError(error);
    if (failure.code === 'MIND_SILENT' && options.tolerateSilence === true) {
      const latencyMs = Date.now() - started;
      r.warn(`${label}: no reply within ${(latencyMs / 1000).toFixed(0)}s (tolerated by this step)`);
      return { sent, reply: null, latencyMs };
    }
    throw failure;
  }
}

export interface PollOptions {
  readonly alias: string;
  /** Forward-only history cursor (fingerprint). null = from the beginning. */
  cursor: string | null;
  readonly deadline: number;
  readonly pollMs?: number;
  readonly label: string;
  /** Called for every new message; return true to stop polling. */
  readonly match: (message: MindHistoryMessage) => boolean;
  /** Called for every new message that did not match (for logging/leak detection). */
  readonly onOther?: (message: MindHistoryMessage) => void;
}

export interface PollOutcome {
  readonly matched: MindHistoryMessage | null;
  readonly seen: MindHistoryMessage[];
  readonly cursor: string | null;
}

/**
 * Polls history forward from `cursor` until `match` returns true or the deadline passes.
 * Used where awaitReply is the wrong tool: proactive/circle probes must keep reading
 * past an immediate acknowledgement.
 */
export async function pollHistoryFor(
  r: SpikeReporter,
  transport: MindTransport,
  options: PollOptions,
): Promise<PollOutcome> {
  const pollMs = options.pollMs ?? 10_000;
  const seen: MindHistoryMessage[] = [];
  // Until the first message arrives there is no cursor to advance, so an empty conversation
  // re-reads the same head of history every poll. Dedupe by id rather than double-counting.
  const seenIds = new Set<string>();
  let cursor = options.cursor;
  const totalS = Math.max(1, Math.round((options.deadline - Date.now()) / 1000));
  let lastTick = 0;

  for (;;) {
    let batch: MindHistoryMessage[];
    try {
      batch = await transport.getHistory(
        options.alias,
        cursor === null ? {} : { after: cursor },
      );
    } catch (error) {
      clearTicker();
      throw classifyError(error);
    }

    for (const message of batch) {
      if (typeof message.id === 'string') {
        if (seenIds.has(message.id)) continue;
        seenIds.add(message.id);
        cursor = message.id;
      }
      seen.push(message);
      if (options.match(message)) {
        clearTicker();
        r.raw(`${options.label}-match`, message.raw);
        return { matched: message, seen, cursor };
      }
      options.onOther?.(message);
    }

    if (Date.now() >= options.deadline) {
      clearTicker();
      return { matched: null, seen, cursor };
    }

    const elapsedS = totalS - Math.round((options.deadline - Date.now()) / 1000);
    if (process.stdout.isTTY) {
      process.stdout.write(`\rwaiting… ${elapsedS}s/${totalS}s (${options.label}, ${seen.length} msgs seen)`);
    } else if (elapsedS - lastTick >= 30) {
      lastTick = elapsedS;
      process.stdout.write(`waiting… ${elapsedS}s/${totalS}s (${options.label})\n`);
    }
    await sleep(pollMs);
  }
}
