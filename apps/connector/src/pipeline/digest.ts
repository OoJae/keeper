/**
 * The nightly digest, native first.
 *
 * BUILD_PLAN Phase 3 wants the digest to be the Mind's own doing, not a cron job wearing a
 * costume — "autonomy is native, not cron-faked" is the rubric line. spike:proactive proved
 * the Mind can schedule and send on its own, so this scheduler's job is to ASK once and
 * then get out of the way; the watcher delivers whatever the Mind sends.
 *
 * Three layers, in the order we would rather show them:
 *   1. native   — arm the Mind a few hours ahead; it chooses the moment and writes every word
 *   2. fallback — if nothing arrived by a cutoff, send a `scheduled_digest` envelope
 *   3. manual   — `/keeper digest`, so the beat can be filmed without waiting for nightfall
 *
 * In all three the CONTENT comes from the Mind's memory. This file computes no counts, no
 * "who went quiet", no leaderboard — that would be the connector doing the remembering,
 * which is the one thing the project is not allowed to do.
 *
 * Which path fired is recorded, so a fallback digest is never mistaken for native autonomy.
 */
import type { ConnectorConfig } from '../config.js';
import type { Mirror } from '../db/mirror.js';
import { log } from '../log.js';
import type { EventRouter } from './router.js';

const ARMED = 'digest_armed_';
const DELIVERED = 'digest_delivered_';
const FALLBACK = 'digest_fallback_';

export interface DigestDeps {
  readonly mirror: Mirror;
  readonly router: Pick<EventRouter, 'ingest'>;
  readonly transport: { sendAndAwaitReply(alias: string, text: string, opts?: { timeoutMs?: number }): Promise<unknown> };
  readonly queue: { enqueue(key: string, job: () => Promise<void>): boolean };
  readonly config: ConnectorConfig;
  readonly now?: () => number;
}

/** `YYYY-MM-DD` in the community's own offset. Pure. */
export function localDayKey(nowMs: number, utcOffsetMinutes: number): string {
  return new Date(nowMs + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Absolute ms of HH:MM local, on the day containing nowMs. Pure. */
export function localTimeOnDay(nowMs: number, utcOffsetMinutes: number, minutesAfterMidnight: number): number {
  const dayMs = 86_400_000;
  const shifted = nowMs + utcOffsetMinutes * 60_000;
  const startShifted = Math.floor(shifted / dayMs) * dayMs;
  return startShifted - utcOffsetMinutes * 60_000 + minutesAfterMidnight * 60_000;
}

export class DigestScheduler {
  private readonly now: () => number;

  constructor(private readonly deps: DigestDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  /** Called by the watcher when it delivers a digest, so the fallback stands down. */
  markDelivered(tsMs: number, source: 'mind' | 'fallback' | 'manual'): void {
    const key = localDayKey(tsMs, this.deps.config.utcOffsetMinutes);
    this.deps.mirror.setSetting(`${DELIVERED}${key}`, source, tsMs);
    log.info('digest_delivered', { day: key, source });
  }

  wasDelivered(nowMs = this.now()): boolean {
    const key = localDayKey(nowMs, this.deps.config.utcOffsetMinutes);
    return this.deps.mirror.getSetting(`${DELIVERED}${key}`) !== undefined;
  }

  /** Cheap, idempotent, safe to call on a timer. */
  tick(): void {
    const { config, mirror } = this.deps;
    if (config.digestAtMinutes < 0) return;
    if (mirror.isPaused()) return;

    const nowMs = this.now();
    const key = localDayKey(nowMs, config.utcOffsetMinutes);
    const digestAt = localTimeOnDay(nowMs, config.utcOffsetMinutes, config.digestAtMinutes);

    if (nowMs >= digestAt - config.digestArmLeadMs && mirror.getSetting(`${ARMED}${key}`) === undefined) {
      mirror.setSetting(`${ARMED}${key}`, new Date(nowMs).toISOString(), nowMs);
      this.arm(key, digestAt);
      return;
    }

    if (
      nowMs >= digestAt + config.digestCutoffMs &&
      !this.wasDelivered(nowMs) &&
      mirror.getSetting(`${FALLBACK}${key}`) === undefined
    ) {
      mirror.setSetting(`${FALLBACK}${key}`, new Date(nowMs).toISOString(), nowMs);
      this.fallback(key, nowMs);
    }
  }

  /** One exchange: ask the Mind to schedule its own digest. It picks the moment. */
  private arm(dayKey: string, digestAtMs: number): void {
    const { config, transport, queue } = this.deps;
    const when = new Date(digestAtMs + config.utcOffsetMinutes * 60_000).toISOString().slice(11, 16);
    const text =
      `Standing request for tonight (${dayKey}). At about ${when} local time, on your own ` +
      `initiative and without me asking again, send Ada the nightly digest for "${config.groupName}": ` +
      `who joined, the mood of the room, anything you flagged, who is carrying the community, and ` +
      `who has gone quiet who did not used to be. All of it from your own memory of this group. ` +
      `Send it as a fenced KEEPER-ACTION block with action "digest". Reply to THIS message with ` +
      `only the word OK — do not send the digest now.`;
    queue.enqueue(config.mindAlias, async () => {
      try {
        await transport.sendAndAwaitReply(config.mindAlias, text, { timeoutMs: config.mindTimeoutMs });
        log.info('digest_armed', { day: dayKey, at: when });
      } catch (e) {
        log.warn('digest_arm_failed', { day: dayKey, detail: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  /**
   * The safety net. Note what is NOT here: any statistic. The envelope says "send it now",
   * and the Mind supplies every fact.
   */
  private fallback(dayKey: string, nowMs: number): void {
    const { config, router } = this.deps;
    log.warn('digest_fallback', {
      day: dayKey,
      note: 'the Mind did not send one by the cutoff; asking explicitly. NOT native autonomy.',
    });
    router.ingest({
      kind: 'scheduled_digest',
      member: {
        telegramId: config.creatorTelegramId,
        handle: 'ada_edits',
        display: 'Ada',
      },
      text:
        `Nightly digest for ${dayKey}. Send it now, from your own memory of the group — ` +
        `who joined, the mood, anything you flagged, who is carrying the community, and who ` +
        `has gone quiet.`,
      chatId: config.groupChatId,
      responseChatId: config.creatorTelegramId,
      tsMs: nowMs,
    });
  }
}
