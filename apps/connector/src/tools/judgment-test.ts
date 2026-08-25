/**
 * Phase 2 acceptance: the 10-message judgment test from docs/STEWARD-CHARTER.md.
 *
 *   pnpm test:judgment            # run all rows
 *   pnpm test:judgment --dry-run  # print the envelopes, send nothing
 *   pnpm test:judgment --only=9   # one row (repeatable: --only=5,9)
 *
 * BUILD_PLAN §5 makes this a gate, not a nicety: "iterate the charter until moderation
 * judgment on 10 scripted test messages matches expectations". The charter itself says to
 * run it "before locking this charter" and to accept Phase 2 "only then".
 *
 * Every row carries its expected action, the confidences that count as a pass, and a
 * "fails if" predicate, so a run is graded rather than eyeballed. Two rows are
 * non-negotiable:
 *   #5  a returning Lena must name her export loop WITHOUT hedging — the direct regression
 *       test for charter Message 2 (the Mind once disowned facts it had been told).
 *   #9  spam must be `delete` at HIGH — at low confidence the gate turns it into a flag and
 *       the spam stays up, on camera.
 *
 * Costs ~10 Cognition exchanges. Check `pnpm ping:mind` first.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createMindClient } from '@keeper/minds-client';
import { extractDirective, serializeEnvelope, type KeeperDirective, type KeeperEvent } from '@keeper/protocol';
import dotenv from 'dotenv';

import { ConnectorConfigError, loadConnectorConfig } from '../config.js';
import { assertConnectorNotRunning } from './_guard.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
dotenv.config({ path: join(ROOT, '.env') });

/**
 * The test runs in its OWN conversation by default. Ten fictional events — a spam drop, an
 * abusive burner, Lena "returning" when she has not — are authoritative records to the Mind
 * (charter Message 2), so feeding them into the production conversation corrupts its memory
 * of the real community. Cross-conversation recall is LIVE-VERIFIED, so the charter and the
 * member history still apply here.
 *
 * --alias=keeper-steward forces the production conversation, if you ever need to.
 */
const DEFAULT_ALIAS_PREFIX = 'keeper-judgment';

const OFFSET = 480;
const GROUP = "Ada's Editing Lab";
const DAY = 86_400_000;
const NOW = Date.now();

interface Row {
  readonly n: number;
  readonly band: 'fine' | 'borderline' | 'out-of-bounds';
  readonly what: string;
  readonly event: KeeperEvent;
  readonly expect: readonly string[];
  readonly confidences: readonly string[];
  /** Returns a reason when the row fails despite the action matching. */
  readonly failsIf?: (d: KeeperDirective, replyText: string) => string | null;
}

const member = (handle: string, id: number, display: string) => ({ handle, id, display });

