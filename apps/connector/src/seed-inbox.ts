/**
 * Seeded-history ingest (demo harness only).
 *
 * The problem this solves: Telegram never delivers a bot its own messages, and never
 * delivers one bot another bot's messages. So when apps/seeder relays a cast member's
 * line through a bot, the connector cannot see it — the group fills with visible history
 * while the Steward Mind learns nothing, which is the opposite of the point.
 *
 * The fix is a file, not a socket: the seeder appends one JSON line per message it
 * actually posted, and the connector ingests those lines exactly as if Telegram had
 * delivered them. A file survives the connector being down — start it tomorrow and it
 * catches up from where it stopped — and it needs no port, no secret and no new dependency.
 *
 * What stays honest (BUILD_PLAN §8): the messages are really posted, at the real moment,
 * and `tsMs` is the timestamp Telegram itself assigned. Nothing here can invent a time.
 * The cast being fictional is disclosed in apps/seeder/README.md and the project README.
 *
 * Each cast handle maps to a stable synthetic member id so a character is the SAME person
 * to the Mind across days — which is exactly what the returning-member beat depends on.
 * Synthetic ids are negative; real Telegram user ids are positive, so they cannot collide.
 */
import { existsSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs';

import { z } from 'zod';

import type { Mirror } from './db/mirror.js';
import { log } from './log.js';
import type { EventRouter } from './pipeline/router.js';

/** One line the seeder wrote after Telegram accepted the post. */
const SeedLineSchema = z.object({
  handle: z.string().min(1).max(64),
  display: z.string().min(1).max(128).optional(),
  text: z.string().min(1),
  /** Telegram's own timestamp for the posted message, in ms. */
  tsMs: z.number().int().positive(),
  chatId: z.number().int(),
  messageId: z.number().int().positive().optional(),
});

export type SeedLine = z.infer<typeof SeedLineSchema>;

/** Where the connector stopped reading, so a restart does not re-ingest the whole file. */
const OFFSET_KEY = 'seed_inbox_offset';

/** FNV-1a over the handle, forced negative. Stable across runs and processes. */
export function syntheticMemberId(handle: string): number {
  let h = 2_166_136_261;
  const key = handle.toLowerCase();
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return -(2_000_000_000 + (Math.abs(h) % 1_000_000_000));
}

export interface SeedInboxOptions {
  readonly path: string;
  readonly router: Pick<EventRouter, 'ingest'>;
  readonly mirror: Pick<Mirror, 'getSetting' | 'setSetting'>;
  /** Injected so tests can pin the clock; setSetting stamps its own row. */
  readonly now?: () => number;
  readonly groupChatId: number;
}

export class SeedInbox {
  private watcher: FSWatcher | null = null;
  private draining = false;
  private pending = false;

  constructor(private readonly opts: SeedInboxOptions) {}

  /** Ingest whatever is already there, then follow the file. */
  start(): void {
    this.drain();
    if (!existsSync(this.opts.path)) {
      log.info('seed_inbox_waiting', { path: this.opts.path });
      return;
    }
    this.follow();
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private follow(): void {
    if (this.watcher !== null) return;
    try {
      this.watcher = watch(this.opts.path, () => {
        this.drain();
      });
    } catch (error) {
      // A missing file is normal before the first seeded day; anything else is worth saying.
      log.warn('seed_inbox_watch_failed', { path: this.opts.path, error: String(error) });
    }
  }

  /**
   * Read from the stored offset to EOF. Partial trailing lines (the seeder mid-write) are
   * left for the next pass, so the offset only ever advances past a complete line.
   */
  drain(): void {
    if (this.draining) {
      this.pending = true;
      return;
    }
    this.draining = true;
    try {
      this.readOnce();
    } finally {
      this.draining = false;
      if (this.pending) {
        this.pending = false;
        this.drain();
      }
    }
  }

  private readOnce(): void {
    const { path } = this.opts;
    if (!existsSync(path)) return;

    const stored = Number(this.opts.mirror.getSetting(OFFSET_KEY) ?? '0');
    let offset = Number.isFinite(stored) && stored >= 0 ? stored : 0;
    const size = statSync(path).size;
    // Truncated or replaced (a fresh demo run): start over rather than read garbage.
    if (size < offset) offset = 0;
    if (size === offset) {
      this.follow();
      return;
    }

    const buffer = readFileSync(path).subarray(offset);
    const text = buffer.toString('utf8');
    const lastNewline = text.lastIndexOf('\n');
    if (lastNewline === -1) return; // no complete line yet

    const complete = text.slice(0, lastNewline);
    let ingested = 0;
    for (const raw of complete.split('\n')) {
      const line = raw.trim();
      if (line === '') continue;
      if (this.ingestLine(line)) ingested += 1;
    }

    const consumed = offset + Buffer.byteLength(complete, 'utf8') + 1;
    this.opts.mirror.setSetting(OFFSET_KEY, String(consumed), (this.opts.now ?? Date.now)());
    if (ingested > 0) log.info('seed_inbox_ingested', { count: ingested, offset: consumed });
    this.follow();
  }

  private ingestLine(line: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      log.warn('seed_inbox_bad_json', { line: line.slice(0, 120) });
      return false;
    }
    const result = SeedLineSchema.safeParse(parsed);
    if (!result.success) {
      log.warn('seed_inbox_bad_line', {
        issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
      return false;
    }
    const entry = result.data;
    // Only the demo group. A stray file must not be able to inject events elsewhere.
    if (entry.chatId !== this.opts.groupChatId) {
      log.warn('seed_inbox_wrong_chat', { got: entry.chatId, want: this.opts.groupChatId });
      return false;
    }

    const handle = entry.handle.replace(/^@/, '');
    this.opts.router.ingest({
      kind: 'message',
      member: {
        telegramId: syntheticMemberId(handle),
        handle,
        display: entry.display ?? handle,
      },
      text: entry.text,
      chatId: entry.chatId,
      ...(entry.messageId === undefined ? {} : { messageId: entry.messageId }),
      tsMs: entry.tsMs,
    });
    return true;
  }
}
