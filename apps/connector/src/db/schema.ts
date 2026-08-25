/**
 * The SQLite MIRROR schema.
 *
 * IRON RULE (CLAUDE.md, BUILD_PLAN §1.1): relationship memory lives in the Steward
 * Mind. This database is a mirror for dashboard rendering and the audit log ONLY.
 * Nothing here is the source of truth for who a member *is* — delete the file and
 * Keeper still remembers everyone, because the Mind does. What we lose on delete is
 * the local moderation log and the first_seen/last_seen bookkeeping used to *label*
 * envelopes, which the Mind then re-learns from the envelopes themselves.
 *
 * The DDL below and the drizzle tables below it describe the same schema. They are in
 * one file on purpose: drift between them is then a visible diff, not a runtime mystery.
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Bootstrap migration. Idempotent — safe to run on every start. */
export const BOOTSTRAP_DDL = `
CREATE TABLE IF NOT EXISTS members (
  telegram_id   INTEGER PRIMARY KEY,
  handle        TEXT,
  display       TEXT    NOT NULL,
  first_seen_ms INTEGER NOT NULL,
  last_seen_ms  INTEGER,
  message_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS members_handle_idx ON members (handle);

CREATE TABLE IF NOT EXISTS events (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  member_telegram_id INTEGER NOT NULL,
  chat_id            INTEGER NOT NULL,
  message_id         INTEGER,
  type               TEXT    NOT NULL,
  content            TEXT    NOT NULL,
  ts_ms              INTEGER NOT NULL,
  routed             INTEGER NOT NULL DEFAULT 0,
  route_reason       TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS events_ts_idx     ON events (ts_ms);
CREATE INDEX IF NOT EXISTS events_routed_idx ON events (routed, ts_ms);
-- One Telegram message is one event, forever. Two connector processes, a replayed seed
-- inbox, or a redelivered update would otherwise each mint their own row — and each row
-- buys its own Mind exchange and its own reply, so Keeper answers the same message twice
-- in the group. That happened once (2026-08-25) and it is unacceptable on camera, so the
-- guarantee lives in the schema rather than in everyone remembering to be careful.
-- Partial: rows without a message_id (joins, scheduled digests) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS events_message_uniq
  ON events (chat_id, message_id) WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS actions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id           INTEGER,
  action             TEXT    NOT NULL,
  original_action    TEXT    NOT NULL,
  target_handle      TEXT,
  target_telegram_id INTEGER,
  message            TEXT,
  reasoning          TEXT    NOT NULL DEFAULT '',
  confidence         TEXT    NOT NULL DEFAULT 'low',
  gated              INTEGER NOT NULL DEFAULT 0,
  converted          TEXT,
  warnings           TEXT    NOT NULL DEFAULT '[]',
  status             TEXT    NOT NULL,
  detail             TEXT    NOT NULL DEFAULT '',
  overridden         INTEGER NOT NULL DEFAULT 0,
  override_note      TEXT,
  posted_chat_id     INTEGER,
  posted_message_id  INTEGER,
  undo_json          TEXT,
  raw_reply          TEXT    NOT NULL DEFAULT '',
  ts_ms              INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS actions_ts_idx ON actions (ts_ms);

CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT    NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
`;

export const members = sqliteTable('members', {
  telegramId: integer('telegram_id').primaryKey(),
  /** Telegram usernames are optional; null means "no @handle". */
  handle: text('handle'),
  display: text('display').notNull(),
  firstSeenMs: integer('first_seen_ms').notNull(),
  /** Null until the member's first *message* — a bare join has not been "seen" talking. */
  lastSeenMs: integer('last_seen_ms'),
  messageCount: integer('message_count').notNull().default(0),
});

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  memberTelegramId: integer('member_telegram_id').notNull(),
  chatId: integer('chat_id').notNull(),
  messageId: integer('message_id'),
  type: text('type').notNull(),
  content: text('content').notNull(),
  tsMs: integer('ts_ms').notNull(),
  /** 0/1. Every event is mirrored; only some are routed to the Mind (cognition costs). */
  routed: integer('routed').notNull().default(0),
  /** Why the pre-filter decided as it did. Auditable budget story for the demo. */
  routeReason: text('route_reason').notNull().default(''),
});

export const actions = sqliteTable('actions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id'),
  /** What we actually attempted (after gating / unfenced conversion). */
  action: text('action').notNull(),
  /** What the Mind asked for. Differs from `action` when we refused or downgraded. */
  originalAction: text('original_action').notNull(),
  targetHandle: text('target_handle'),
  targetTelegramId: integer('target_telegram_id'),
  message: text('message'),
  reasoning: text('reasoning').notNull().default(''),
  confidence: text('confidence').notNull().default('low'),
  gated: integer('gated').notNull().default(0),
  converted: text('converted'),
  warnings: text('warnings').notNull().default('[]'),
  /** 'executed' | 'failed' | 'skipped' */
  status: text('status').notNull(),
  detail: text('detail').notNull().default(''),
  overridden: integer('overridden').notNull().default(0),
  overrideNote: text('override_note'),
  postedChatId: integer('posted_chat_id'),
  postedMessageId: integer('posted_message_id'),
  undoJson: text('undo_json'),
  /** The Mind's raw reply. Beta platform: never throw away the evidence. */
  rawReply: text('raw_reply').notNull().default(''),
  tsMs: integer('ts_ms').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
});
