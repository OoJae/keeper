/**
 * The core loop: Telegram event -> envelope -> Mind -> directive -> action -> mirror.
 *
 * `ingest()` is SYNCHRONOUS and fast. It mirrors the event, decides routing, and returns.
 * The Mind exchange (23-65s, LIVE-VERIFIED) happens later on a queue, because a Telegram
 * handler that awaits one stalls every other update behind it.
 */
import { extractDirective, serializeEnvelope, type KeeperEvent } from '@keeper/protocol';
import type { MindTransport } from '@keeper/minds-client';

import type { ConnectorConfig } from '../config.js';
import type { Mirror } from '../db/mirror.js';
import { log } from '../log.js';
import type { TelegramSurface } from '../telegram/surface.js';
import { buildEnvelope, type RawEventKind } from './envelope.js';
import { executeDirective, type ExecutionContext, type ExecutionTrigger } from './executor.js';
import { dayWindow, decideRoute, type RouteDecision } from './prefilter.js';
import type { SequentialQueue } from './queue.js';

/**
 * Telegram delivers one supergroup join twice: as a `chat_member` update and as a
 * `new_chat_members` service message. They arrive within milliseconds of each other and
 * carry the same `date`, so a window this wide is generous and still cannot swallow a
 * genuine re-join (which needs a leave in between, minutes at best).
 */
const JOIN_DEDUPE_MS = 5 * 60_000;

export interface IngestInput {
  kind: RawEventKind;
  member: { telegramId: number; handle: string | null; display: string };
  text: string;
  chatId: number;
  messageId?: number;
  tsMs: number;
  mentionsBot?: boolean;
  hasLinkEntity?: boolean;
  /**
   * Where the resulting action should be posted. Defaults to the community group — a
   * moderation call belongs in public. A `/keeper ask` sent in a DM sets this so the
   * answer comes back to the creator instead of surprising the group.
   */
  responseChatId?: number;
}

export interface RouterDeps {
  /**
   * Optional: when present, every exchange claims its own reply and then sweeps, so a
   * digest the Mind sent while we were busy is delivered immediately instead of waiting
   * for the next poll. Optional so existing tests construct a router without one.
   */
  watcher?: { sweep(opts?: { skipFingerprint?: string }): Promise<unknown> };
  /**
   * Optional: records that a welcomed newcomer is owed a day-2 check-in. Only a successful
   * welcome creates the debt — if the Mind said nothing, there is nothing to follow up on.
   */
  checkins?: {
    markDue(input: { memberId: number; handle: string | null; display: string; tsMs: number }): void;
  };
  mirror: Mirror;
  surface: TelegramSurface;
  transport: MindTransport;
  queue: SequentialQueue;
  config: ConnectorConfig;
  /** Injectable for tests; production passes Date.now. */
  now?: () => number;
}

export class EventRouter {
  private readonly now: () => number;

