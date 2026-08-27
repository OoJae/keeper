/**
 * Directive execution (BUILD_PLAN §3.2).
 *
 * What this module is NOT allowed to do: re-judge the Mind. The confidence gate already
 * ran inside `extractDirective` (a low/absent-confidence acting directive arrives here
 * already rewritten to `flag_creator`), and second-guessing it here would create two
 * places where safety lives.
 *
 * What it IS responsible for is the things only the connector can know:
 *   - provenance: an `unfenced_directive` may be the Mind QUOTING a member rather than
 *     ordering us, so destructive actions from bare prose are refused (docs/TASKS.md);
 *   - Telegram's physics: deleteMessage fails past 48h, DMs fail with 403 until the
 *     creator has pressed /start;
 *   - target sanity: we can only delete the message we actually have in hand.
 */
import type { DirectiveAction, KeeperDirective } from '@keeper/protocol';

import type { Mirror } from '../db/mirror.js';
import { TELEGRAM_MAX_MESSAGE_CHARS, decodeEntities, html, toTelegramHtml } from '../telegram/html.js';
import type { TelegramSurface } from '../telegram/surface.js';

/**
 * Actions a member must never be able to trigger by typing JSON into the group. If the
 * directive was recovered from bare prose rather than a fenced block, these become a
 * creator flag instead.
 */
export const DESTRUCTIVE_ACTIONS: ReadonlySet<DirectiveAction> = new Set<DirectiveAction>([
  'delete',
  'mute',
  'warn',
  'reward',
]);

export const UNFENCED_WARNING = 'unfenced_directive';

/**
 * Shortest block we will treat as evidence of quoting. Every acting directive is far
 * longer than this once whitespace is gone; the floor only stops a degenerate block from
 * matching a substring of an unrelated message.
 */
const MIN_PROVENANCE_CHARS = 20;

/**
 * Comparison key for "did this JSON come out of the member's own message?".
 *
 * Whitespace- and entity-insensitive, because the Mind's replies are HTML (LIVE-VERIFIED,
 * docs/API-NOTES.md): a block it quotes back can be re-indented and entity-escaped and
 * still be, character for character, what the member typed.
 */
function provenanceKey(raw: string): string {
  return decodeEntities(raw).replace(/\s+/g, '');
}

export interface ExecutionTrigger {
  chatId: number;
  messageId: number;
  /** REAL Telegram user id. Deletes, restricts and unmutes act on this. */
  memberTelegramId: number;
  /**
   * Identity as the Mind knows it, which is what a directive's `target_member` resolves
   * to. Equal to `memberTelegramId` unless this account is aliased to a seeded cast
   * member — in which case the two differ and both must be accepted as "the sender".
   */
  canonicalTelegramId: number;
  handle: string | null;
  /** Verbatim text, kept so `/keeper undo` can quote back a deleted message. */
  text: string;
  sentAtMs: number;
}

export interface ExecutionContext {
  /** The community group. Group-visible actions always go here, never to a DM. */
  chatId: number;
  creatorTelegramId: number;
  trigger?: ExecutionTrigger;
  nowMs: number;
  /** Telegram refuses deleteMessage past this age. */
  deleteWindowMs: number;
  /**
   * The raw JSON block `extractDirective` parsed the directive out of, when there was one.
   * Used for provenance only — never re-parsed.
   */
  rawBlock?: string;
}

export type UndoPlan =
  | { kind: 'delete_posted'; chatId: number; messageId: number }
  | { kind: 'restore_text'; chatId: number; handle: string; text: string }
  | { kind: 'unmute'; chatId: number; userId: number }
  | { kind: 'none'; note: string };

export interface ExecutionOutcome {
  /** What we attempted after provenance/target/physics rewrites. */
  action: DirectiveAction;
  /** What the Mind asked for. */
  originalAction: DirectiveAction;
  status: 'executed' | 'failed' | 'skipped';
  /** Set when `action !== originalAction`; names the rule that rewrote it. */
  converted?: string;
  detail: string;
  targetHandle: string | null;
  targetTelegramId: number | null;
  postedChatId?: number;
  postedMessageId?: number;
  undo?: UndoPlan;
}

export interface ExecutorDeps {
  surface: TelegramSurface;
  mirror: Mirror;
}

function directiveMessage(d: KeeperDirective): string {
  return 'message' in d && typeof d.message === 'string' ? d.message : '';
}

