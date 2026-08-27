/**
 * Ask the Steward Mind what it remembers about each member, and cache it for the dashboard.
 *
 *   pnpm dashboard:recall              # every member
 *   pnpm dashboard:recall --only=lena_learns,marco_cuts
 *   pnpm dashboard:recall --dry-run    # print the prompt, ask nothing, spend nothing
 *
 * BUILD_PLAN Phase 6 asks the member timeline to show "the Mind's own summary of that member …
 * memory, on screen, in the Mind's voice". That cannot be computed here: the profile lives in
 * the Mind (Iron rule #1), so it has to be asked for.
 *
 * WHY THIS IS CACHED. An exchange takes 25-200s (docs/API-NOTES.md). Calling the Mind during a
 * page load would hang the dashboard, so this writes var/member-recall.json and the API serves
 * that, stamped with when each answer was given. A stale-but-dated quote is honest; a spinner
 * that never resolves is not.
 *
 * WHY A SCRATCH ALIAS. The connector polls `keeper-steward` continuously; two readers on one
 * conversation consume each other's replies. This opens its own conversation instead — safe
 * because memory is NOT conversation-scoped (LIVE-VERIFIED, docs/API-NOTES.md), which is the
 * same property the dashboard panel is there to demonstrate.
 *
 * WARMTH IS THE MIND'S CALL, NOT OURS. The graph colours nodes by warmth. Deriving that from
 * message_count would put a relationship judgment in the connector, which is exactly what
 * Keeper claims not to do. Node *size* is mechanical; node *colour* is the Mind's.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { createMindClient } from '@keeper/minds-client';
import { extractJsonBlock } from '@keeper/protocol';
import dotenv from 'dotenv';

import { ConnectorConfigError, loadConnectorConfig } from '../config.js';
import { Mirror } from '../db/mirror.js';
import { log } from '../log.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
dotenv.config({ path: join(ROOT, '.env') });

const WARMTH = ['warm', 'steady', 'cooling', 'at_risk'] as const;
type Warmth = (typeof WARMTH)[number];

export interface MemberRecall {
  handle: string | null;
  display: string;
  summary: string;
  openLoops: string[];
  warmth: Warmth;
  warmthReason: string;
  capturedAt: string;
  /** The Mind's raw reply, kept so a judge can check the rendering against the source. */
  raw: string;
}

