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

    // A join is not a conversation turn: it must not advance last_seen, or the member's
    // first real message would never be classified as a return.
    const spoke = input.kind === 'message' || input.kind === 'creator_command';
    const { prior } = mirror.touchMember({
      telegramId: input.member.telegramId,
      handle: input.member.handle,
      display: input.member.display,
      tsMs: input.tsMs,
      spoke,
    });

    const envelope = buildEnvelope({
      kind: input.kind,
      prior,
      member: input.member,
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
      mirror.hasJoinSince(input.member.telegramId, input.chatId, input.tsMs - JOIN_DEDUPE_MS);

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
      memberTelegramId: input.member.telegramId,
      chatId: input.chatId,
      messageId: input.messageId ?? null,
      type: envelope.type,
      content: input.text,
      tsMs: input.tsMs,
      routed: decision.route,
      routeReason: decision.reason,
    });

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
              memberTelegramId: input.member.telegramId,
              handle: input.member.handle,
              text: input.text,
              sentAtMs: input.tsMs,
            };

      const responseChatId = input.responseChatId ?? config.groupChatId;
      const accepted = this.deps.queue.enqueue(String(input.chatId), () =>
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
    try {
      const exchange = await transport.sendAndAwaitReply(config.mindAlias, envelopeText, {
        timeoutMs: config.mindTimeoutMs,
      });
      replyText = exchange.reply.text ?? '';
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