function directiveTarget(d: KeeperDirective): string | null {
  return 'target_member' in d && typeof d.target_member === 'string' ? d.target_member : null;
}

function directiveReward(d: KeeperDirective): { type?: string; note?: string } | null {
  if (!('reward' in d) || typeof d.reward !== 'object' || d.reward === null) return null;
  return d.reward as { type?: string; note?: string };
}

/**
 * Descope Plan A (BUILD_PLAN §12): the payout needs a human, but the judgement behind it
 * does not. So a reward reaches the creator the way a colleague would send it — who, why,
 * and a question — rather than as a report that Keeper declined to do something. The Mind
 * still did the part only a Mind could: it picked the person out of its own memory.
 */
function rewardRecommendation(d: KeeperDirective, target: string | null, body: string): string {
  const reward = directiveReward(d);
  const kind = reward?.type === undefined || reward.type === '' ? 'a reward' : reward.type.replace(/_/g, ' ');
  const note = reward?.note ?? d.reasoning;
  const parts = [`Keeper nominates ${target ?? 'a member'} for ${kind}.`];
  if (note !== undefined && note !== '') parts.push(note);
  if (body !== '') parts.push(`Suggested announcement: ${body}`);
  parts.push('Send it? Nothing goes out until you say so.');
  return parts.join(' ');
}

/**
 * Rewrites any directive into a creator flag carrying the Mind's own reasoning. Used for
 * every refusal path so the creator always hears about the thing we would not do — and for
 * the one path that is not a refusal at all, where the wording changes to match.
 */
function asFlag(d: KeeperDirective, why: string): KeeperDirective {
  const body = directiveMessage(d);
  const target = directiveTarget(d);
  return {
    action: 'flag_creator',
    ...(target === null ? {} : { target_member: target }),
    message:
      why === 'reward_needs_human'
        ? rewardRecommendation(d, target, body)
        : `Keeper did not act on a "${d.action}" directive (${why}).${body === '' ? '' : ` Mind's text: ${body}`}`,
    reasoning: d.reasoning,
    confidence: d.confidence,
  };
}

