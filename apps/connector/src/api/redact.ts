/**
 * What the PUBLIC API is allowed to say.
 *
 * The dashboard is a public URL. The community it renders is a fictional cast — except that real
 * people can join a real Telegram group, and one did (`@quietfox`, a positive Telegram id).
 * Without this module the public API published that person's real Telegram user id, their
 * display name, their join time, and the Mind's private behavioural assessment of them
 * ("brand-new member with a quiet arrival… lurking past the one-day mark"). BUILD_PLAN §8 says
 * "No real user data" and that was quietly false the moment the API went public.
 *
 * Two rules:
 *
 * 1. REAL ACCOUNTS ARE PSEUDONYMISED, NOT DELETED. Deleting them would also delete the evidence
 *    that Keeper welcomed a newcomer and checked in on them a day later — which is Phase 3's
 *    autonomy claim. The row survives; the person does not. Real ids map to a stable synthetic
 *    id so timelines still join up, and the mapping is one-way.
 *
 * 2. OPERATIONAL INTERNALS ARE NOT PUBLIC. `rawReply` is the Mind's complete unprocessed output,
 *    kept for debugging. Undo plans, chat ids and posted message ids are the coordinates of a
 *    private group. None of it belongs on a page anyone can open, and none of it is needed to
 *    understand what Keeper did.
 *
 * Fictional cast members (negative, seeder-minted ids) pass through untouched: there is no one
 * to protect, and the demo depends on them being legible.
 */
import type { ActionRow, EventRow, MemberSnapshot } from '../db/mirror.js';

/** FNV-1a, forced negative — the same shape the seeder uses to mint cast ids. */
function stableSynthetic(input: string): number {
  let h = 2_166_136_261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return -(1_000_000_000 + (Math.abs(h) % 900_000_000));
}

/** Positive ids belong to real Telegram accounts. Negative ids are minted by our own seeder. */
export function isRealAccount(telegramId: number): boolean {
  return telegramId > 0;
}

export function publicId(telegramId: number): number {
  return isRealAccount(telegramId) ? stableSynthetic(`member:${telegramId}`) : telegramId;
}

function shortTag(telegramId: number): string {
  return Math.abs(stableSynthetic(`tag:${telegramId}`)).toString(36).slice(-5);
}

export interface PublicMember {
  telegramId: number;
  handle: string | null;
  display: string;
  firstSeenMs: number;
  lastSeenMs: number | null;
  messageCount: number;
  /** True when this row stands in for a real person. Stated, not hidden. */
  pseudonymous: boolean;
  recall: unknown;
}

export function publicMember(
  m: MemberSnapshot,
  recall: unknown,
  scrub: TextScrubber = (t) => t,
): PublicMember {
  if (!isRealAccount(m.telegramId)) {
    // A cast member's recall can still mention the real account — the Mind writes about the
    // whole community, not one row at a time.
    return { ...m, pseudonymous: false, recall: scrubRecall(recall, scrub) };
  }
  const tag = shortTag(m.telegramId);
  return {
    telegramId: publicId(m.telegramId),
    handle: `member_${tag}`,
    display: `Community member ${tag}`,
    firstSeenMs: m.firstSeenMs,
    lastSeenMs: m.lastSeenMs,
    messageCount: m.messageCount,
    pseudonymous: true,
    // The Mind's assessment names them; withhold it rather than publish a profile of a
    // real person written by an AI. The warmth rating alone is kept so the graph still works.
    recall: redactRecall(recall),
  };
}

/**
 * Keep the shape the dashboard renders, drop the content that identifies. A colour on a graph
 * is not a dossier; a summary and a list of someone's unresolved business is.
 */
function scrubRecall(recall: unknown, scrub: TextScrubber): unknown {
  if (recall === null || typeof recall !== 'object') return recall;
  const r = recall as Record<string, unknown>;
  return {
    ...r,
    summary: typeof r.summary === 'string' ? scrub(r.summary) : r.summary,
    warmthReason: typeof r.warmthReason === 'string' ? scrub(r.warmthReason) : r.warmthReason,
    openLoops: Array.isArray(r.openLoops)
      ? r.openLoops.map((l) => (typeof l === 'string' ? scrub(l) : l))
      : r.openLoops,
    // The Mind's unprocessed reply is never published, for anyone.
    raw: '',
  };
}

