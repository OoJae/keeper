/**
 * The Cognition pre-filter (BUILD_PLAN §5 Phase 1, §7).
 *
 * Every message routed to the Mind burns credits we cannot price (the credits endpoint
 * returns an undocumented shape — docs/API-NOTES.md), so the budget is enforced by
 * counting locally and refusing, not by hoping. Everything not routed is still mirrored.
 *
 * This is a pure function on purpose: routing is the one decision that costs money and
 * the one a judge may ask us to justify, so it must be readable and exhaustively testable.
 */
import type { EventType } from '@keeper/protocol';

export type RouteReason =
  // routed
  | 'creator_command'
  | 'member_joined'
  | 'member_returned'
  | 'scheduled_digest'
  | 'heuristic:mention'
  | 'heuristic:profanity'
  | 'heuristic:link'
  | 'heuristic:shouting'
  | 'heuristic:question'
  | 'ambient_sample'
  // not routed
  | 'paused'
  | 'empty'
  | 'not_judgment_worthy'
  | 'duplicate_join'
  | 'daily_cap'
  | 'daily_cap_priority';

export interface RouteDecision {
  route: boolean;
  reason: RouteReason;
  /** Human-readable note for the log and the dashboard's budget panel. */
  detail: string;
}

export interface BudgetConfig {
  /** Hard ceiling on Mind exchanges per local day. */
  dailyMindBudget: number;
  /** Slice of the ceiling only priority events may spend. */
  priorityReserve: number;
  /** Route every Nth otherwise-uninteresting message. 0 disables. */
  ambientSampleRate: number;
}

export interface PrefilterInput {
  type: EventType;
  text: string;
  /** True when the message @-mentions the bot or replies to one of its messages. */
  mentionsBot: boolean;
  /** True when Telegram's own entity parser found a url/text_link in the message. */
  hasLinkEntity: boolean;
  /** Creator issued `/keeper pause`. */
  paused: boolean;
  /** Mind exchanges already spent today (read from the mirror, so restart-proof). */
  routedToday: number;
  /** 1-based ordinal of this message among messages that nothing else routed. */
  ambientOrdinal: number;
}

/**
 * Deliberately small and deliberately mild. The Mind makes the moderation call; this
 * list only decides whether the Mind gets to *see* the message. A false positive here
 * costs one Cognition credit, a false negative costs a missed moderation beat.
 */
const PROFANITY = [
  'fuck', 'fuk', 'shit', 'bitch', 'bastard', 'asshole', 'cunt', 'dick',
  'retard', 'faggot', 'nigger', 'whore', 'slut', 'idiot', 'moron', 'garbage', 'trash', 'stupid',
];
const PROFANITY_RE = new RegExp(`(^|[^a-z])(${PROFANITY.join('|')})([^a-z]|$)`, 'i');

const LINK_RE = /(https?:\/\/|www\.[a-z0-9-]+\.|t\.me\/|\b[a-z0-9-]+\.(com|net|org|io|xyz|ru|shop|link)\b)/i;
const QUESTION_RE = /\?/;

/** Only letters count: "!!!!!" is punctuation, not shouting. */
export function shoutRatio(text: string): number {
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8) return 0;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length;
}

const PRIORITY_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  'creator_command',
  'member_joined',
  'member_returned',
  'scheduled_digest',
]);

function priorityReason(type: EventType): RouteReason {
  switch (type) {
    case 'creator_command':
      return 'creator_command';
    case 'member_joined':
      return 'member_joined';
    case 'member_returned':
      return 'member_returned';
    default:
      return 'scheduled_digest';
  }
}

/**
 * Heuristic order matters: it decides the reason we log, and a spam link that also
 * contains a '?' should be logged as a link, not as a question. Questions are last
 * because in a help community almost everything is one.
 */
function heuristicReason(input: PrefilterInput): RouteReason | null {
  if (input.mentionsBot) return 'heuristic:mention';
  if (PROFANITY_RE.test(input.text)) return 'heuristic:profanity';
  if (input.hasLinkEntity || LINK_RE.test(input.text)) return 'heuristic:link';
  if (shoutRatio(input.text) >= 0.7) return 'heuristic:shouting';
  if (QUESTION_RE.test(input.text)) return 'heuristic:question';
  return null;
}

export function decideRoute(input: PrefilterInput, budget: BudgetConfig): RouteDecision {
  // Pause is the creator's kill switch; only their own commands survive it, so that
  // `/keeper resume` cannot be swallowed by the thing it is trying to turn back on.
  if (input.paused && input.type !== 'creator_command') {
    return { route: false, reason: 'paused', detail: 'Keeper is paused by the creator' };
  }

  const priority = PRIORITY_TYPES.has(input.type);

  let candidate: RouteReason | null;
  if (priority) {
    candidate = priorityReason(input.type);
  } else if (input.text.trim() === '') {
    return { route: false, reason: 'empty', detail: 'no text to judge' };
  } else {
    candidate = heuristicReason(input);
    if (
      candidate === null &&
      budget.ambientSampleRate > 0 &&
      input.ambientOrdinal % budget.ambientSampleRate === 0
    ) {
      candidate = 'ambient_sample';
    }
  }

  if (candidate === null) {
    return { route: false, reason: 'not_judgment_worthy', detail: 'no heuristic tripped, not sampled' };
  }

  // Budget last: we want the log to say WHICH interesting event we had to drop.
  const ceiling = priority
    ? budget.dailyMindBudget
    : Math.max(0, budget.dailyMindBudget - budget.priorityReserve);

  if (input.routedToday >= ceiling) {
    return {
      route: false,
      reason: priority ? 'daily_cap_priority' : 'daily_cap',
      detail:
        `would have routed as ${candidate}, but ${input.routedToday}/${budget.dailyMindBudget} ` +
        `exchanges are spent today (ceiling for this class: ${ceiling})`,
    };
  }

  return {
    route: true,
    reason: candidate,
    detail: `${input.routedToday + 1}/${budget.dailyMindBudget} exchanges used today`,
  };
}

/** Start-of-day in the community's own offset frame, as an absolute ms instant. */
export function dayWindow(nowMs: number, utcOffsetMinutes: number): { fromMs: number; toMs: number } {
  const dayMs = 86_400_000;
  const shifted = nowMs + utcOffsetMinutes * 60_000;
  const startShifted = Math.floor(shifted / dayMs) * dayMs;
  const fromMs = startShifted - utcOffsetMinutes * 60_000;
  return { fromMs, toMs: fromMs + dayMs };
}