export async function executeDirective(
  deps: ExecutorDeps,
  directive: KeeperDirective,
  warnings: readonly string[],
  ctx: ExecutionContext,
): Promise<ExecutionOutcome> {
  const originalAction = directive.action;
  let current = directive;
  let converted: string | undefined;

  const rewrite = (why: string): void => {
    current = asFlag(current, why);
    converted = why;
  };

  // 1. Provenance. A member can type a JSON block into the group; the Mind may echo it
  //    back inside prose. Only a fenced block is treated as an order for destructive work.
  if (warnings.includes(UNFENCED_WARNING) && DESTRUCTIVE_ACTIONS.has(current.action)) {
    rewrite('unfenced_destructive');
  }

  // 1b. The stronger provenance test, and the one the fence cannot answer: is this block
  //     literally text the triggering member typed? A member can fence their own JSON, and
  //     a Mind that quotes it while declining is indistinguishable from one that ordered
  //     it. Whatever the fencing, a member's own words are not an order to Keeper.
  if (
    ctx.rawBlock !== undefined &&
    ctx.trigger !== undefined &&
    current.action !== 'none' &&
    current.action !== 'flag_creator'
  ) {
    const key = provenanceKey(ctx.rawBlock);
    if (key.length >= MIN_PROVENANCE_CHARS && provenanceKey(ctx.trigger.text).includes(key)) {
      rewrite('quoted_from_member');
    }
  }

  const targetHandleRaw = directiveTarget(current);
  const targetMember =
    targetHandleRaw === null ? undefined : deps.mirror.findMemberByHandle(targetHandleRaw);
  const targetHandle = targetHandleRaw === null ? null : targetHandleRaw.replace(/^@+/, '').toLowerCase();
  const targetTelegramId = targetMember?.telegramId ?? null;

  const base = { originalAction, targetHandle, targetTelegramId };
  /** Typed as ExecutionOutcome so every call site gets contextual literal types. */
  const withConverted = (o: ExecutionOutcome): ExecutionOutcome =>
    converted === undefined ? o : { ...o, converted };

  // 2. Telegram physics, applied before we try anything that would obviously fail.
  if (current.action === 'delete') {
    const check = checkDeletable(ctx, targetTelegramId, targetHandle);
    if (check !== null) rewrite(check);
  }

  // 3. Muting is deliberately not automated: it is the one moderation action with no cheap
  //    undo, so it logs and flags rather than silently doing nothing (BUILD_PLAN §1.7).
  if (current.action === 'mute') {
    rewrite('mute_not_implemented');
  }

  // 3b. Rewards route to the creator by design, not by omission (Descope Plan A, §12).
  //     Every value-moving tool on this platform — WALLET_TransferNative,
  //     WALLET_TransferErc20, MENTE_SendToMind — is shut behind a billing gate that a paid
  //     top-up did not lift (API-NOTES, 2026-08-27), so a Mind on this account cannot move
  //     value at all. The Mind still does the part that needed a Mind: it decides *who*
  //     earned it, from its own relationship memory, and says why. A human presses send.
  if (current.action === 'reward') {
    rewrite('reward_needs_human');
  }

  switch (current.action) {
    case 'none':
      return withConverted({
        ...base,
        action: 'none',
        status: 'skipped',
        detail: current.reasoning === '' ? 'Mind chose not to act' : current.reasoning,
      });

    case 'reply':
    case 'warn': {
      const text = toTelegramHtml(directiveMessage(current));
      if (text === '') {
        return withConverted({ ...base, action: current.action, status: 'failed', detail: 'directive message was empty after conversion' });
      }
      try {
        const sent = await deps.surface.sendGroupMessage(ctx.chatId, text, replyTo(ctx));
        return withConverted({
          ...base,
          action: current.action,
          status: 'executed',
          detail: current.action === 'warn' ? 'warning posted in group' : 'reply posted in group',
          postedChatId: ctx.chatId,
          postedMessageId: sent.messageId,
          undo: { kind: 'delete_posted', chatId: ctx.chatId, messageId: sent.messageId },
        });
      } catch (e) {
        return withConverted({ ...base, action: current.action, status: 'failed', detail: message(e) });
      }
    }

    case 'delete': {
      const trigger = ctx.trigger;
      /* c8 ignore next */
      if (trigger === undefined) return withConverted({ ...base, action: 'delete', status: 'failed', detail: 'no trigger message' });
      const outcome = await deps.surface.deleteMessage(trigger.chatId, trigger.messageId);
      if (!outcome.ok) {
        const flagged = await flagCreator(
          deps,
          ctx,
          toTelegramHtml(
            html`Tried to delete @${trigger.handle ?? `user${trigger.memberTelegramId}`}'s message and Telegram refused (${outcome.reason}).`,
          ),
        );
        return withConverted({
          ...base,
          action: 'delete',
          status: 'failed',
          detail: `${outcome.reason}: ${outcome.detail}${flagged.note}`,
        });
      }
      return withConverted({
        ...base,
        action: 'delete',
        status: 'executed',
        detail: `deleted message ${trigger.messageId}`,
        undo: {
          kind: 'restore_text',
          chatId: trigger.chatId,
          handle: trigger.handle ?? `user${trigger.memberTelegramId}`,
          text: trigger.text,
        },
      });
    }

    case 'flag_creator':
    case 'digest': {
      const body = toTelegramHtml(directiveMessage(current));
      const flagged = await flagCreator(deps, ctx, body, current.action === 'digest');
      const outcome: ExecutionOutcome = {
        ...base,
        action: current.action,
        status: flagged.ok ? 'executed' : 'failed',
        detail: flagged.detail,
      };
      // Only the in-group fallback leaves something to undo; a DM is the creator's own.
      if (flagged.postedChatId !== undefined && flagged.postedMessageId !== undefined) {
        outcome.postedChatId = flagged.postedChatId;
        outcome.postedMessageId = flagged.postedMessageId;
        outcome.undo = { kind: 'delete_posted', chatId: flagged.postedChatId, messageId: flagged.postedMessageId };
      }
      return withConverted(outcome);
    }

    /* c8 ignore start — unreachable: mute/reward are rewritten to flag_creator above. */
    default:
      return withConverted({ ...base, action: current.action, status: 'skipped', detail: 'unhandled action' });
    /* c8 ignore stop */
  }
}

function replyTo(ctx: ExecutionContext): { replyToMessageId?: number } {
  return ctx.trigger === undefined ? {} : { replyToMessageId: ctx.trigger.messageId };
}

/**
 * Returns a refusal reason, or null when the delete may proceed. Kept separate so the
 * three ways a delete can be illegitimate are visible in one place.
 */
