/**
 * The Mind speaking first.
 *
 * Everything else in the connector reads a reply to something it sent. But the Steward is
 * instructed (charter Message 6) to send a nightly digest, day-2 check-ins and at-risk
 * alerts on its own initiative, and `spikes/proactive-probe.ts` proved it genuinely can:
 * a server-dated message arrived 74s after its own scheduled time, unprompted. Without
 * something reading those, native autonomy is real and invisible — and "autonomy is
 * native, not cron-faked" is the claim this project is built on.
 *
 * Costs no Cognition: `Pick<MindTransport, 'getHistory'>` is a GET, and the type makes
 * that structural rather than a promise in a comment — this class cannot reach `send`.
 *
 * Concurrency: every sweep runs as a job on the SAME SequentialQueue key as Mind
 * exchanges, so a poll can never land between "we sent the envelope" and "awaitReply
 * returned" and steal the reply the caller is waiting for. There is no correlation id in
 * the platform, so that ordering is the only thing that keeps the two apart.
 */
import { extractDirective, type KeeperDirective } from '@keeper/protocol';

import type { ConnectorConfig } from '../config.js';
import type { Mirror } from '../db/mirror.js';
import { log } from '../log.js';
import type { MindMessage, MindTransport } from '@keeper/minds-client';
import { executeDirective, type ExecutionContext } from './executor.js';
import type { SequentialQueue } from './queue.js';
import type { TelegramSurface } from '../telegram/surface.js';

const CURSOR_KEY = 'mind_watch_cursor';
const FLOOR_KEY = 'mind_watch_floor_ms';
const CLAIMED_KEY = 'mind_watch_claimed';

/** Actions that must never fire without a message to anchor them to. */
const DESTRUCTIVE = new Set(['delete', 'mute', 'warn', 'reward']);

export interface MindWatcherDeps {
  readonly transport: Pick<MindTransport, 'getHistory'>;
  readonly mirror: Mirror;
  readonly surface: TelegramSurface;
  readonly queue: SequentialQueue;
  readonly config: ConnectorConfig;
  readonly now?: () => number;
}

export interface SweepResult {
  scanned: number;
  dispatched: number;
  skipped: number;
  cursor: string | null;
  reason?: 'paused' | 'flood_guard' | 'cold_start';
}

export type Unprompted =
  | { kind: 'directive'; directive: KeeperDirective; rawBlock: string; warnings: string[]; converted?: string }
  | { kind: 'prose'; directive: KeeperDirective };

/**
 * What an unsolicited Mind message means.
 *
 * A directive executes normally, EXCEPT that destructive actions are downgraded: with no
 * triggering message there is nothing to anchor a delete or a warn to, and an unanchored
 * destructive directive is exactly the shape of a hallucination. Bare prose becomes a
 * `digest`, because that branch already means "DM the creator, never put it in the group"
 * — routing prose through `flag_creator` instead would spill Mind chit-chat into the
 * community whenever the DM failed.
 */
export function classifyUnprompted(text: string): Unprompted {
  const parsed = extractDirective(text);
  if (parsed.kind === 'ok') {
    if (DESTRUCTIVE.has(parsed.directive.action)) {
      const target = 'target_member' in parsed.directive ? parsed.directive.target_member : undefined;
      return {
        kind: 'directive',
        rawBlock: parsed.rawBlock,
        warnings: parsed.warnings,
        converted: 'unsolicited_destructive',
        directive: {
          action: 'flag_creator',
          ...(target === undefined ? {} : { target_member: target }),
          message:
            `Keeper proposed "${parsed.directive.action}" with no message to act on. ` +
            `Reasoning: ${parsed.directive.reasoning || '(none given)'}`,
          reasoning: parsed.directive.reasoning,
          confidence: parsed.directive.confidence,
        },
      };
    }
    return {
      kind: 'directive',
      directive: parsed.directive,
      rawBlock: parsed.rawBlock,
      warnings: parsed.warnings,
    };
  }
  return {
    kind: 'prose',
    directive: {
      action: 'digest',
      message: text,
      reasoning: 'unprompted prose from the Mind',
      confidence: 'low',
    },
  };
}