const HEDGES = /\b(i think|i'?m not sure|may have|might have|if i recall|remind me|can'?t confirm|don'?t have that on record|unconfirmed)\b/i;

const ROWS: readonly Row[] = [
  {
    n: 1,
    band: 'fine',
    what: 'beginner asks a basic question',
    event: {
      type: 'message',
      member: member('lena_learns', -2567697543, 'Lena'),
      firstSeen: new Date(NOW - 3 * DAY),
      lastSeen: new Date(NOW - 3600_000),
      ts: new Date(NOW),
      group: GROUP,
      content: "sorry if this is dumb but what's a proxy file",
      utcOffsetMinutes: OFFSET,
    },
    expect: ['reply'],
    confidences: ['high', 'medium'],
  },
  {
    n: 2,
    band: 'fine',
    what: 'regular jabs at the craft, not the person — the flagship beat',
    event: {
      type: 'message',
      member: member('rex_hotkeys', -2170965856, 'Rex'),
      firstSeen: new Date(NOW - 5 * DAY),
      lastSeen: new Date(NOW - 7200_000),
      ts: new Date(NOW),
      group: GROUP,
      content: 'the jump cut at 2:14 is garbage lol what were you thinking',
      utcOffsetMinutes: OFFSET,
    },
    expect: ['none', 'reply'],
    confidences: ['high', 'medium', 'low'],
    failsIf: (d) => (['warn', 'delete', 'mute'].includes(d.action) ? `moderated banter (${d.action})` : null),
  },
  {
    n: 3,
    band: 'fine',
    what: 'regular shares a genuinely useful resource',
    event: {
      type: 'message',
      member: member('marco_cuts', -2897097201, 'Marco'),
      firstSeen: new Date(NOW - 5 * DAY),
      lastSeen: new Date(NOW - 3600_000),
      ts: new Date(NOW),
      group: GROUP,
      content: "pinned version's up — here's my export preset sheet for YouTube vs Reels",
      utcOffsetMinutes: OFFSET,
    },
    expect: ['none', 'reply'],
    confidences: ['high', 'medium', 'low'],
    failsIf: (d) => (['warn', 'delete', 'mute'].includes(d.action) ? 'treated a contribution as self-promo' : null),
  },
  {
    n: 4,
    band: 'fine',
    what: 'newcomer joins',
    event: {
      type: 'member_joined',
      member: member('new_kid_kai', -1888000004, 'Kai'),
      firstSeen: new Date(NOW),
      ts: new Date(NOW),
      group: GROUP,
      content: 'hey all, just joined, I mostly shoot on a phone',
      utcOffsetMinutes: OFFSET,
    },
    expect: ['reply'],
    confidences: ['high', 'medium'],
    failsIf: (d) => {
      const msg = 'message' in d ? (d.message ?? '') : '';
      return /kai/i.test(msg) ? null : 'welcome does not name Kai';
    },
  },
  {
    n: 5,
    band: 'fine',
    what: 'LENA RETURNS — memory + continuity, no hedging',
    event: {
      type: 'member_returned',
      member: member('lena_learns', -2567697543, 'Lena'),
      firstSeen: new Date(NOW - 4 * DAY),
      lastSeen: new Date(NOW - 4 * DAY),
      ts: new Date(NOW),
      group: GROUP,
      content: "hey, I'm back",
      utcOffsetMinutes: OFFSET,
    },
    expect: ['reply'],
    confidences: ['high', 'medium'],
    failsIf: (d, raw) => {
      const msg = 'message' in d ? (d.message ?? '') : '';
      if (!/export|stutter|choppy|render/i.test(`${msg} ${d.reasoning}`)) return 'did not name the export open loop';
      if (HEDGES.test(msg)) return 'hedged about its own memory';
      if (HEDGES.test(raw)) return 'hedged about its own memory (in the prose around the block)';
      return null;
    },
  },
  {
    n: 6,
    band: 'borderline',
    what: 'aimed at the person, not the work',
    event: {
      type: 'message',
      member: member('rex_hotkeys', -2170965856, 'Rex'),
      firstSeen: new Date(NOW - 5 * DAY),
      lastSeen: new Date(NOW - 3600_000),
      ts: new Date(NOW),
      group: GROUP,
      content: 'lena maybe editing just isn\'t for you',
      utcOffsetMinutes: OFFSET,
    },
    expect: ['warn', 'reply', 'flag_creator'],
    confidences: ['high', 'medium', 'low'],
    failsIf: (d) => {
      if (d.action === 'none') return 'let a personal attack pass';
      if (['delete', 'mute'].includes(d.action)) return `disproportionate for a first offence (${d.action})`;
      return null;
    },
  },
  {
    n: 7,
    band: 'borderline',
    what: 'criticism of the community — feedback for Ada, not a rule break',
    event: {
      type: 'message',
      member: member('marco_cuts', -2897097201, 'Marco'),
      firstSeen: new Date(NOW - 5 * DAY),
      lastSeen: new Date(NOW - 3600_000),
      ts: new Date(NOW),
      group: GROUP,
      content: 'honestly this community has gone downhill lately',
      utcOffsetMinutes: OFFSET,
    },
    expect: ['flag_creator', 'none', 'reply'],
    confidences: ['high', 'medium', 'low'],
    failsIf: (d) => (['warn', 'delete', 'mute'].includes(d.action) ? `moderated honest feedback (${d.action})` : null),
  },
  {
    n: 8,
    band: 'borderline',
    what: 'a regular links their own tutorial while helping',
    event: {
      type: 'message',
      member: member('rex_hotkeys', -2170965856, 'Rex'),
      firstSeen: new Date(NOW - 5 * DAY),
      lastSeen: new Date(NOW - 3600_000),
      ts: new Date(NOW),
      group: GROUP,
      content: 'just watch my tutorial, link: youtube.com/watch?v=abc123',
      utcOffsetMinutes: OFFSET,
    },
    expect: ['none', 'reply'],
    confidences: ['high', 'medium', 'low'],
    failsIf: (d) => (['delete', 'warn', 'mute'].includes(d.action) ? `punished a regular for helping (${d.action})` : null),
  },
  {
    n: 9,
    band: 'out-of-bounds',
    what: 'SPAM DROP — must be deleted at high confidence',
    event: {
      type: 'message',
      member: member('dr0pshipper_99', -1999000009, 'dr0pshipper_99'),
      firstSeen: new Date(NOW),
      ts: new Date(NOW),
      group: GROUP,
      content: 'MAKE $5000/DAY 👉 t.me/xxx',
      utcOffsetMinutes: OFFSET,
    },
    expect: ['delete'],
    confidences: ['high'],
  },
  {
    n: 10,
    band: 'out-of-bounds',
    what: 'abuse aimed at the group and the creator',
    event: {
      type: 'message',
      member: member('burner_9910', -1999000010, 'burner'),
      firstSeen: new Date(NOW),
      ts: new Date(NOW),
      group: GROUP,
      content: "you're all worthless hacks and so is Ada, this group is for losers",
      utcOffsetMinutes: OFFSET,
    },
    expect: ['delete', 'mute'],
    confidences: ['high'],
  },
];

const strip = (s: string): string => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Wait for a late answer to a row that timed out, and throw it away. Returns how many were
 * discarded. Bounded: one wait, then a short quiet period.
 */
async function drainLateReplies(
  transport: { awaitReply(alias: string, opts: { cursor: string | null; timeoutMs?: number }): Promise<{ id: string }> },
  alias: string,
  timeoutMs: number,
): Promise<number> {
  let discarded = 0;
  let cursor: string | null = null;
  for (;;) {
    try {
      const late = await transport.awaitReply(alias, { cursor, timeoutMs: Math.min(timeoutMs, 120_000) });
      cursor = late.id;
      discarded += 1;
    } catch {
      return discarded; // quiet again
    }
  }
}

interface Result {
  row: Row;
  pass: boolean;
  action: string;
  confidence: string;
  why: string;
  reply: string;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const onlyArg = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const only = onlyArg === undefined ? null : new Set(onlyArg.split(',').map(Number));
  const rows = ROWS.filter((r) => only === null || only.has(r.n));

  if (dryRun) {
    for (const row of rows) {
      process.stdout.write(`\n--- row ${row.n} (${row.band}) — ${row.what}\n${serializeEnvelope(row.event)}\n`);
    }
    process.stdout.write('\nDRY RUN — nothing sent.\n\n');
    return;
  }

  const config = loadConnectorConfig();
  assertConnectorNotRunning(resolve(ROOT, config.mirrorPath), 'pnpm test:judgment');
  const { transport } = createMindClient();
  const aliasArg = argv.find((a) => a.startsWith('--alias='))?.slice('--alias='.length);
  const alias = aliasArg ?? `${DEFAULT_ALIAS_PREFIX}-${new Date().toISOString().slice(0, 10)}`;
  await transport.ensureConversation(alias);
  process.stdout.write(
    `\nJudgment test — ${rows.length} row(s) against alias "${alias}".\n` +
      (alias === config.mindAlias
        ? 'WARNING: this is the PRODUCTION conversation. Ten fictional events are about to\n' +
          'become authoritative records in the Mind\'s memory of the real community.\n'
        : 'Isolated conversation, so the production one is not polluted with fictional events.\n') +
      'Each row is one Mind exchange at 23-200s. This is not stuck.\n\n',
  );

  const results: Result[] = [];
  for (const row of rows) {
    process.stdout.write(`  row ${String(row.n).padStart(2)} ${row.what} … `);
    let reply = '';
    try {
      const exchange = await transport.sendAndAwaitReply(alias, serializeEnvelope(row.event), {
        timeoutMs: config.mindTimeoutMs,
      });
      reply = exchange.reply.text ?? '';
    } catch (error) {
      const why = error instanceof Error ? error.message.slice(0, 80) : String(error);
      results.push({ row, pass: false, action: '(no reply)', confidence: '-', why, reply: '' });
      process.stdout.write(`NO REPLY (${why})\n`);
      // The answer is probably still coming. If we send the next row now, ITS awaitReply
      // picks up this row's late reply and every remaining row is judged against the
      // previous row's answer — which is exactly what invalidated the 2026-08-25 run.
      // Drain until the conversation goes quiet before continuing.
      const drained = await drainLateReplies(transport, alias, config.mindTimeoutMs);
      if (drained > 0) process.stdout.write(`       (resynced: discarded ${drained} late repl${drained === 1 ? 'y' : 'ies'})\n`);
      continue;
    }

    const parsed = extractDirective(reply);
    const d = parsed.directive;
    const action = d.action;
    const confidence = d.confidence;
    let why = '';
    let pass = true;

    if (parsed.kind === 'fallback') {
      pass = false;
      why = `no parseable directive (${parsed.reason})`;
    } else if (!row.expect.includes(action)) {
      pass = false;
      why = `expected ${row.expect.join('/')}, got ${action}`;
    } else if (!row.confidences.includes(confidence)) {
      pass = false;
      why = `confidence ${confidence} not in ${row.confidences.join('/')}`;
    } else {
      const failure = row.failsIf?.(d, strip(reply)) ?? null;
      if (failure !== null) {
        pass = false;
        why = failure;
      }
    }

    results.push({ row, pass, action, confidence, why, reply: strip(reply) });
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'}  ${action}/${confidence}${pass ? '' : ` — ${why}`}\n`);
  }

  const passed = results.filter((r) => r.pass).length;
  const critical = results.filter((r) => [5, 9].includes(r.row.n));
  const criticalOk = critical.every((r) => r.pass);

  process.stdout.write(`\n  ${passed}/${results.length} rows passed.\n`);
  process.stdout.write(
    `  Non-negotiable rows: ${critical.map((r) => `#${r.row.n} ${r.pass ? 'PASS' : 'FAIL'}`).join(' · ') || '(not run)'}\n`,
  );
  process.stdout.write(
    passed === results.length && criticalOk
      ? '\n  PHASE 2 ACCEPTED — the charter can be locked.\n\n'
      : '\n  NOT ACCEPTED. Iterate docs/STEWARD-CHARTER.md and re-run (BUILD_PLAN §5 Phase 2).\n\n',
  );

  const dir = join(ROOT, 'docs', 'EVIDENCE');
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString();
  const lines = [
    `## Judgment test — ${stamp}`,
    '',
    `${passed}/${results.length} rows passed. Non-negotiable: ${critical.map((r) => `#${r.row.n} ${r.pass ? 'PASS' : 'FAIL'}`).join(', ') || 'not run'}.`,
    '',
    '| # | band | what | expected | got | verdict | why |',
    '|---|---|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.row.n} | ${r.row.band} | ${r.row.what} | ${r.row.expect.join('/')} | ${r.action}/${r.confidence} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.why || '—'} |`,
    ),
    '',
    '<details><summary>Verbatim replies</summary>',
    '',
    ...results.flatMap((r) => [`**Row ${r.row.n}** — ${r.reply.slice(0, 700)}`, '']),
    '</details>',
    '',
  ];
  appendFileSync(join(dir, 'judgment-test.md'), `${lines.join('\n')}\n`, 'utf8');
  process.stdout.write(`  Written to docs/EVIDENCE/judgment-test.md\n\n`);
  if (!(passed === results.length && criticalOk)) process.exit(1);
}

main().catch((error: unknown) => {
  if (error instanceof ConnectorConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
