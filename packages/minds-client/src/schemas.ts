import { z } from 'zod';
import { MindsShapeError } from './errors.js';
import type { MindMessage, SenderKind } from './types.js';

/**
 * LOOSE-REQUIRED + passthrough, deliberately.
 *
 * Only fields we actually branch on are required; everything else is optional and
 * every unknown/new field flows through untouched into `raw`. A beta platform adds
 * fields weekly — a strict schema would turn every additive change into an outage,
 * and a permissive-but-coercing schema would silently invent data. So: require the
 * few load-bearing fields, pass the rest through, and throw loudly if the load-bearing
 * ones are gone.
 */

export const MessageRecordSchema = z
  .object({
    fingerprint: z.string(),
    conversationId: z.string().optional(),
    messageText: z.string().nullish(),
    senderType: z.number().nullable().optional(),
    createdAt: z.string().optional(),
  })
  .passthrough();
export type MessageRecord = z.infer<typeof MessageRecordSchema>;

export const MessageRecordListSchema = z.array(MessageRecordSchema);

export const ConversationSchema = z
  .object({
    conversationId: z.string(),
    alias: z.string().optional(),
    mindId: z.string().optional(),
  })
  .passthrough();
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationListSchema = z.array(ConversationSchema);

export const CognitionBalanceSchema = z
  .object({
    mindId: z.string().optional(),
    cognition: z.number(),
  })
  .passthrough();
export type CognitionBalance = z.infer<typeof CognitionBalanceSchema>;

export const BuilderMindSchema = z
  .object({
    mindId: z.string(),
    name: z.string().optional(),
    walletAddress: z.string().nullish(),
    chain: z.string().nullish(),
    telegramBotId: z.union([z.string(), z.number()]).nullish(),
    hasTelegram: z.boolean().optional(),
  })
  .passthrough();
export type BuilderMind = z.infer<typeof BuilderMindSchema>;

/** POST /v1/messaging/message returns an undocumented object; we only hope for a cursor. */
export const SendResponseSchema = z
  .object({
    fingerprint: z.string().optional(),
    conversationId: z.string().optional(),
    /**
     * LIVE-VERIFIED 2026-08-22: this deployment returns no `fingerprint`, but it does
     * return `messageId`, and a history fingerprint is `<seq>_<messageId>`. That lets
     * send() recover its own cursor instead of guessing from a pre-send snapshot.
     */
    messageId: z.string().optional(),
    messageText: z.string().nullish(),
  })
  .passthrough();
export type SendResponse = z.infer<typeof SendResponseSchema>;

/** Parse or throw a loud MindsShapeError. Never coerce, never guess. */
export function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  endpoint: string,
  raw: unknown,
): z.infer<T> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new MindsShapeError(endpoint, result.error.issues, raw);
  }
  return result.data;
}

/**
 * senderType is an untyped number in the official client's `.d.ts`, documented only by
 * a comment: 0 or 2 = the Mind, 1 = human. Anything else is 'unknown' — never guessed
 * into 'mind', because a false 'mind' match would end an awaitReply on the wrong record.
 */
export function mapSenderType(senderType: number | null | undefined): SenderKind {
  if (senderType === 0 || senderType === 2) return 'mind';
  if (senderType === 1) return 'human';
  return 'unknown';
}

export function toMindMessage(record: MessageRecord): MindMessage {
  return {
    id: record.fingerprint,
    text: record.messageText ?? null,
    sender: mapSenderType(record.senderType),
    at: parseDate(record.createdAt),
    raw: record,
  };
}

function parseDate(value: string | undefined): Date | null {
  if (value === undefined) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * List endpoints are documented as returning bare arrays, but beta APIs love to wrap
 * results in an envelope later. Accept either; the caller's schema still validates the
 * elements, so this tolerance cannot smuggle in an unvalidated shape.
 */
export function unwrapArray(body: unknown): unknown {
  if (Array.isArray(body)) return body;
  if (typeof body === 'object' && body !== null) {
    for (const key of ['data', 'items', 'records', 'messages', 'conversations'] as const) {
      const inner = (body as Record<string, unknown>)[key];
      if (Array.isArray(inner)) return inner;
    }
  }
  return body;
}