  constructor(private readonly deps: RouterDeps) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * Mirrors the event, applies the pre-filter, and (when routed) queues the Mind
   * exchange. Returns the routing decision so callers can log or test it.
   */
  ingest(input: IngestInput): { eventId: number; routed: boolean; reason: string; type: KeeperEvent['type'] } {
    const { mirror, config } = this.deps;

    // THE identity chokepoint. A cast member seeded through the bot has a synthetic id; if
    // that character later gets a real Telegram account, the real id must resolve to the
    // identity the Mind already remembers, or it meets a stranger and the returning-member
    // beat silently dies. Resolving here (and only here) means no second members row is
    // ever created, so handle lookups stay unambiguous too. Identity is the input's own id
    // when unaliased, which is every case but the demo cast.
    const canonicalId = mirror.resolveCanonicalId(input.member.telegramId);
    const identity = { ...input.member, telegramId: canonicalId };

    // A join is not a conversation turn: it must not advance last_seen, or the member's
    // first real message would never be classified as a return.
    const spoke = input.kind === 'message' || input.kind === 'creator_command';
    const { prior } = mirror.touchMember({
      telegramId: identity.telegramId,
      handle: identity.handle,
      display: identity.display,
      tsMs: input.tsMs,
      spoke,
    });

    const envelope = buildEnvelope({
      kind: input.kind,
      prior,
      member: identity,
      content: input.text,
      ts: new Date(input.tsMs),
      group: config.groupName,
      utcOffsetMinutes: config.utcOffsetMinutes,
    });

    // One join, two updates: whichever arrives second is mirrored but must not buy a
    // second Mind exchange (or post a second welcome). Checked before recordEvent below,
    // so it only ever sees the earlier delivery.
    const duplicateJoin =
      input.kind === 'join' &&
      mirror.hasJoinSince(identity.telegramId, input.chatId, input.tsMs - JOIN_DEDUPE_MS);

    const { fromMs, toMs } = dayWindow(input.tsMs, config.utcOffsetMinutes);
    const decision: RouteDecision = duplicateJoin
      ? {
          route: false,
          reason: 'duplicate_join',
          detail: 'Telegram delivered this join twice (chat_member + service message)',
        }
      : decideRoute(
          {
            type: envelope.type,
            text: input.text,
            mentionsBot: input.mentionsBot === true,
            hasLinkEntity: input.hasLinkEntity === true,
            paused: mirror.isPaused(),
            routedToday: mirror.routedCountBetween(fromMs, toMs),
            ambientOrdinal: mirror.ambientOrdinalNext(),
          },
          {
            dailyMindBudget: config.dailyMindBudget,
            priorityReserve: config.priorityReserve,
            ambientSampleRate: config.ambientSampleRate,
          },
        );

    const eventId = mirror.recordEvent({
      memberTelegramId: identity.telegramId,
      chatId: input.chatId,
      messageId: input.messageId ?? null,
      type: envelope.type,
      content: input.text,
      tsMs: input.tsMs,
      routed: decision.route,
      routeReason: decision.reason,
    });

    // Already recorded: a second connector process, a replayed seed inbox, or a redelivered
    // update. Mirroring it again would be harmless; buying a second Mind exchange and
    // posting a second reply into the group would not. Stop here.
    if (eventId === null) {
      log.warn('duplicate_event_ignored', {
        chatId: input.chatId,
        messageId: input.messageId ?? null,
        member: envelope.member.handle,
        note: 'this exact Telegram message was already ingested',
      });
      return { eventId: -1, routed: false, reason: 'duplicate_event', type: envelope.type };
    }

    log.info('prefilter', {
      eventId,
      type: envelope.type,
      member: envelope.member.handle,
      routed: decision.route,
      reason: decision.reason,
      detail: decision.detail,
    });

    if (decision.route) {
      const trigger: ExecutionTrigger | undefined =
        input.messageId === undefined
          ? undefined
          : {
              chatId: input.chatId,
              messageId: input.messageId,
              // REAL id: Telegram acts on the actual account.
              memberTelegramId: input.member.telegramId,
              // Identity as the Mind knows it; equal to the real id when unaliased.
              canonicalTelegramId: identity.telegramId,
              handle: identity.handle,
              text: input.text,
              sentAtMs: input.tsMs,
            };

      const responseChatId = input.responseChatId ?? config.groupChatId;
      // Keyed on the Mind conversation, NOT the chat. There is one alias, and awaitReply
      // returns the next Mind message after its cursor with no correlation id — so a DM
      // exchange (/keeper ask) running beside a group exchange can be handed the other
      // one's answer. Serialising per chat did not prevent that; serialising per
      // conversation does.
      const accepted = this.deps.queue.enqueue(config.mindAlias, () =>
        this.runExchange(eventId, envelope, trigger, responseChatId),
      );
      if (!accepted) {
        log.warn('queue_overflow', {
          eventId,
          chatId: input.chatId,
          maxPending: config.queueMaxPending,
          note: 'Mind exchange dropped; the event is still mirrored',
        });
        this.deps.mirror.recordAction({
          eventId,
          action: 'none',
          originalAction: 'none',
          reasoning: 'queue_overflow',
          confidence: 'low',
          gated: false,
          warnings: [],
          status: 'skipped',
          detail: `backlog for chat ${input.chatId} exceeded ${config.queueMaxPending}`,
          rawReply: '',
          tsMs: this.now(),
        });
      }
    }

    return { eventId, routed: decision.route, reason: decision.reason, type: envelope.type };
  }

  /** Wired after construction: the scheduler needs the router, and the router needs it. */
  attachCheckins(checkins: NonNullable<RouterDeps['checkins']>): void {
    this.deps.checkins = checkins;
  }

