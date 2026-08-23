/**
 * One-line structured logging. Deliberately not a library: the connector runs as a
 * single process on a laptop and on Fly, and `console.log` with a stable prefix is
 * greppable, zero-dependency, and survives being piped into a file during the demo.
 */

type Level = 'info' | 'warn' | 'error';

/** Tests set KEEPER_LOG_SILENT=1: assertions are the output, log lines are noise. */
function silent(): boolean {
  return process.env['KEEPER_LOG_SILENT'] === '1';
}

function emit(level: Level, event: string, fields: Record<string, unknown>): void {
  if (silent()) return;
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${format(v)}`);
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${event}${
    parts.length > 0 ? ` ${parts.join(' ')}` : ''
  }`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function format(value: unknown): string {
  if (typeof value === 'string') return /\s/.test(value) ? JSON.stringify(clip(value)) : clip(value);
  if (value instanceof Error) return JSON.stringify(clip(value.message));
  if (typeof value === 'object' && value !== null) {
    try {
      return clip(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function clip(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export const log = {
  info: (event: string, fields: Record<string, unknown> = {}): void => emit('info', event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}): void => emit('warn', event, fields),
  error: (event: string, fields: Record<string, unknown> = {}): void => emit('error', event, fields),
  /** A banner the operator cannot scroll past. Used for setup problems only. */
  banner: (title: string, lines: string[]): void => {
    if (silent()) return;
    const rule = '='.repeat(72);
    console.error(`\n${rule}\n${title}\n${rule}\n${lines.join('\n')}\n${rule}\n`);
  },
};
