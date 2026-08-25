/**
 * One connector per mirror.
 *
 * Two connectors against the same bot token is not a theoretical problem: it happened on
 * 2026-08-25, both ingested the same seeded line, and Keeper answered the same question
 * twice in the group. Telegram also refuses the second long-poller with a 409, so the
 * symptom is a confusing mix of duplicate work and update loss.
 *
 * The unique index on `events` now makes a duplicate reply impossible even if this guard
 * is bypassed — this exists so the operator finds out immediately, by name, instead of
 * debugging it on a recording day.
 *
 * A stale lock (previous process killed) is reclaimed automatically: a pid that is no
 * longer running cannot own anything.
 */
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';

export class AlreadyRunningError extends Error {
  constructor(readonly pid: number, readonly lockPath: string) {
    super(
      `Another Keeper connector (pid ${pid}) is already running.\n` +
        `Two connectors share one bot token and one Mind conversation: both ingest every\n` +
        `message, so the group gets two of every reply, and Telegram 409s one poller.\n\n` +
        `  Stop it:   kill ${pid}\n` +
        `  Lock file: ${lockPath}\n` +
        `  If you are certain that pid is gone, delete the lock file and start again.`,
    );
    this.name = 'AlreadyRunningError';
  }
}

function isRunning(pid: number): boolean {
  try {
    // Signal 0 checks for existence without touching the process.
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to someone else — still running.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Throws AlreadyRunningError if a live connector holds the lock. Returns a release fn. */
export function acquireSingleInstanceLock(lockPath: string): () => void {
  let existing: number | null = null;
  try {
    existing = Number(readFileSync(lockPath, 'utf8').trim());
  } catch {
    existing = null;
  }

  if (existing !== null && Number.isInteger(existing) && existing !== process.pid && isRunning(existing)) {
    throw new AlreadyRunningError(existing, lockPath);
  }

  writeFileSync(lockPath, String(process.pid), 'utf8');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      // Only remove it if it is still ours; a reclaimed lock belongs to someone else now.
      if (Number(readFileSync(lockPath, 'utf8').trim()) === process.pid) unlinkSync(lockPath);
    } catch {
      // Nothing to release.
    }
  };
}