  /** One Mind exchange plus its directive execution. Never throws: it logs and records. */
  private async runExchange(
    eventId: number,
    envelope: KeeperEvent,
    trigger: ExecutionTrigger | undefined,
    responseChatId: number,
  ): Promise<void> {
    const { config, mirror, surface, transport } = this.deps;
    const envelopeText = serializeEnvelope(envelope);

    let replyText: string;
    let replyFingerprint = '';
    try {
      const exchange = await transport.sendAndAwaitReply(config.mindAlias, envelopeText, {
        timeoutMs: config.mindTimeoutMs,
      });
      replyText = exchange.reply.text ?? '';
      // Claim this reply before executing it, so the watcher cannot also dispatch it as an
      // unprompted message. Persisted, so a crash between here and execution loses the
      // directive rather than double-executing it — the safer of the two.
      replyFingerprint = exchange.reply.id;
      mirror.setSetting('mind_watch_claimed', exchange.reply.id, this.now());
      log.info('mind_exchange', {
        eventId,
        latencyMs: exchange.latencyMs,
        cognitionDelta: exchange.cognitionDelta,
        replyChars: replyText.length,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      log.error('mind_exchange_failed', { eventId, detail });
      mirror.recordAction({
        eventId,
        action: 'none',
        originalAction: 'none',
        reasoning: 'mind_exchange_failed',
        confidence: 'low',
        gated: false,
        warnings: [],
        status: 'failed',
        detail,
        rawReply: '',
        tsMs: this.now(),
      });
      return;
    }

    const parsed = extractDirective(replyText);
    const warnings = parsed.kind === 'ok' ? parsed.warnings : [];
    const gated = parsed.kind === 'ok' ? parsed.gated : false;
    if (parsed.kind === 'fallback') {
      log.warn('directive_parse_fallback', { eventId, reason: parsed.reason, detail: parsed.detail });
    }

    const ctx: ExecutionContext = {
      chatId: responseChatId,
      creatorTelegramId: config.creatorTelegramId,
      nowMs: this.now(),
      deleteWindowMs: config.deleteWindowMs,
    };
    if (trigger !== undefined) ctx.trigger = trigger;
    // Provenance: the executor needs the block itself to tell an order from a quotation.
    if (parsed.kind === 'ok') ctx.rawBlock = parsed.rawBlock;

    const outcome = await executeDirective({ surface, mirror }, parsed.directive, warnings, ctx);

    // Anything the Mind said beyond this reply (a digest it decided to send mid-exchange)
    // is delivered now rather than waiting for the next poll. Same queue job, so nothing
    // can interleave.
    if (this.deps.watcher !== undefined) {
      try {
        await this.deps.watcher.sweep({ skipFingerprint: replyFingerprint });
      } catch (e) {
        log.warn('mind_watch_sweep_failed', { detail: e instanceof Error ? e.message : String(e) });
      }
    }

    // A welcome that actually posted is what makes a check-in owed tomorrow.
    if (
      envelope.type === 'member_joined' &&
      outcome.status === 'executed' &&
      this.deps.checkins !== undefined
    ) {
      this.deps.checkins.markDue({
        memberId: envelope.member.id,
        handle: envelope.member.handle,
        display: envelope.member.display,
        tsMs: this.now(),
      });
    }

    const actionId = mirror.recordAction({
      eventId,
      action: outcome.action,
      originalAction: outcome.originalAction,
      targetHandle: outcome.targetHandle,
      targetTelegramId: outcome.targetTelegramId,
      message: 'message' in parsed.directive ? parsed.directive.message ?? null : null,
      reasoning: parsed.directive.reasoning,
      confidence: parsed.directive.confidence,
      gated,
      converted: outcome.converted ?? null,
      warnings: [...warnings],
      status: outcome.status,
      detail: outcome.detail,
      postedChatId: outcome.postedChatId ?? null,
      postedMessageId: outcome.postedMessageId ?? null,
      undo: outcome.undo,
      rawReply: replyText,
      tsMs: this.now(),
    });

    log.info('action', {
      actionId,
      eventId,
      action: outcome.action,
      original: outcome.originalAction,
      converted: outcome.converted,
      gated,
      warnings: warnings.length > 0 ? warnings.join(',') : undefined,
      status: outcome.status,
      confidence: parsed.directive.confidence,
      reasoning: parsed.directive.reasoning,
      detail: outcome.detail,
    });
  }
}
