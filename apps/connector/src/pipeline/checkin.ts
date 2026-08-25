/**
 * The day-2 check-in.
 *
 * Charter Message 6 tells the Steward to welcome a newcomer and then "check back on them the
 * next day — ask how it is going, specifically, referencing what they said when they
 * arrived." The Mind will sometimes schedule that itself, but nothing on our side recorded
 * that a check-in was OWED, so if it forgot, nobody noticed. This is the smallest thing that
 * makes the debt durable.
 *
 * Same shape as DigestScheduler, and deliberately so: we ARM, the Mind decides. The arming
 * message is a plain message rather than a [KEEPER-EVENT] envelope, which keeps the five-type
 * protocol in BUILD_PLAN §3.1 untouched. If the Mind answers immediately with a fenced
 * directive we execute it; if it would rather send later, the watcher delivers it, because an
 * unprompted `reply` is exactly this case.
 *
 * What this file must never do is write the check-in's CONTENT. It says who joined and when;
 * every word Keeper says comes from the Mind's own memory of that member's arrival.
 */
import { extractDirective } from '@keeper/protocol';

import type { ConnectorConfig } from '../config.js';
import type { Mirror } from '../db/mirror.js';
import { log } from '../log.js';
import { localDayKey } from './digest.js';
import { executeDirective, type ExecutionContext } from './executor.js';
import type { TelegramSurface } from '../telegram/surface.js';

const DUE = 'checkin_due_';
const DONE = 'checkin_done_';

/** One member who was welcomed and is owed a follow-up. */
interface DueCheckin {
  readonly memberId: number;
  readonly handle: string;
  readonly display: string;
  /** Local day the check-in becomes due — the day AFTER they joined. */
  readonly dueDay: string;
  readonly joinedAtMs: number;
}

export interface CheckinDeps {
  readonly mirror: Mirror;
  readonly surface: TelegramSurface;
  readonly transport: {
    sendAndAwaitReply(
      alias: string,
      text: string,
      opts?: { timeoutMs?: number },
    ): Promise<{ reply: { text: string | null } }>;
  };
  readonly queue: { enqueue(key: string, job: () => Promise<void>): boolean };
  readonly config: ConnectorConfig;
  readonly now?: () => number;
}

export class CheckinScheduler {
  private readonly now: () => number;

  constructor(private readonly deps: CheckinDeps) {
    this.now = deps.now ?? (() => Date.now());
  }

  /**
   * Called when a welcome actually executed. Records the debt for the NEXT local day, so a
   * member welcomed at 23:50 is checked on tomorrow rather than ten minutes later.
   */
  markDue(input: { memberId: number; handle: string | null; display: string; tsMs: number }): void {
    if (this.deps.config.checkinAtMinutes < 0) return;
    const { utcOffsetMinutes } = this.deps.config;
    const dueDay = localDayKey(input.tsMs + 86_400_000, utcOffsetMinutes);
    const key = `${DUE}${input.memberId}`;
    if (this.deps.mirror.getSetting(key) !== undefined) return; // already owed
    const record: DueCheckin = {
      memberId: input.memberId,
      // Stored WITHOUT the @: envelopeHandle() hands us "@name" already, and every render
      // site adds its own, so keeping it here produced "@@quietfox" in the message the Mind
      // reads — and would have echoed into the group on camera.
      handle: (input.handle ?? `user${input.memberId}`).replace(/^@+/, ''),
      display: input.display,
      dueDay,
      joinedAtMs: input.tsMs,
    };
    this.deps.mirror.setSetting(key, JSON.stringify(record), this.now());
    log.info('checkin_due', { member: `@${record.handle}`, dueDay });
  }

