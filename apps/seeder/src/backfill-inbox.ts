/**
 * One-off: rebuild var/seed-inbox.jsonl for days that were posted before the inbox
 * existed. Timestamps are read from var/seed-log.jsonl, which records what Telegram
 * actually accepted and when — this cannot invent a time (BUILD_PLAN §8).
 *
 *   pnpm --filter @keeper/seeder exec tsx src/backfill-inbox.ts <day>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { scriptedDaysFor } from './calendar.js';
import { CAST, DAYS } from './cast.js';
import { appendInbox } from './inbox.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const day = Number(process.argv[2] ?? '1');

const entries = readFileSync(join(ROOT, 'var', 'seed-log.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => JSON.parse(l) as { day: number; index: number; chatId: string; messageId: number; postedAt: string })
  .filter((e) => e.day === day);

const script = scriptedDaysFor(day).flatMap((n) => DAYS[n] ?? []);
let written = 0;
for (const entry of entries) {
  const msg = script[entry.index - 1];
  if (msg === undefined) {
    process.stdout.write(`skip: no script line at index ${entry.index}\n`);
    continue;
  }
  const cast = CAST[msg.from];
  appendInbox({
    handle: cast?.handle ?? msg.from,
    display: cast?.display ?? msg.from,
    text: msg.text,
    tsMs: Date.parse(entry.postedAt),
    chatId: Number(entry.chatId),
    messageId: entry.messageId,
  });
  written += 1;
}
process.stdout.write(`backfilled ${written} line(s) for day ${day} into var/seed-inbox.jsonl\n`);
