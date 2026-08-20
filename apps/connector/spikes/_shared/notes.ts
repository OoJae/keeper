/**
 * Appends spike verdicts + raw evidence to docs/API-NOTES.md.
 *
 * APPEND-ONLY. This function never rewrites, reorders, or deletes existing content —
 * the day-1 GO/NO-GO meeting reads exactly one file, and that file must be trustworthy.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { redact, REPO_ROOT } from './env.js';
import type { FailureClass } from './report.js';

export const API_NOTES_PATH = join(REPO_ROOT, 'docs', 'API-NOTES.md');

const LIVE_SECTION_HEADING = '## Live spike results';

const FILE_HEADER = [
  '# Minds API — Verified Behavior',
  '',
  '**This file outranks assumptions, the build plan, and the model\'s memory.** Spike',
  'scripts append their results here automatically; hand-written sections are marked.',
  '',
  '---',
  '',
  LIVE_SECTION_HEADING,
  '',
  '<!-- Spike scripts append below this line. Do not edit their entries by hand. -->',
  '',
].join('\n');

export interface NotesMeta {
  readonly spike: string;
  readonly verdict: 'PASS' | 'FAIL';
  readonly code: string;
  readonly cls?: FailureClass | 'NONE';
  readonly durationMs?: number;
  /** Extra key/value context printed as a bullet list (base url, alias, mind id, …). */
  readonly context?: Record<string, string | number | boolean | null | undefined>;
}

