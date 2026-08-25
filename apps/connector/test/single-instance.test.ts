import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AlreadyRunningError, acquireSingleInstanceLock } from '../src/single-instance.js';

const lockIn = (): string => join(mkdtempSync(join(tmpdir(), 'keeper-lock-')), 'keeper.db.lock');

describe('single instance lock', () => {
  it('writes our pid and releases it', () => {
    const path = lockIn();
    const release = acquireSingleInstanceLock(path);
    expect(Number(readFileSync(path, 'utf8'))).toBe(process.pid);
    release();
    expect(() => readFileSync(path, 'utf8')).toThrow();
  });

  it('refuses when a live process holds the lock', () => {
    const path = lockIn();
    // Our own parent is definitely alive and is not us.
    writeFileSync(path, String(process.ppid), 'utf8');
    expect(() => acquireSingleInstanceLock(path)).toThrow(AlreadyRunningError);
  });

  it('reclaims a stale lock left by a dead process', () => {
    const path = lockIn();
    // Very high pid that is not running; a killed connector leaves exactly this behind.
    writeFileSync(path, '4194303', 'utf8');
    const release = acquireSingleInstanceLock(path);
    expect(Number(readFileSync(path, 'utf8'))).toBe(process.pid);
    release();
  });

  it('reclaims a corrupt lock rather than refusing to start', () => {
    const path = lockIn();
    writeFileSync(path, 'not-a-pid', 'utf8');
    const release = acquireSingleInstanceLock(path);
    expect(Number(readFileSync(path, 'utf8'))).toBe(process.pid);
    release();
  });

  it('does not delete a lock that was reclaimed by someone else', () => {
    const path = lockIn();
    const release = acquireSingleInstanceLock(path);
    writeFileSync(path, '999999', 'utf8'); // another process took over
    release();
    expect(readFileSync(path, 'utf8')).toBe('999999');
  });
});
