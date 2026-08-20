/**
 * Cross-invocation spike state (var/spike-state.json), namespaced per spike.
 * memory-probe teaches now and asks in a fresh process later; proactive-probe
 * arms now and re-checks after a crash. Both need this.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { VAR_DIR } from './env.js';
import { safeStringify } from './report.js';

export const STATE_PATH = join(VAR_DIR, 'spike-state.json');

type StateFile = Record<string, unknown>;

function readAll(): StateFile {
  if (!existsSync(STATE_PATH)) return {};
  const text = readFileSync(STATE_PATH, 'utf8');
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as StateFile;
    }
  } catch {
    // fall through
  }
  const backup = `${STATE_PATH}.corrupt-${Date.now()}`;
  renameSync(STATE_PATH, backup);
  process.stdout.write(
    `WARN: ${STATE_PATH} was not valid JSON. Moved to ${backup} and started fresh.\n`,
  );
  return {};
}

export function readSpikeState<T>(name: string): T | null {
  const all = readAll();
  const value = all[name];
  return value === undefined || value === null ? null : (value as T);
}

export function writeSpikeState(name: string, obj: unknown): string {
  const all = readAll();
  all[name] = obj;
  mkdirSync(VAR_DIR, { recursive: true });
  writeFileSync(STATE_PATH, `${safeStringify(all)}\n`, 'utf8');
  return STATE_PATH;
}

export function clearSpikeState(name: string): void {
  const all = readAll();
  delete all[name];
  mkdirSync(VAR_DIR, { recursive: true });
  writeFileSync(STATE_PATH, `${safeStringify(all)}\n`, 'utf8');
}
