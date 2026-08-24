import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Inbound: the Member Identity Envelope (connector -> Steward Mind)
 * ------------------------------------------------------------------ */

export const EventTypeSchema = z.enum([
  'message',
  'member_joined',
  'member_returned',
  'scheduled_digest',
  'creator_command',
]);

export const MemberRefSchema = z.object({
  handle: z.string().min(1),
  /**
   * A stable identifier for this member, rendered verbatim into the envelope's `id:`
   * field. Real Telegram user ids are positive; the demo harness uses NEGATIVE ids for
   * seeded cast members (apps/connector/src/seed-inbox.ts), which is what keeps a
   * character the same person to the Mind across days without ever colliding with a real
   * account. Zero is excluded because it identifies nobody.
   */
  id: z.number().int().refine((n) => n !== 0, { message: 'must not be 0' }),
  display: z.string().min(1),
});

export const KeeperEventSchema = z.object({
  type: EventTypeSchema,
  member: MemberRefSchema,
  firstSeen: z.date(),
  /** Absent means "first-timer": the envelope omits the last_seen line entirely. */
  lastSeen: z.date().optional(),
  group: z.string().min(1),
  ts: z.date(),
  /** Minutes east of UTC. -840..840 covers UTC-14:00 .. UTC+14:00. */
  utcOffsetMinutes: z.number().int().min(-840).max(840).default(0),
  content: z.string(),
});

/* ------------------------------------------------------------------ *
 * Outbound: the KEEPER-ACTION directive (Steward Mind -> connector)
 * ------------------------------------------------------------------ */

export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const DirectiveActionSchema = z.enum([
  'none',
  'reply',
  'warn',
  'delete',
  'mute',
  'flag_creator',
  'reward',
  'digest',
]);

export const RewardInfoSchema = z.object({
  type: z.string().min(1),
  note: z.string().default(''),
});

/**
 * Fields every directive carries. `.catch()` before `.default()` so that a
 * garbage value from the LLM degrades to the safe value instead of failing the
 * whole directive — a missing/garbled confidence must land on 'low', which the
 * gate then converts into a creator flag.
 */
const directiveBase = {
  reasoning: z.string().catch('').default(''),
  confidence: ConfidenceSchema.catch('low').default('low'),
};

const targetRequired = z.string().min(1);
const targetOptional = z.string().min(1).optional();
const messageRequired = z.string().min(1);
const messageOptional = z.string().optional();

export const DirectiveSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('none'),
    message: messageOptional,
    ...directiveBase,
  }),
  z.object({
    action: z.literal('reply'),
    target_member: targetOptional,
    message: messageRequired,
    ...directiveBase,
  }),
  z.object({
    action: z.literal('warn'),
    target_member: targetRequired,
    message: messageRequired,
    ...directiveBase,
  }),
  z.object({
    action: z.literal('delete'),
    target_member: targetRequired,
    message: messageOptional,
    ...directiveBase,
  }),
  z.object({
    action: z.literal('mute'),
    target_member: targetRequired,
    message: messageOptional,
    ...directiveBase,
  }),
  z.object({
    action: z.literal('flag_creator'),
    target_member: targetOptional,
    message: messageRequired,
    ...directiveBase,
  }),
  z.object({
    action: z.literal('reward'),
    target_member: targetRequired,
    message: messageOptional,
    reward: RewardInfoSchema,
    ...directiveBase,
  }),
  z.object({
    action: z.literal('digest'),
    message: messageRequired,
    ...directiveBase,
  }),
]);
