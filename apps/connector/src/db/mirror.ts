/**
 * The mirror's only public surface. Everything the connector needs from SQLite goes
 * through this class so that "the mirror is a mirror" stays enforceable by reading one
 * file. See db/schema.ts for the iron rule this obeys.
 */
import Database from 'better-sqlite3';
import { and, desc, eq, gte, like, lt, sql } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';

import { BOOTSTRAP_DDL, actions, events, memberAliases, members, settings } from './schema.js';

export interface AliasRow {
  readonly aliasTelegramId: number;
  readonly canonicalTelegramId: number;
  readonly handle: string;
  readonly note: string;
  readonly createdAtMs: number;
}

export interface LinkOutcome {
  readonly status: 'linked' | 'already_linked' | 'relinked';
  readonly realTelegramId: number;
  readonly canonicalTelegramId: number;
  readonly handle: string;
  readonly previousCanonicalId?: number;
  /** Present when the real id had already accumulated its own mirror row. */
  readonly merged?: {
    readonly firstSeenMs: number;
    readonly lastSeenMs: number | null;
    readonly messageCount: number;
    readonly eventsMoved: number;
  };
}

export class MirrorLinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MirrorLinkError';
  }
}

export interface MemberSnapshot {
  telegramId: number;
  handle: string | null;
  display: string;
  firstSeenMs: number;
  /** Null when the member has never *spoken* (join-only, or brand new). */
  lastSeenMs: number | null;
  messageCount: number;
}

export interface RecordEventInput {
  memberTelegramId: number;
  chatId: number;
  messageId?: number | null;
  type: string;
  content: string;
  tsMs: number;
  routed: boolean;
  routeReason: string;
}

export interface RecordActionInput {
  eventId?: number | null;
  action: string;
  originalAction: string;
  targetHandle?: string | null;
  targetTelegramId?: number | null;
  message?: string | null;
  reasoning: string;
  confidence: string;
  gated: boolean;
  converted?: string | null;
  warnings: string[];
  status: 'executed' | 'failed' | 'skipped';
  detail: string;
  postedChatId?: number | null;
  postedMessageId?: number | null;
  undo?: unknown;
  rawReply: string;
  tsMs: number;
}

export interface ActionRow {
  id: number;
  eventId: number | null;
  action: string;
  originalAction: string;
  targetHandle: string | null;
  targetTelegramId: number | null;
  message: string | null;
  reasoning: string;
  confidence: string;
  gated: boolean;
  converted: string | null;
  warnings: string[];
  status: string;
  detail: string;
  overridden: boolean;
  overrideNote: string | null;
  postedChatId: number | null;
  postedMessageId: number | null;
  undo: unknown;
  rawReply: string;
  tsMs: number;
}

/** Telegram usernames are case-insensitive; store and match them lowercased, without '@'. */
export function normalizeHandle(handle: string | null | undefined): string | null {
  if (typeof handle !== 'string') return null;
  const trimmed = handle.trim().replace(/^@+/, '').toLowerCase();
  return trimmed === '' ? null : trimmed;
}

export class Mirror {
  readonly db: BetterSQLite3Database;
  private readonly sqlite: Database.Database;

