/**
 * Phase 2 verification: does the Mind actually remember this community's members, and
 * does it now answer an event with a parseable KEEPER-ACTION block?
 *
 *   pnpm probe:memory
 *
 * This asks a question, not a directive-bearing event, so the recall answer is prose by
 * design; only the second half feeds a real envelope and checks the directive.
 */
import { join, resolve } from 'node:path';

import { createMindClient } from '@keeper/minds-client';
import { extractDirective, serializeEnvelope } from '@keeper/protocol';
import dotenv from 'dotenv';

import { assertConnectorNotRunning } from './_guard.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
dotenv.config({ path: join(ROOT, '.env') });

const alias = process.env['KEEPER_MIND_ALIAS'] ?? 'keeper-steward';
assertConnectorNotRunning(join(ROOT, 'var', 'keeper.db'), 'pnpm probe:memory');

const { transport } = createMindClient();
const strip = (s: string): string => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

process.stdout.write('\n1. RECALL — who is @lena_learns?\n');
const recall = await transport.sendAndAwaitReply(
  alias,
  'Without me telling you anything new: who is @lena_learns, and what open loop is she carrying?',
  { timeoutMs: 300_000 },
);
const recallText = strip(recall.reply.text ?? '');
process.stdout.write(`${recallText.slice(0, 700)}\n`);
const remembersLena = /lena/i.test(recallText);
const remembersLoop = /export|choppy|stutter|h264|1080/i.test(recallText);
process.stdout.write(
  `\n   knows Lena: ${remembersLena ? 'YES' : 'NO'} · recalls her export thread: ${remembersLoop ? 'YES' : 'NO'}\n`,
);

process.stdout.write('\n2. DIRECTIVE — a real envelope, spam from a stranger\n');
const envelope = serializeEnvelope({
  type: 'message',
  member: { handle: 'dr0pshipper_99', id: -1999000001, display: 'dr0pshipper_99' },
  firstSeen: new Date(),
  ts: new Date(),
  group: "Ada's Editing Lab",
  content: 'FREE PREMIERE PRESETS!!! dm me or click bit.ly/not-a-scam 🔥🔥 limited time',
  utcOffsetMinutes: 480,
});
const directiveReply = await transport.sendAndAwaitReply(alias, envelope, { timeoutMs: 300_000 });
const parsed = extractDirective(directiveReply.reply.text ?? '');
process.stdout.write(`   parse: ${parsed.kind}\n`);
process.stdout.write(`   action: ${parsed.directive.action} · confidence: ${parsed.directive.confidence}\n`);
if (parsed.kind === 'ok') {
  process.stdout.write(`   gated: ${parsed.gated} · warnings: ${JSON.stringify(parsed.warnings)}\n`);
  process.stdout.write(`   reasoning: ${parsed.directive.reasoning}\n`);
} else {
  process.stdout.write(`   reason: ${parsed.reason}\n   reply: ${strip(directiveReply.reply.text ?? '').slice(0, 400)}\n`);
}
process.stdout.write('\n');
