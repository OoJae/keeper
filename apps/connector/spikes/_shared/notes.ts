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
  ensureFile();

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
      parts.push(`- \`${key}\`: ${value === null ? '_(none)_' : `\`${String(value)}\``}`);
    }
  }
  parts.push('');
  parts.push(markdown.trim());
  parts.push('');

  appendFileSync(API_NOTES_PATH, redact(parts.join('\n')), 'utf8');
  return API_NOTES_PATH;
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
