import type { z } from 'zod';
import type {
  ConfidenceSchema,
  DirectiveSchema,
  EventTypeSchema,
  KeeperEventSchema,
  MemberRefSchema,
  RewardInfoSchema,
} from './schemas.js';

export type EventType = z.infer<typeof EventTypeSchema>;
export type MemberRef = z.infer<typeof MemberRefSchema>;

/**
 * Callers build events, so the *input* type is the useful one:
 * `utcOffsetMinutes` is optional going in and always present coming out.
 */
export type KeeperEvent = z.input<typeof KeeperEventSchema>;
export type ParsedKeeperEvent = z.output<typeof KeeperEventSchema>;

export type Confidence = z.infer<typeof ConfidenceSchema>;
export type RewardInfo = z.infer<typeof RewardInfoSchema>;
export type KeeperDirective = z.infer<typeof DirectiveSchema>;
export type DirectiveAction = KeeperDirective['action'];

/** Narrow the directive union to one action, e.g. `DirectiveOf<'reward'>`. */
export type DirectiveOf<A extends DirectiveAction> = Extract<KeeperDirective, { action: A }>;
export type NoneDirective = DirectiveOf<'none'>;

/** The only directive the connector ever executes when parsing fails. */
export const NONE_FALLBACK: NoneDirective = Object.freeze({
  action: 'none',
  reasoning: 'parse_failure',
  confidence: 'low',
});

/**
 * Actions that touch the group or the chain. A low-confidence directive with one
 * of these is rewritten into a creator flag (see `gateDirective`); 'none' and
 * 'flag_creator' are already safe at any confidence.
 */
export const ACTING_ACTIONS: ReadonlySet<DirectiveAction> = new Set<DirectiveAction>([
  'reply',
  'warn',
  'delete',
  'mute',
  'reward',
  'digest',
]);

export type FallbackReason = 'no_json_found' | 'json_invalid' | 'schema_invalid';

/**
 * Always carries a runnable `directive`, so the connector never branches to stay
 * safe: `const r = extractDirective(t); await execute(r.directive);`
 */
export type DirectiveParseResult =
  | {
      kind: 'ok';
      directive: KeeperDirective;
      /** True when the low-confidence gate rewrote the Mind's directive. */
      gated: boolean;
      rawBlock: string;
      warnings: string[];
    }
  | {
      kind: 'fallback';
      directive: NoneDirective;
      reason: FallbackReason;
      detail: string;
      rawSnippet?: string;
    };