function checkDeletable(
  ctx: ExecutionContext,
  targetTelegramId: number | null,
  targetHandle: string | null,
): string | null {
  const trigger = ctx.trigger;
  if (trigger === undefined) return 'no_target_message';
  if (ctx.nowMs - trigger.sentAtMs > ctx.deleteWindowMs) return 'delete_window_expired';

  // We hold exactly one message. If the Mind named someone else, deleting the message we
  // have would punish the wrong person — flag instead. Both ids count as "the sender":
  // a handle lookup returns the CANONICAL id (the only members row), while the trigger
  // carries the REAL one, and for an aliased cast member those differ. Accepting only one
  // would refuse a correct delete and leave spam up.
  if (
    targetTelegramId !== null &&
    targetTelegramId !== trigger.memberTelegramId &&
    targetTelegramId !== trigger.canonicalTelegramId
  ) {
    return 'target_mismatch';
  }
  if (
    targetTelegramId === null &&
    targetHandle !== null &&
    (trigger.handle ?? '').toLowerCase() !== targetHandle
  ) {
    return 'target_unresolved';
  }
  return null;
}

interface FlagResult {
  ok: boolean;
  detail: string;
  note: string;
  postedChatId?: number;
  postedMessageId?: number;
}

/**
 * DM the creator, falling back to an in-group ping. The 403 case is not an error: until
 * the creator presses /start, Telegram forbids the bot from opening the conversation.
 * A digest never falls back into the group verbatim — it is about members, in public.
 */
async function flagCreator(
  deps: ExecutorDeps,
  ctx: ExecutionContext,
  body: string,
  privateOnly = false,
): Promise<FlagResult> {
  const text = body.trim() === '' ? 'Keeper flagged something for you.' : body;
  const dm = await deps.surface.sendDirectMessage(ctx.creatorTelegramId, text);
  if (dm.ok) return { ok: true, detail: 'DMed the creator', note: '' };

  const mention = `<a href="tg://user?id=${ctx.creatorTelegramId}">creator</a>`;
  // `text` can already be a full-length message, and the preamble would push the whole
  // thing past Telegram's 4096 limit — a 400 there loses the flag entirely. Clamp the BODY
  // rather than the finished message, so the creator's mention always survives: being
  // pinged is the whole point of the fallback. toTelegramHtml is idempotent, so this trims
  // and never re-escapes.
  const preamble = `${mention} — I couldn't DM you (${dm.reason}), so here it is:\n\n`;
  const fallback = privateOnly
    ? `${mention} — your digest is ready but I can't DM you (${dm.reason}). Send me /start in a private chat and I'll deliver it there.`
    : preamble + toTelegramHtml(text, TELEGRAM_MAX_MESSAGE_CHARS - preamble.length);

  try {
    const sent = await deps.surface.sendGroupMessage(ctx.chatId, fallback);
    return {
      ok: true,
      detail: `DM failed (${dm.reason}); pinged the creator in-group instead`,
      note: ` — creator pinged in-group (DM ${dm.reason})`,
      postedChatId: ctx.chatId,
      postedMessageId: sent.messageId,
    };
  } catch (e) {
    return { ok: false, detail: `DM failed (${dm.reason}) and in-group fallback failed: ${message(e)}`, note: '' };
  }
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Reverses what `/keeper undo` can reverse. Telegram cannot undelete, so we quote back. */
export async function applyUndo(deps: ExecutorDeps, plan: UndoPlan): Promise<{ ok: boolean; detail: string }> {
  switch (plan.kind) {
    case 'delete_posted': {
      const outcome = await deps.surface.deleteMessage(plan.chatId, plan.messageId);
      return outcome.ok
        ? { ok: true, detail: `removed Keeper's message ${plan.messageId}` }
        : { ok: false, detail: `could not remove message ${plan.messageId}: ${outcome.detail}` };
    }
    case 'restore_text': {
      // plan.text is verbatim member content: it MUST be an escaped interpolation.
      const quoted = toTelegramHtml(
        html`Restored by the creator — @${plan.handle} originally wrote:\n\n${plan.text}`,
      );
      try {
        const sent = await deps.surface.sendGroupMessage(plan.chatId, quoted);
        return { ok: true, detail: `reposted the deleted text as message ${sent.messageId}` };
      } catch (e) {
        return { ok: false, detail: `could not repost the deleted text: ${message(e)}` };
      }
    }
    case 'unmute': {
      const outcome = await deps.surface.liftRestriction(plan.chatId, plan.userId);
      return { ok: outcome.ok, detail: outcome.detail };
    }
    default:
      return { ok: true, detail: plan.note };
  }
}