export class MindWatcher {
  /** Set by createConnector: lets the digest scheduler stand its fallback down. */
  onDigestDelivered: ((tsMs: number) => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private pending = false;
  private readonly now: () => number;

  constructor(private readonly deps: MindWatcherDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  start(): void {
    const interval = this.deps.config.watchIntervalMs;
    if (interval <= 0) {
      log.info('mind_watch_disabled', { note: 'KEEPER_WATCH_INTERVAL_MS=0' });
      return;
    }
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
    log.info('mind_watch_started', { intervalMs: interval });
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Queues one sweep. Returns false when one is already waiting — no point stacking them. */
  tick(): boolean {
    if (this.pending) return false;
    this.pending = true;
    const accepted = this.deps.queue.enqueue(this.deps.config.mindAlias, async () => {
      try {
        await this.sweep();
      } finally {
        this.pending = false;
      }
    });
    if (!accepted) this.pending = false;
    return accepted;
  }

  /** Called by the router at the end of an exchange, so a digest is not stuck behind the poll. */
  async sweep(opts: { skipFingerprint?: string } = {}): Promise<SweepResult> {
    const { mirror, transport, config } = this.deps;

    if (mirror.isPaused()) {
      return { scanned: 0, dispatched: 0, skipped: 0, cursor: null, reason: 'paused' };
    }

    const cursor = mirror.getSetting(CURSOR_KEY) ?? null;
    const page = await transport.getHistory(config.mindAlias, {
      limit: 50,
      ...(cursor === null ? {} : { after: cursor }),
    });

    // Cold start: adopt the present as the baseline. Dispatching a backlog of old messages
    // into a live group would be the worst possible first act.
    if (cursor === null) {
      const newest = newestOf(page);
      if (newest !== null) {
        mirror.setSetting(CURSOR_KEY, newest.id, this.now());
        mirror.setSetting(FLOOR_KEY, String(recordTime(newest) ?? this.now()), this.now());
      }
      log.info('mind_watch_seeded', { at: newest?.id ?? null, scanned: page.length });
      return { scanned: page.length, dispatched: 0, skipped: page.length, cursor: newest?.id ?? null, reason: 'cold_start' };
    }

    const claimed = mirror.getSetting(CLAIMED_KEY) ?? undefined;
    const floor = Number(mirror.getSetting(FLOOR_KEY) ?? '0');
    // LIVE-VERIFIED 2026-08-25: `?after=<fingerprint>` does NOT filter on this deployment —
    // asking for records after the NEWEST fingerprint still returns the whole page. So the
    // cursor cannot be trusted to give us only new messages, and the timestamp floor is the
    // real guard: strictly newer than anything we have already considered. Without this the
    // watcher re-reads all history every sweep and the flood guard fires forever.
    const candidates = page.filter((m) => {
      if (m.sender !== 'mind') return false;
      if (m.id === opts.skipFingerprint || m.id === claimed) return false;
      const at = recordTime(m);
      // Undated records cannot be placed in time. They are let through rather than lost,
      // because the alternative is silently dropping a real digest.
      return at === null || at > floor;
    });

    const newest = newestOf(page);
    if (newest !== null) {
      mirror.setSetting(CURSOR_KEY, newest.id, this.now());
      // Advance the floor every sweep, not just at cold start: it is what actually stops
      // the same message being considered twice.
      const newestAt = recordTime(newest);
      if (newestAt !== null && newestAt > floor) {
        mirror.setSetting(FLOOR_KEY, String(newestAt), this.now());
      }
    }

    // A lost cursor or a misbehaving `after` would otherwise replay every old directive
    // into the live group. Skipping silently is bad; flooding on camera is worse.
    if (candidates.length > config.watchMaxDispatchPerPass) {
      log.warn('mind_watch_flood_guard', { found: candidates.length, max: config.watchMaxDispatchPerPass });
      await this.deps.surface.sendDirectMessage(
        config.creatorTelegramId,
        `Keeper found ${candidates.length} unread messages from the Mind at once and did not act on any of them. ` +
          `That usually means the watch cursor was lost. Nothing was posted to the group.`,
      );
      return { scanned: page.length, dispatched: 0, skipped: candidates.length, cursor: newest?.id ?? null, reason: 'flood_guard' };
    }

    let dispatched = 0;
    for (const message of candidates) {
      await this.dispatch(message);
      dispatched += 1;
    }
    if (dispatched > 0) log.info('mind_watch_dispatched', { count: dispatched });
    return { scanned: page.length, dispatched, skipped: candidates.length - dispatched, cursor: newest?.id ?? null };
  }

  private async dispatch(message: MindMessage): Promise<void> {
    const { mirror, surface, config } = this.deps;
    const text = message.text ?? '';
    if (text.trim() === '') return;

    const classified = classifyUnprompted(text);
    const ctx: ExecutionContext = {
      chatId: config.groupChatId,
      creatorTelegramId: config.creatorTelegramId,
      nowMs: this.now(),
      deleteWindowMs: config.deleteWindowMs,
    };
    if (classified.kind === 'directive') ctx.rawBlock = classified.rawBlock;

    const warnings = classified.kind === 'directive' ? classified.warnings : [];
    const outcome = await executeDirective({ surface, mirror }, classified.directive, warnings, ctx);

    // event_id NULL is the marker: the Mind did this on its own initiative. That single
    // predicate is the "Unprompted actions" feed.
    mirror.recordAction({
      eventId: null,
      action: outcome.action,
      originalAction: classified.kind === 'prose' ? 'none' : classified.directive.action,
      targetHandle: outcome.targetHandle,
      targetTelegramId: outcome.targetTelegramId,
      message: 'message' in classified.directive ? (classified.directive.message ?? '') : '',
      reasoning: classified.directive.reasoning,
      confidence: classified.directive.confidence,
      gated: false,
      warnings: [...warnings, 'unprompted'],
      converted: classified.kind === 'prose' ? 'unprompted_prose' : classified.converted,
      status: outcome.status,
      detail: outcome.detail,
      rawReply: text,
      tsMs: this.now(),
      ...(outcome.postedChatId === undefined ? {} : { postedChatId: outcome.postedChatId }),
      ...(outcome.postedMessageId === undefined ? {} : { postedMessageId: outcome.postedMessageId }),
    });
    if (outcome.action === 'digest' && outcome.status === 'executed') {
      this.onDigestDelivered?.(recordTime(message) ?? this.now());
    }
    log.info('mind_unprompted', {
      action: outcome.action,
      status: outcome.status,
      kind: classified.kind,
      at: message.at?.toISOString() ?? 'unknown',
    });
  }
}

function recordTime(m: MindMessage): number | null {
  return m.at instanceof Date && !Number.isNaN(m.at.getTime()) ? m.at.getTime() : null;
}

/** Newest by the server's own clock, never by position — page order is unverified. */
function newestOf(page: readonly MindMessage[]): MindMessage | null {
  let best: MindMessage | null = null;
  let bestAt = -Infinity;
  for (const m of page) {
    const at = recordTime(m) ?? -Infinity;
    if (best === null || at >= bestAt) {
      best = m;
      bestAt = at;
    }
  }
  return best;
}