function redactRecall(recall: unknown): unknown {
  if (recall === null || typeof recall !== 'object') return null;
  const r = recall as Record<string, unknown>;
  return {
    handle: null,
    display: '',
    summary: 'Withheld: this is a real person, not a member of the fictional cast.',
    openLoops: [],
    warmth: typeof r.warmth === 'string' ? r.warmth : 'steady',
    warmthReason: '',
    capturedAt: typeof r.capturedAt === 'string' ? r.capturedAt : '',
    raw: '',
  };
}

export function publicEvent(
  e: EventRow,
  scrub: TextScrubber = (t) => t,
): Omit<EventRow, 'chatId' | 'messageId'> & { chatId?: never } {
  const { chatId: _chatId, messageId: _messageId, ...rest } = e;
  return {
    ...rest,
    memberTelegramId: publicId(e.memberTelegramId),
    // A real member's own words are theirs. The event still shows up — its type, its timestamp,
    // and whether it reached the Mind — so the timeline stays honest about what happened.
    content: isRealAccount(e.memberTelegramId) ? '[withheld — real account]' : scrub(e.content),
  };
}

/**
 * Scrub identifiers out of FREE TEXT.
 *
 * Redacting structured fields is the easy half. The hard half is that the Mind writes prose about
 * people — "@quietfox (id:7000000001, display:'Fox') joined 2026-08-26…" — and that prose is the
 * moderation log's whole value, so it cannot simply be dropped. Four of five leaks that survived
 * the first pass were in `reasoning` and `message`, written by the Mind, not by us.
 *
 * Ids and handles are scrubbed: both are unambiguous and identifying. Display names are scrubbed
 * only at 5+ characters and as whole words, because short ones ("Lol") collide with ordinary
 * English and mangling every "lol" in a chat log would corrupt the evidence to protect a string
 * that identifies nobody. That is a deliberate line, not an oversight.
 */
export type TextScrubber = (text: string) => string;

export function createScrubber(members: readonly MemberSnapshot[]): TextScrubber {
  const rules: Array<{ re: RegExp; to: string }> = [];
  for (const m of members) {
    if (!isRealAccount(m.telegramId)) continue;
    const tag = shortTag(m.telegramId);
    rules.push({ re: new RegExp(String(m.telegramId), 'g'), to: String(publicId(m.telegramId)) });
    if (m.handle !== null && m.handle !== '') {
      rules.push({ re: new RegExp(`@?\\b${escapeRe(m.handle)}\\b`, 'gi'), to: `member_${tag}` });
    }
    if (m.display.length >= 5) {
      rules.push({ re: new RegExp(`\\b${escapeRe(m.display)}\\b`, 'g'), to: `member_${tag}` });
    } else if (m.display !== '') {
      // A short display name is left alone in ordinary prose (mangling every "lol" would corrupt
      // the log), but the Mind writes it in one unmistakable shape — display:'Fox' — and there it
      // is unambiguously the person's name rather than a word someone typed. Scrub that form
      // specifically: precise where a bare word match would not be.
      rules.push({
        re: new RegExp(`display:\\s*(['"\`])${escapeRe(m.display)}\\1`, 'gi'),
        to: `display:'member_${tag}'`,
      });
    }
  }
  if (rules.length === 0) return (t) => t;
  return (text) => rules.reduce((acc, r) => acc.replace(r.re, r.to), text);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The moderation log, minus the operational coordinates of a private group. */
export function publicAction(a: ActionRow, scrub: TextScrubber = (t) => t): Record<string, unknown> {
  const {
    rawReply: _rawReply,
    undo,
    postedChatId: _postedChatId,
    postedMessageId: _postedMessageId,
    targetTelegramId,
    ...rest
  } = a;
  return {
    ...rest,
    // Every free-text field the Mind writes into. Missing one is how the first pass leaked.
    reasoning: scrub(a.reasoning),
    detail: scrub(a.detail),
    message: a.message === null ? null : scrub(a.message),
    overrideNote: a.overrideNote === null ? null : scrub(a.overrideNote),
    targetTelegramId: targetTelegramId === null ? null : publicId(targetTelegramId),
    targetHandle:
      a.targetHandle === null
        ? null
        : targetTelegramId !== null && isRealAccount(targetTelegramId)
          ? `member_${shortTag(targetTelegramId)}`
          : scrub(a.targetHandle),
    // The dashboard only needs to know whether an undo button applies, never how to perform one.
    reversible: undo !== null && undo !== undefined && a.status === 'executed' && !a.overridden,
  };
}
