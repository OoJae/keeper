/**
 * The bridge from "posted to Telegram" to "the Steward Mind knows about it".
 *
 * Telegram never delivers a bot its own messages, and never delivers one bot another
 * bot's, so a relayed cast line is invisible to the connector's bot API. Every line the
 * seeder posts is therefore also appended here, and the connector ingests it as if
 * Telegram had delivered it (apps/connector/src/seed-inbox.ts).
 *
 * `tsMs` is Telegram's own timestamp for the message. Nothing in this file can invent a
 * time, which is what BUILD_PLAN §8 protects.
 *
 * The connector only reads this file when KEEPER_SEED_ATTRIBUTION=true.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
export const INBOX_PATH = join(REPO_ROOT, 'var', 'seed-inbox.jsonl');

export interface InboxEntry {
  handle: string;
  display: string;
  text: string;
  tsMs: number;
  chatId: number;
  messageId: number;
}

export function appendInbox(entry: InboxEntry): void {
  mkdirSync(join(REPO_ROOT, 'var'), { recursive: true });
  appendFileSync(INBOX_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
}