  private constructor(sqlite: Database.Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite);
  }

  /** `:memory:` is supported and is what the tests use. */
  static open(path: string): Mirror {
    if (path !== ':memory:') {
      mkdirSync(dirname(resolvePath(path)), { recursive: true });
    }
    const sqlite = new Database(path);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    sqlite.exec(BOOTSTRAP_DDL);
    return new Mirror(sqlite);
  }

  close(): void {
    this.sqlite.close();
  }

  // --- members -------------------------------------------------------------

  getMember(telegramId: number): MemberSnapshot | undefined {
    const row = this.db.select().from(members).where(eq(members.telegramId, telegramId)).all()[0];
    return row === undefined ? undefined : toSnapshot(row);
  }

  findMemberByHandle(handle: string): MemberSnapshot | undefined {
    const needle = normalizeHandle(handle);
    if (needle === null) return undefined;
    const row = this.db.select().from(members).where(eq(members.handle, needle)).all()[0];
    return row === undefined ? undefined : toSnapshot(row);
  }

  /**
   * Records that we have seen this member, and returns the state as it was BEFORE the
   * event. The envelope builder needs the prior state (that is what makes a message a
   * `member_returned`), so the read and the write cannot be separate calls that a future
   * refactor could reorder.
   *
   * `spoke: false` (a join) records the member but does NOT advance last_seen: a join is
   * not a conversation turn, and treating it as one would suppress the returning-member
   * envelope for their first actual message.
   */
  touchMember(input: {
    telegramId: number;
    handle: string | null;
    display: string;
    tsMs: number;
    spoke: boolean;
  }): { prior: MemberSnapshot | undefined; current: MemberSnapshot } {
    const prior = this.getMember(input.telegramId);
    const handle = normalizeHandle(input.handle);

    if (prior === undefined) {
      this.db
        .insert(members)
        .values({
          telegramId: input.telegramId,
          handle,
          display: input.display,
          firstSeenMs: input.tsMs,
          lastSeenMs: input.spoke ? input.tsMs : null,
          messageCount: input.spoke ? 1 : 0,
        })
        .run();
    } else {
      this.db
        .update(members)
        .set({
          // Telegram handles and display names change; the mirror follows Telegram.
          handle: handle ?? prior.handle,
          display: input.display,
          // Clock skew / out-of-order updates must never rewind last_seen.
          lastSeenMs: input.spoke ? Math.max(prior.lastSeenMs ?? 0, input.tsMs) : prior.lastSeenMs,
          messageCount: input.spoke ? prior.messageCount + 1 : prior.messageCount,
          firstSeenMs: Math.min(prior.firstSeenMs, input.tsMs),
        })
        .where(eq(members.telegramId, input.telegramId))
        .run();
    }

    const current = this.getMember(input.telegramId);
    /* c8 ignore next */
    if (current === undefined) throw new Error('mirror: member vanished immediately after write');
    return { prior, current };
  }

  listMembers(): MemberSnapshot[] {
    return this.db.select().from(members).all().map(toSnapshot);
  }

  // --- identity aliases -----------------------------------------------------

  /**
   * The id the Mind knows this person by. Identity for MEMORY (envelope, first/last seen,
   * return detection) resolves through here; Telegram operations keep using the real id,
   * because Telegram acts on the actual account. Returns the input when unaliased, so every
   * existing path is unchanged.
   *
   * Deliberately NOT transitive: an alias chain is a mistake, not a feature.
   */
  resolveCanonicalId(telegramId: number): number {
    const row = this.db
      .select({ canonical: memberAliases.canonicalTelegramId })
      .from(memberAliases)
      .where(eq(memberAliases.aliasTelegramId, telegramId))
      .all()[0];
    return row?.canonical ?? telegramId;
  }

  listAliases(): AliasRow[] {
    return this.db.select().from(memberAliases).all().map((r) => ({
      aliasTelegramId: r.aliasTelegramId,
      canonicalTelegramId: r.canonicalTelegramId,
      handle: r.handle,
      note: r.note,
      createdAtMs: r.createdAtMs,
    }));
  }

  /**
   * Point a real Telegram account at the identity the Mind already remembers.
   *
   * If the real id has already spoken it will have its own members row — very likely during
   * a live recording — so the two are merged rather than left split: earliest first_seen,
   * latest last_seen, summed message_count, and its events re-pointed at the canonical id.
   * That is the case which otherwise silently halves the demo's history.
   */
  linkMember(input: {
    realTelegramId: number;
    canonicalTelegramId: number;
    handle: string;
    note?: string;
    force?: boolean;
    tsMs: number;
  }): LinkOutcome {
    const { realTelegramId, canonicalTelegramId, handle, tsMs } = input;
    if (realTelegramId === canonicalTelegramId) {
      throw new MirrorLinkError('The real id and the canonical id are the same; nothing to link.');
    }
    const existing = this.db
      .select()
      .from(memberAliases)
      .where(eq(memberAliases.aliasTelegramId, realTelegramId))
      .all()[0];
    if (existing !== undefined && existing.canonicalTelegramId === canonicalTelegramId) {
      return { status: 'already_linked', realTelegramId, canonicalTelegramId, handle };
    }
    if (existing !== undefined && input.force !== true) {
      throw new MirrorLinkError(
        `${realTelegramId} is already linked to ${existing.canonicalTelegramId}, not ` +
          `${canonicalTelegramId}. Re-run with --force to overwrite that mapping.`,
      );
    }

    const canonicalRow = this.getMember(canonicalTelegramId);
    if (canonicalRow === undefined && input.force !== true) {
      throw new MirrorLinkError(
        `No mirrored member with id ${canonicalTelegramId}. If the Mind has no memory of ` +
          'this person there is nothing to preserve, so linking buys nothing. Use --force ' +
          'only if you know the canonical id is right and the mirror was reset.',
      );
    }

    return this.db.transaction((tx): LinkOutcome => {
      const realRow = this.getMember(realTelegramId);
      let merged: LinkOutcome['merged'];

      if (realRow !== undefined && canonicalRow !== undefined) {
        const moved = tx
          .update(events)
          .set({ memberTelegramId: canonicalTelegramId })
          .where(eq(events.memberTelegramId, realTelegramId))
          .run();
        const lastSeen =
          realRow.lastSeenMs === null
            ? canonicalRow.lastSeenMs
            : canonicalRow.lastSeenMs === null
              ? realRow.lastSeenMs
              : Math.max(canonicalRow.lastSeenMs, realRow.lastSeenMs);
        tx.update(members)
          .set({
            firstSeenMs: Math.min(canonicalRow.firstSeenMs, realRow.firstSeenMs),
            lastSeenMs: lastSeen,
            messageCount: canonicalRow.messageCount + realRow.messageCount,
          })
          .where(eq(members.telegramId, canonicalTelegramId))
          .run();
        tx.delete(members).where(eq(members.telegramId, realTelegramId)).run();
        merged = {
          firstSeenMs: Math.min(canonicalRow.firstSeenMs, realRow.firstSeenMs),
          lastSeenMs: lastSeen,
          messageCount: canonicalRow.messageCount + realRow.messageCount,
          eventsMoved: Number(moved.changes),
        };
      }

      if (existing !== undefined) {
        tx.delete(memberAliases).where(eq(memberAliases.aliasTelegramId, realTelegramId)).run();
      }
      tx.insert(memberAliases)
        .values({
          aliasTelegramId: realTelegramId,
          canonicalTelegramId,
          handle: normalizeHandle(handle) ?? handle,
          note: input.note ?? '',
          createdAtMs: tsMs,
        })
        .run();

      const base = { realTelegramId, canonicalTelegramId, handle } as const;
      if (existing !== undefined) {
        return {
          ...base,
          status: 'relinked',
          previousCanonicalId: existing.canonicalTelegramId,
          ...(merged === undefined ? {} : { merged }),
        };
      }
      return { ...base, status: 'linked', ...(merged === undefined ? {} : { merged }) };
    });
  }

  /** Returns true when a mapping was actually removed. */
  unlinkMember(realTelegramId: number): boolean {
    const result = this.db
      .delete(memberAliases)
      .where(eq(memberAliases.aliasTelegramId, realTelegramId))
      .run();
    return Number(result.changes) > 0;
  }

  // --- events --------------------------------------------------------------

  /**
   * Returns the new event id, or `null` when this exact Telegram message has already been
   * recorded (see events_message_uniq). Callers must treat null as "already handled" and
   * do nothing further — that is what stops a duplicate reply reaching the group.
   */
  recordEvent(input: RecordEventInput): number | null {
    const result = this.db
      .insert(events)
      .values({
        memberTelegramId: input.memberTelegramId,
        chatId: input.chatId,
        messageId: input.messageId ?? null,
        type: input.type,
        content: input.content,
        tsMs: input.tsMs,
        routed: input.routed ? 1 : 0,
        routeReason: input.routeReason,
      })
      .onConflictDoNothing()
      .run();
    // better-sqlite3 reports 0 changes when the unique index swallowed the insert.
    return result.changes === 0 ? null : Number(result.lastInsertRowid);
  }

  /** Mind exchanges actually spent in [fromMs, toMs). Survives a restart, unlike a counter. */
  routedCountBetween(fromMs: number, toMs: number): number {
    const row = this.db
      .select({ n: sql<number>`count(*)` })
      .from(events)
      .where(and(eq(events.routed, 1), gte(events.tsMs, fromMs), lt(events.tsMs, toMs)))
      .all()[0];
    return row?.n ?? 0;
  }

  /**
   * 1-based ordinal of the next ordinary message, counted over EVERY mirrored message —
   * routed or not. Counting only the not-routed ones latches the sampler on: the ordinal
   * stops advancing the moment a message routes, so `ordinal % N === 0` stays true for
   * every message after the first sample and the whole day's budget burns in one burst.
   * Read from durable state so a restart does not reset the sampler.
   */
  ambientOrdinalNext(): number {
    const row = this.db
      .select({ n: sql<number>`count(*)` })
      .from(events)
      .where(eq(events.type, 'message'))
      .all()[0];
    return (row?.n ?? 0) + 1;
  }

  /**
   * True when this member already has a `member_joined` event in this chat at or after
   * `sinceMs`. Telegram delivers one supergroup join TWICE — as a `chat_member` update and
   * as a `new_chat_members` service message — and without this both would buy a Mind
   * exchange and post a second welcome.
   */
  hasJoinSince(memberTelegramId: number, chatId: number, sinceMs: number): boolean {
    const row = this.db
      .select({ n: sql<number>`count(*)` })
      .from(events)
      .where(
        and(
          eq(events.memberTelegramId, memberTelegramId),
          eq(events.chatId, chatId),
          eq(events.type, 'member_joined'),
          gte(events.tsMs, sinceMs),
        ),
      )
      .all()[0];
    return (row?.n ?? 0) > 0;
  }

  // --- actions (the moderation log) ----------------------------------------

  recordAction(input: RecordActionInput): number {
    const result = this.db
      .insert(actions)
      .values({
        eventId: input.eventId ?? null,
        action: input.action,
        originalAction: input.originalAction,
        targetHandle: normalizeHandle(input.targetHandle),
        targetTelegramId: input.targetTelegramId ?? null,
        message: input.message ?? null,
        reasoning: input.reasoning,
        confidence: input.confidence,
        gated: input.gated ? 1 : 0,
        converted: input.converted ?? null,
        warnings: JSON.stringify(input.warnings),
        status: input.status,
        detail: input.detail,
        postedChatId: input.postedChatId ?? null,
        postedMessageId: input.postedMessageId ?? null,
        undoJson: input.undo === undefined ? null : JSON.stringify(input.undo),
        rawReply: input.rawReply,
        tsMs: input.tsMs,
      })
      .run();
    return Number(result.lastInsertRowid);
  }

  /** The most recent action, whatever its status — `/keeper why` explains failures too. */
  latestAction(): ActionRow | undefined {
    const row = this.db.select().from(actions).orderBy(desc(actions.id)).limit(1).all()[0];
    return row === undefined ? undefined : toActionRow(row);
  }

  /** The most recent action that actually changed the group and has not been undone. */
  latestUndoableAction(): ActionRow | undefined {
    const rows = this.db
      .select()
      .from(actions)
      .where(and(eq(actions.status, 'executed'), eq(actions.overridden, 0)))
      .orderBy(desc(actions.id))
      .limit(1)
      .all();
    const row = rows[0];
    return row === undefined ? undefined : toActionRow(row);
  }

  listActions(limit = 50): ActionRow[] {
    return this.db.select().from(actions).orderBy(desc(actions.id)).limit(limit).all().map(toActionRow);
  }

  markOverridden(id: number, note: string): void {
    this.db.update(actions).set({ overridden: 1, overrideNote: note }).where(eq(actions.id, id)).run();
  }

  // --- settings ------------------------------------------------------------

  getSetting(key: string): string | undefined {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).all()[0];
    return row?.value;
  }

  setSetting(key: string, value: string, tsMs: number): void {
    this.db
      .insert(settings)
      .values({ key, value, updatedAtMs: tsMs })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAtMs: tsMs } })
      .run();
  }

  /**
   * Every setting whose key starts with `prefix`. Used to find outstanding day-2 check-ins
   * without a table of their own: one row per member who is owed one, deleted when paid.
   */
  listSettings(prefix: string): Array<{ key: string; value: string }> {
    return this.db
      .select()
      .from(settings)
      .where(like(settings.key, `${prefix}%`))
      .all()
      .map((r) => ({ key: r.key, value: r.value }));
  }

  deleteSetting(key: string): void {
    this.db.delete(settings).where(eq(settings.key, key)).run();
  }

  isPaused(): boolean {
    return this.getSetting('paused') === 'true';
  }

  setPaused(paused: boolean, tsMs: number): void {
    this.setSetting('paused', paused ? 'true' : 'false', tsMs);
  }
}

type MemberRow = typeof members.$inferSelect;
type ActionRowRaw = typeof actions.$inferSelect;

function toSnapshot(row: MemberRow): MemberSnapshot {
  return {
    telegramId: row.telegramId,
    handle: row.handle,
    display: row.display,
    firstSeenMs: row.firstSeenMs,
    lastSeenMs: row.lastSeenMs,
    messageCount: row.messageCount,
  };
}

function toActionRow(row: ActionRowRaw): ActionRow {
  return {
    id: row.id,
    eventId: row.eventId,
    action: row.action,
    originalAction: row.originalAction,
    targetHandle: row.targetHandle,
    targetTelegramId: row.targetTelegramId,
    message: row.message,
    reasoning: row.reasoning,
    confidence: row.confidence,
    gated: row.gated === 1,
    converted: row.converted,
    warnings: parseJson<string[]>(row.warnings, []),
    status: row.status,
    detail: row.detail,
    overridden: row.overridden === 1,
    overrideNote: row.overrideNote,
    postedChatId: row.postedChatId,
    postedMessageId: row.postedMessageId,
    undo: row.undoJson === null ? undefined : parseJson<unknown>(row.undoJson, undefined),
    rawReply: row.rawReply,
    tsMs: row.tsMs,
  };
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