  /** Cheap, idempotent, safe on a timer. */
  tick(): void {
    const { config, mirror } = this.deps;
    if (config.checkinAtMinutes < 0 || mirror.isPaused()) return;

    const nowMs = this.now();
    const today = localDayKey(nowMs, config.utcOffsetMinutes);
    const minutesIntoDay = Math.floor(
      ((nowMs + config.utcOffsetMinutes * 60_000) % 86_400_000) / 60_000,
    );
    if (minutesIntoDay < config.checkinAtMinutes) return; // too early in their day

    for (const row of mirror.listSettings(DUE)) {
      let due: DueCheckin;
      try {
        due = JSON.parse(row.value) as DueCheckin;
      } catch {
        mirror.deleteSetting(row.key); // unreadable; do not retry forever
        continue;
      }
      if (due.dueDay > today) continue; // not yet
      if (mirror.getSetting(`${DONE}${due.memberId}`) !== undefined) {
        mirror.deleteSetting(row.key);
        continue;
      }
      // Marked done BEFORE the exchange: a crash mid-flight must not re-ping a newcomer.
      mirror.setSetting(`${DONE}${due.memberId}`, new Date(nowMs).toISOString(), nowMs);
      mirror.deleteSetting(row.key);
      this.arm(due);
    }
  }

  private arm(due: DueCheckin): void {
    const { config, transport, queue, mirror, surface } = this.deps;
    const joined = new Date(due.joinedAtMs + config.utcOffsetMinutes * 60_000)
      .toISOString()
      .slice(0, 10);
    const text =
      `@${due.handle} joined "${config.groupName}" on ${joined} and you welcomed them. ` +
      `Check in on them now, in the group, on your own initiative — ask how it is going, ` +
      `specifically, referencing what they actually said when they arrived. Everything you ` +
      `say should come from your own memory of them; I am telling you only that the ` +
      `follow-up is due. Reply with a fenced KEEPER-ACTION block with action "reply", or ` +
      `send it yourself when you are ready.`;

    queue.enqueue(config.mindAlias, async () => {
      try {
        const exchange = await transport.sendAndAwaitReply(config.mindAlias, text, {
          timeoutMs: config.mindTimeoutMs,
        });
        const reply = exchange.reply.text ?? '';
        const parsed = extractDirective(reply);
        if (parsed.kind !== 'ok' || parsed.directive.action === 'none') {
          // It intends to send its own, unprompted. The watcher delivers that.
          log.info('checkin_armed', { member: `@${due.handle}`, delivered: 'awaiting_unprompted' });
          return;
        }
        const ctx: ExecutionContext = {
          chatId: config.groupChatId,
          creatorTelegramId: config.creatorTelegramId,
          nowMs: this.now(),
          deleteWindowMs: config.deleteWindowMs,
          rawBlock: parsed.rawBlock,
        };
        const outcome = await executeDirective({ surface, mirror }, parsed.directive, parsed.warnings, ctx);
        mirror.recordAction({
          eventId: null, // unprompted: nobody in the group triggered this
          action: outcome.action,
          originalAction: parsed.directive.action,
          targetHandle: outcome.targetHandle,
          targetTelegramId: outcome.targetTelegramId,
          message: 'message' in parsed.directive ? (parsed.directive.message ?? '') : '',
          reasoning: parsed.directive.reasoning,
          confidence: parsed.directive.confidence,
          gated: parsed.gated,
          warnings: [...parsed.warnings, 'unprompted', 'day2_checkin'],
          // Whatever the executor refused, named — otherwise /keeper why cannot explain it.
          ...(outcome.converted === undefined ? {} : { converted: outcome.converted }),
          status: outcome.status,
          detail: outcome.detail,
          rawReply: reply,
          tsMs: this.now(),
          ...(outcome.postedChatId === undefined ? {} : { postedChatId: outcome.postedChatId }),
          ...(outcome.postedMessageId === undefined ? {} : { postedMessageId: outcome.postedMessageId }),
          // A check-in is posted publicly and unprompted; it must be reversible.
          ...(outcome.undo === undefined ? {} : { undo: outcome.undo }),
        });
        log.info('checkin_armed', { member: `@${due.handle}`, delivered: outcome.status });
      } catch (e) {
        log.warn('checkin_failed', {
          member: `@${due.handle}`,
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }
}
