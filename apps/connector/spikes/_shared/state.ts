/**
 * Cross-invocation spike state (var/spike-state.json), namespaced per spike.
 * memory-probe teaches now and asks in a fresh process later; proactive-probe
 * arms now and re-checks after a crash. Both need this.
 *
 * Two rules this file exists to keep:
 *   1. WRITES ARE ATOMIC. A reader must never see a half-written file. A torn read is
 *      indistinguishable from corruption, and "corruption" here used to mean the whole
 *      file — including the OTHER spike's arming — got moved aside and lost.
 *   2. READS DO NOT MUTATE. `readSpikeState` is called from help text and from resume
 *      paths; it must never move the operator's state file out from under them.
 * Quarantine of an unreadable file therefore happens only on the write path, where
 * rewriting the file is the point anyway.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { redact, VAR_DIR } from './env.js';
import { safeStringify } from './report.js';

export const STATE_PATH = join(VAR_DIR, 'spike-state.json');

type StateFile = Record<string, unknown>;

interface ReadResult {
  readonly all: StateFile;
  /** The raw text we could not parse, when the file exists but is not usable. */
  readonly unreadable: string | null;
}

function read(): ReadResult {
  let text: string;
  try {
    text = readFileSync(STATE_PATH, 'utf8');
  } catch (error) {
    // Absent is the normal first run and needs no noise. Anything else (EACCES, EISDIR)
    // means state may well EXIST and we simply cannot see it — saying "run teach first"
    // there would send the operator down the wrong road, so say what actually happened.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stdout.write(
        `WARN: ${STATE_PATH} exists but could not be read (${
          error instanceof Error ? error.message : String(error)
        }).\n      Continuing as if there were no saved state; fix the permissions if you\n` +
          '      expected a teach/arm phase to be resumable.\n',
      );
    }
    return { all: {}, unreadable: null };
  }
  if (text.trim() === '') return { all: {}, unreadable: text };
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { all: parsed as StateFile, unreadable: null };
    }
  } catch {
    // fall through
  }
  return { all: {}, unreadable: text };
}

function warnUnreadable(action: string): void {
  process.stdout.write(
    `WARN: ${STATE_PATH} is not a readable state file (not a JSON object). ${action}\n` +
      '      Any earlier teach/arm state in it is gone; re-run the arming phase of the\n' +
      '      spike you were resuming.\n',
  );
}

export function readSpikeState<T>(name: string): T | null {
  const { all, unreadable } = read();
  if (unreadable !== null) {
    warnUnreadable('Treating it as empty (this read does not modify it).');
    return null;
  }
  const value = all[name];
  return value === undefined || value === null ? null : (value as T);
}

export function writeSpikeState(name: string, obj: unknown): string {
  const { all, unreadable } = read();
  if (unreadable !== null) {
    quarantine();
    warnUnreadable('Moved it aside and started fresh.');
  }
  all[name] = obj;
  writeAtomically(all);
  return STATE_PATH;
}

export function clearSpikeState(name: string): void {
  const { all, unreadable } = read();
  if (unreadable !== null) quarantine();
  delete all[name];
  writeAtomically(all);
}

/**
 * Write-then-rename. rename(2) is atomic within a filesystem, so a concurrent reader sees
 * either the whole old file or the whole new one — never a truncated prefix, and never
 * nothing at all if we are interrupted mid-write.
 *
 * Residual, accepted: two processes writing DIFFERENT keys at the same instant can still
 * lose one update (read-modify-write with no lock). The spikes are run one at a time by a
 * human; losing an update is recoverable by re-running that phase, whereas the torn file
 * this replaces destroyed every key at once.
 */
function writeAtomically(all: StateFile): void {
  mkdirSync(VAR_DIR, { recursive: true });
  const tmp = `${STATE_PATH}.tmp-${process.pid}`;
  try {
    // Redacted like every other sink in this harness. State carries the Mind's own words
    // (memory-probe stores each teach acknowledgement), and a Mind that quotes our builder
    // key back at us would otherwise leave it in plaintext on disk. var/ is gitignored, so
    // this is at-rest hygiene rather than a repo leak — but it costs one call.
    writeFileSync(tmp, redact(`${safeStringify(all)}\n`), 'utf8');
    renameSync(tmp, STATE_PATH);
  } catch (error) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // best effort
    }
    throw error;
  }
}

/** Best-effort: another process may have moved the same file microseconds ago (the old
 *  code threw ENOENT here and killed the spike with a raw stack trace). */
function quarantine(): void {
  const backup = `${STATE_PATH}.corrupt-${Date.now()}`;
  try {
    renameSync(STATE_PATH, backup);
    process.stdout.write(`      (previous contents kept at ${backup})\n`);
  } catch {
    // already gone, or not renameable — nothing to preserve
  }
}
