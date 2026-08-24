/**
 * Phase 2 — teach the Steward Mind its charter, conversationally.
 *
 *   pnpm teach:charter            # send every message that has not been sent yet
 *   pnpm teach:charter --dry-run  # print what would be sent, touch nothing
 *   pnpm teach:charter --force    # re-send everything, even if already sent
 *
 * The charter lives in docs/STEWARD-CHARTER.md as blockquoted "## Message N" sections, so
 * the document a judge reads and the text the Mind was actually taught cannot drift apart.
 *
 * It is sent into the SAME long-lived conversation the connector uses (KEEPER_MIND_ALIAS),
 * because that is where the Mind's working memory of this community lives. Stop the
 * connector before running this: both would be polling the same conversation for replies,
 * and each could consume the other's.
 *
 * Progress is recorded in the mirror so an interrupted run resumes instead of re-teaching
 * (each message costs an exchange, and exchanges are 23-65s and metered).
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createMindClient } from '@keeper/minds-client';
import dotenv from 'dotenv';

import { loadConnectorConfig, ConnectorConfigError } from './config.js';
import { Mirror } from './db/mirror.js';
import { log } from './log.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
dotenv.config({ path: join(ROOT, '.env') });

const CHARTER_PATH = join(ROOT, 'docs', 'STEWARD-CHARTER.md');
const SENT_KEY_PREFIX = 'charter_sent_';

export interface CharterMessage {
  readonly index: number;
  readonly title: string;
  readonly body: string;
}

/**
 * Pull the blockquoted body out of each "## Message N — title" section. Anything outside a
 * blockquote is commentary for the human reader and is deliberately not sent.
 */
export function parseCharter(markdown: string): CharterMessage[] {
  const out: CharterMessage[] = [];
  const sections = markdown.split(/^## /m);
  for (const section of sections) {
    const header = /^Message\s+(\d+)\s*[—-]\s*(.+)$/m.exec(section.split('\n')[0] ?? '');
    if (header === null) continue;
    const body = section
      .split('\n')
      .slice(1)
      .filter((line) => line.startsWith('>'))
      .map((line) => line.replace(/^>\s?/, ''))
      .join('\n')
      .trim();
    if (body === '') continue;
    out.push({ index: Number(header[1]), title: (header[2] ?? '').trim(), body });
  }
  return out.sort((a, b) => a.index - b.index);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  const messages = parseCharter(readFileSync(CHARTER_PATH, 'utf8'));
  if (messages.length === 0) {
    process.stderr.write(
      `No "## Message N" blockquote sections found in ${CHARTER_PATH}.\n` +
        'The charter is sent from that file so the document and what the Mind was taught cannot drift.\n',
    );
    process.exit(2);
  }

  if (dryRun) {
    process.stdout.write(`\nCharter: ${messages.length} message(s) from docs/STEWARD-CHARTER.md\n\n`);
    for (const m of messages) {
      process.stdout.write(`--- Message ${m.index} — ${m.title} (${m.body.length} chars)\n`);
      process.stdout.write(`${m.body.slice(0, 300)}${m.body.length > 300 ? '\n…' : ''}\n\n`);
    }
    process.stdout.write('DRY RUN — nothing was sent.\n\n');
    return;
  }

  const config = loadConnectorConfig();
  const mirror = Mirror.open(resolve(ROOT, config.mirrorPath));
  const { transport } = createMindClient();

  process.stdout.write(
    `\nTeaching the charter to alias "${config.mindAlias}".\n` +
      `${messages.length} message(s). Each exchange takes 23-65s — this is not stuck.\n\n`,
  );

  let sent = 0;
  let skipped = 0;
  for (const message of messages) {
    const key = `${SENT_KEY_PREFIX}${message.index}`;
    if (!force && mirror.getSetting(key) !== undefined) {
      process.stdout.write(`  skip  Message ${message.index} — ${message.title} (already taught)\n`);
      skipped += 1;
      continue;
    }
    process.stdout.write(`  send  Message ${message.index} — ${message.title} … `);
    const started = Date.now();
    try {
      const exchange = await transport.sendAndAwaitReply(config.mindAlias, message.body, {
        timeoutMs: config.mindTimeoutMs,
      });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      mirror.setSetting(key, new Date().toISOString(), Date.now());
      sent += 1;
      const reply = (exchange.reply.text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      process.stdout.write(`ack in ${seconds}s\n        ${reply.slice(0, 160)}\n`);
    } catch (error) {
      process.stdout.write('FAILED\n');
      log.error('charter_send_failed', {
        index: message.index,
        detail: error instanceof Error ? error.message : String(error),
      });
      process.stderr.write(
        `\nMessage ${message.index} did not get through. Nothing after it was sent.\n` +
          'Re-run when the platform answers again; messages already taught are skipped.\n\n',
      );
      mirror.close();
      process.exit(1);
    }
  }

  mirror.close();
  process.stdout.write(`\ndone  ${sent} sent, ${skipped} already taught.\n\n`);
  process.stdout.write(
    'Next: verify it took hold before trusting it —\n' +
      '  1. Ask the Mind "who is @lena_learns and what do you remember about her?"\n' +
      '  2. Run the 10-message judgment test at the end of docs/STEWARD-CHARTER.md.\n' +
      '  3. Restart the connector; a routed message should now come back as a fenced\n' +
      '     KEEPER-ACTION block instead of prose (watch for directive_parse_fallback).\n\n',
  );
}

main().catch((error: unknown) => {
  if (error instanceof ConnectorConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