/** Returns the path written to, so the spike can print it. */
export function appendToApiNotes(markdown: string, meta: NotesMeta): string {
  try {
    ensureFile();
  } catch (error) {
    return writeFailed(error);
  }

  const stamp = new Date().toISOString();
  const parts: string[] = [];
  parts.push('');
  parts.push('');
  parts.push(`## ${meta.spike} — ${stamp} — ${meta.verdict} ${meta.code}`);
  parts.push('');
  parts.push(
    `**Result:** \`${meta.verdict}\` · code \`${meta.code}\` · class \`${meta.cls ?? 'NONE'}\`` +
      (meta.durationMs === undefined ? '' : ` · ran ${(meta.durationMs / 1000).toFixed(1)}s`) +
      ` · ${confidence(meta)} (produced by \`pnpm spike:${scriptName(meta.spike)}\`).`,
  );
  if (meta.context && Object.keys(meta.context).length > 0) {
    parts.push('');
    for (const [key, value] of Object.entries(meta.context)) {
      if (value === undefined) continue;
      // Context values come from the platform (a walletAddress, an alias). A newline in one
      // ends the bullet AND the inline code span, so the rest of a hostile value lands in the
      // committed document as ordinary prose. Every legitimate value here is a single short
      // token, so collapsing is lossless for them and disarming for the rest.
      parts.push(`- \`${key}\`: ${value === null ? '_(none)_' : `\`${inlineSafe(String(value))}\``}`);
    }
  }
  parts.push('');
  parts.push(neutralizeForgery(markdown.trim()));
  parts.push('');

  try {
    appendFileSync(API_NOTES_PATH, redact(parts.join('\n')), 'utf8');
  } catch (error) {
    return writeFailed(error);
  }
  return API_NOTES_PATH;
}

/** One line, bounded, and no backtick that could close the inline code span around it. */
function inlineSafe(value: string, max = 200): string {
  const flat = value.replace(/\s+/g, ' ').replace(/`/g, "'").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}… [+${flat.length - max} chars]`;
}

/**
 * Writing the evidence file is the LAST thing a spike does, after the verdict is decided.
 * Letting an EACCES / ENOSPC here escape turns a finished run into `HARNESS_ERROR /
 * PRECONDITION` and the real result — a transport GO or NO-GO — is never printed at all.
 * A file-permission problem must never masquerade as a platform verdict, so: shout, and
 * let the caller finish and print its own SPIKE RESULT line.
 */
function writeFailed(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    `\nWARN: could NOT write ${API_NOTES_PATH} — ${reason}\n` +
      '      The verdict below still stands; only the written evidence is missing.\n' +
      '      Fix the file permissions / disk and re-run to record it.\n\n',
  );
  return `NOT WRITTEN (${reason})`;
}

/**
 * Model-controlled text lands in this file verbatim — a Mind's own reply IS the evidence —
 * and this file is what a human reads to make the day-1 GO/NO-GO call. Two ways that breaks:
 *
 *   1. a reply containing ``` closes report.ts's `fenced()` wrapper early, after which the
 *      rest of the reply renders as DOCUMENT BODY. A Mind can then forge an entry that is
 *      indistinguishable from a real one — "## api-smoke — <ts> — PASS OK / **LIVE-VERIFIED**
 *      / **Transport decision:** **GO**" — inside somebody else's failing spike report.
 *   2. an odd number of fences leaves one OPEN at end of file, and the next spike's entry is
 *      swallowed into that code block. A genuine NO-GO then stops rendering as a section.
 *
 * So: walk the entry with the CommonMark fence rule, escape any ATX heading that would land
 * in body context, and close a fence the content left open. Text INSIDE a fence is left
 * byte-for-byte alone — it is evidence, and a `#` there is usually a shell comment.
 */
export function neutralizeForgery(entry: string): string {
  const out: string[] = [];
  let open: string | null = null;
  let lastWasText = false;
  for (const line of entry.split('\n')) {
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open === null) {
      // A backtick fence's info string may not contain a backtick (CommonMark 4.5).
      if (fence && !(fence[1]!.startsWith('`') && fence[2]!.includes('`'))) {
        open = fence[1]!;
        out.push(line);
        lastWasText = false;
        continue;
      }
      // `\## x` renders as the literal text "## x", not as a section heading. A setext
      // underline (a bare ===/--- directly under a line of text) forges the same H1/H2, so
      // escape that too. A table's delimiter row starts with `|` and is left alone, and no
      // spike emits a heading or a rule in its own notes — nothing legitimate changes.
      const forgesHeading =
        /^#{1,6}(\s|$)/.test(line) || (lastWasText && /^ {0,3}(=+|-+)\s*$/.test(line));
      out.push(forgesHeading ? `\\${line}` : line);
      lastWasText = line.trim() !== '';
      continue;
    }
    if (
      fence &&
      fence[1]!.startsWith(open[0]!) &&
      fence[1]!.length >= open.length &&
      fence[2]!.trim() === ''
    ) {
      open = null;
    }
    out.push(line);
    lastWasText = false;
  }
  if (open !== null) out.push(open);
  return out.join('\n');
}

function ensureFile(): void {
  if (!existsSync(API_NOTES_PATH)) {
    mkdirSync(dirname(API_NOTES_PATH), { recursive: true });
    writeFileSync(API_NOTES_PATH, FILE_HEADER, 'utf8');
    return;
  }
  const current = readFileSync(API_NOTES_PATH, 'utf8');
  if (!current.includes(LIVE_SECTION_HEADING)) {
    // Append the section rather than rewriting anything above it.
    appendFileSync(API_NOTES_PATH, `\n\n---\n\n${LIVE_SECTION_HEADING}\n`, 'utf8');
  }
}

/**
 * This file defines LIVE-VERIFIED as "a spike did this and it worked". A failed run must
 * therefore never claim it — it is evidence of a failure, not of a working call.
 */
function confidence(meta: NotesMeta): string {
  if (meta.verdict === 'PASS') return '**LIVE-VERIFIED**';
  if (meta.cls === 'PRECONDITION') return '**NOT RUN** — precondition failure, no platform verdict';
  return '**LIVE-OBSERVED FAILURE**';
}

function scriptName(spike: string): string {
  if (spike === 'api-smoke') return 'api-smoke';
  return spike.replace(/-probe$/, '');
}