/** HTML in, text out. The platform answers in HTML (LIVE-VERIFIED). */
function strip(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parse the Mind's structured answer.
 *
 * Delegates block-finding to `extractJsonBlock`, which carries everything the directive parser
 * learned about this platform's mangling — collapsed fences, `<pre><code>` instead of backticks,
 * `<br>`/`&nbsp;` inside the payload, and wholesale backslash-escaping. Re-deriving that here is
 * how the two halves drift apart, and a recall answer arrives through the same renderer as a
 * directive: the `<pre><code>` case below was found on a real reply.
 */
export function parseRecall(replyHtml: string): Partial<MemberRecall> | null {
  const parsed = extractJsonBlock(replyHtml);
  if (parsed === null || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const warmth =
    typeof o.warmth === 'string' && (WARMTH as readonly string[]).includes(o.warmth)
      ? (o.warmth as Warmth)
      : 'steady';
  return {
    summary: typeof o.summary === 'string' ? o.summary : '',
    openLoops: Array.isArray(o.openLoops)
      ? o.openLoops.filter((l): l is string => typeof l === 'string')
      : [],
    warmth,
    warmthReason: typeof o.warmthReason === 'string' ? o.warmthReason : '',
  };
}

function promptFor(handle: string | null, display: string, id: number): string {
  return (
    `Dashboard question — no action needed, this is not a community event.\n\n` +
    `Tell me what you remember about ${handle === null ? display : `@${handle}`} (id ${id}), ` +
    `from your own memory of this community.\n\n` +
    `Answer as ONE fenced JSON block and nothing else:\n\n` +
    '```json\n' +
    `{\n` +
    `  "summary": "2-4 sentences, in your own voice, about who they are in this community",\n` +
    `  "openLoops": ["anything of theirs still unresolved — empty array if nothing"],\n` +
    `  "warmth": "warm | steady | cooling | at_risk",\n` +
    `  "warmthReason": "one line: why that rating"\n` +
    `}\n` +
    '```\n\n' +
    `"warmth" is your read on the relationship, not a message count — at_risk means someone ` +
    `you think is drifting away. If you genuinely do not remember them, say so in "summary" ` +
    `rather than inventing something.`
  );
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
  const only = onlyArg === undefined ? null : new Set(onlyArg.split(',').map((h) => h.replace(/^@/, '').toLowerCase()));

  const config = loadConnectorConfig();
  const mirror = Mirror.open(resolve(ROOT, config.mirrorPath));
  const outPath = resolve(ROOT, 'var', 'member-recall.json');

  const members = mirror
    .listMembers()
    .filter((m) => only === null || only.has((m.handle ?? '').toLowerCase()));

  if (members.length === 0) {
    process.stderr.write('No members matched.\n');
    mirror.close();
    process.exit(2);
  }

  if (dryRun) {
    for (const m of members) {
      process.stdout.write(`\n--- ${m.handle ?? m.display} ---\n${promptFor(m.handle, m.display, m.telegramId)}\n`);
    }
    process.stdout.write('\nDRY RUN — nothing was asked, nothing was spent.\n');
    mirror.close();
    return;
  }

  // Merge, never clobber: a failed member keeps the answer from the previous run rather than
  // vanishing off the dashboard.
  let existing: Record<string, MemberRecall> = {};
  try {
    const prior: unknown = JSON.parse(readFileSync(outPath, 'utf8'));
    const priorMembers = (prior as { members?: unknown })?.members;
    if (priorMembers !== null && typeof priorMembers === 'object') {
      existing = priorMembers as Record<string, MemberRecall>;
    }
  } catch {
    /* first run */
  }

  const { transport } = createMindClient();
  const alias = `keeper-recall-${new Date().toISOString().slice(0, 10)}`;
  process.stdout.write(
    `\nAsking the Steward Mind about ${members.length} member(s) on alias "${alias}".\n` +
      `Each exchange takes 25-200s — this is not stuck.\n\n`,
  );

  let ok = 0;
  for (const m of members) {
    const name = m.handle ?? m.display;
    process.stdout.write(`  ${name.padEnd(18)} … `);
    const started = Date.now();
    try {
      const exchange = await transport.sendAndAwaitReply(
        alias,
        promptFor(m.handle, m.display, m.telegramId),
        { timeoutMs: config.mindTimeoutMs },
      );
      const raw = exchange.reply.text ?? '';
      const parsed = parseRecall(raw);
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      if (parsed === null) {
        // Keep the prose. An unparseable answer is still the Mind's memory, and the panel
        // can quote it — better than showing nothing because a fence was malformed.
        existing[String(m.telegramId)] = {
          handle: m.handle,
          display: m.display,
          summary: strip(raw).slice(0, 1200),
          openLoops: [],
          warmth: 'steady',
          warmthReason: 'unstructured reply — summary is the Mind’s prose, verbatim',
          capturedAt: new Date().toISOString(),
          raw,
        };
        process.stdout.write(`${secs}s (prose, unfenced)\n`);
      } else {
        existing[String(m.telegramId)] = {
          handle: m.handle,
          display: m.display,
          summary: parsed.summary ?? '',
          openLoops: parsed.openLoops ?? [],
          warmth: parsed.warmth ?? 'steady',
          warmthReason: parsed.warmthReason ?? '',
          capturedAt: new Date().toISOString(),
          raw,
        };
        process.stdout.write(`${secs}s  ${parsed.warmth}\n`);
      }
      ok += 1;
    } catch (error) {
      process.stdout.write('FAILED\n');
      log.error('recall_failed', {
        member: name,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    `${JSON.stringify({ capturedAt: new Date().toISOString(), alias, members: existing }, null, 2)}\n`,
  );
  mirror.close();
  process.stdout.write(`\ndone  ${ok}/${members.length} answered → var/member-recall.json\n\n`);
}

main().catch((error: unknown) => {
  if (error instanceof ConnectorConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
