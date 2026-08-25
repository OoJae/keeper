/**
 * Is the Steward Mind answering? One short exchange, used to tell "out of Cognition"
 * apart from "platform down" — the two look identical from the connector's side.
 *
 *   pnpm ping:mind
 */
import { join, resolve } from 'node:path';

import { createMindClient } from '@keeper/minds-client';
import dotenv from 'dotenv';

import { assertConnectorNotRunning } from './_guard.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
dotenv.config({ path: join(ROOT, '.env') });

const alias = process.env['KEEPER_MIND_ALIAS'] ?? 'keeper-steward';
const nonce = Math.random().toString(36).slice(2, 8).toUpperCase();
assertConnectorNotRunning(join(ROOT, 'var', 'keeper.db'), 'pnpm ping:mind');

const { transport } = createMindClient();
const started = Date.now();

try {
  const exchange = await transport.sendAndAwaitReply(alias, `Reply with exactly: ALIVE ${nonce}`, {
    timeoutMs: 120_000,
  });
  const text = (exchange.reply.text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(`REPLIED in ${seconds}s: ${text.slice(0, 160)}\n`);
  process.stdout.write(
    text.includes(nonce)
      ? 'COGNITION OK — the Mind is answering. Run: pnpm teach:charter\n'
      : 'The Mind answered but not with the nonce; it is alive, just chatty.\n',
  );
} catch (error) {
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(
    `NO REPLY in ${seconds}s — ${error instanceof Error ? error.message.slice(0, 160) : String(error)}\n`,
  );
  process.stdout.write(
    'Either the top-up has not posted yet, or cognition is still exhausted.\n' +
      'Check the balance: GET /v1/minds/{mindId}/credits (see docs/API-NOTES.md).\n',
  );
  process.exit(1);
}
