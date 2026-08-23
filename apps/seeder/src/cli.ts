/**
 * Terminal plumbing shared by `seed:day` and `demo:run`.
 *
 * House rule for this app: a solo builder runs these scripts minutes before recording,
 * often with one hand on a camera. Every failure must print WHAT is wrong and the exact
 * NEXT COMMAND — never a stack trace. `failBlock()` is the only exit path for expected
 * failures; unexpected ones are funnelled through `runMain()`.
 */
import { createInterface } from 'node:readline/promises';

const ESC = '\u001b';
const COLOR = Boolean(process.stdout.isTTY) && process.env['NO_COLOR'] === undefined;
const paint = (code: string, text: string): string =>
  COLOR ? `${ESC}[${code}m${text}${ESC}[0m` : text;

export const bold = (t: string): string => paint('1', t);
export const dim = (t: string): string => paint('2', t);
export const red = (t: string): string => paint('31', t);
export const green = (t: string): string => paint('32', t);
export const yellow = (t: string): string => paint('33', t);
export const cyan = (t: string): string => paint('36', t);

export const isTty = (): boolean => Boolean(process.stdin.isTTY && process.stdout.isTTY);

// --- argv -------------------------------------------------------------------

const argv = (): string[] => process.argv.slice(2);

/** Positional args (everything that is not a --flag and not a --flag's value). */
export function positionals(flagsTakingValues: readonly string[]): string[] {
  const out: string[] = [];
  const args = argv();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg.startsWith('--')) {
      const name = arg.slice(2).split('=')[0] ?? '';
      const hasInlineValue = arg.includes('=');
      if (!hasInlineValue && flagsTakingValues.includes(name)) i += 1; // skip its value
      continue;
    }
    out.push(arg);
  }
  return out;
}

export function argFlag(name: string): boolean {
  return argv().includes(`--${name}`);
}

export function argValue(name: string): string | undefined {
  const args = argv();
  const prefix = `--${name}=`;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === `--${name}`) {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) return next;
    }
  }
  return undefined;
}

/**
 * Refuses to run on an unrecognised flag.
 *
 * This is a safety feature, not pedantry: `--dryrun` (typo) silently falling through to
 * the default mode would post a scripted day into the real demo group. Fail loudly.
 */
export function rejectUnknownFlags(known: readonly string[], usage: string[]): void {
  const unknown = argv()
    .filter((a) => a.startsWith('--'))
    .map((a) => a.slice(2).split('=')[0] ?? '')
    .filter((name) => !known.includes(name));
  if (unknown.length === 0) return;
  failBlock(`Unknown flag: --${unknown[0]}`, [
    `Known flags: ${known.map((f) => `--${f}`).join(' ')}`,
    '',
    ...usage,
  ]);
}

// --- failure ----------------------------------------------------------------

/** An expected, explainable failure. Carries its own fix instructions. */
export class SeederError extends Error {
  readonly title: string;
  readonly hint: string[];

  constructor(title: string, hint: string[] = []) {
    super(title);
    this.name = 'SeederError';
    this.title = title;
    this.hint = hint;
  }
}

export function failBlock(title: string, lines: string[], exitCode = 2): never {
  printBlock(title, lines);
  process.exit(exitCode);
}

export function printBlock(title: string, lines: string[]): void {
  const out = ['', red(`FAILED — ${title}`), '', ...lines.map((l) => (l === '' ? '' : `  ${l}`)), ''];
  process.stdout.write(`${out.join('\n')}\n`);
}

/**
 * Entry-point wrapper. Turns every escape hatch into a readable block:
 * SeederError -> its own hint; Ctrl-C -> a calm "stopped" line; anything else -> a
 * one-line summary plus `--debug` for the stack. No raw stack traces by default.
 */
export function runMain(main: () => Promise<void>): void {
  process.on('SIGINT', () => {
    process.stdout.write(`\n${yellow('stopped')} ${dim('(Ctrl-C) — nothing further was posted.')}\n`);
    process.exit(130);
  });
  main().catch((error: unknown) => {
    if (error instanceof SeederError) {
      printBlock(error.title, error.hint);
      process.exit(1);
    }
    const message = error instanceof Error ? error.message : String(error);
    printBlock('Unexpected error — this is a bug in apps/seeder, not in your setup.', [
      message,
      '',
      'Re-run with --debug to see the stack, then fix apps/seeder (nothing else touches Telegram).',
    ]);
    if (argFlag('debug') && error instanceof Error) process.stdout.write(`${error.stack ?? ''}\n`);
    process.exit(1);
  });
}

// --- timing -----------------------------------------------------------------

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Human-readable duration: 95000 -> "1m35s". */
export function humanMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`;
}

/** Sleeps, redrawing a single countdown line on a TTY (silent when piped). */
export async function countdown(ms: number, label: string): Promise<void> {
  if (ms <= 0) return;
  const until = Date.now() + ms;
  if (!process.stdout.isTTY) {
    process.stdout.write(`${dim(`... waiting ${humanMs(ms)} — ${label}`)}\n`);
    await sleep(ms);
    return;
  }
  const clearLine = `${ESC}[K`;
  for (;;) {
    const left = until - Date.now();
    if (left <= 0) break;
    process.stdout.write(`\r${dim(`   ... ${humanMs(left)} — ${label}`)}${clearLine}`);
    await sleep(Math.min(1000, left));
  }
  process.stdout.write(`\r${clearLine}`);
}

/**
 * Pacing that reads as human. Longer messages wait longer (someone typed them), with
 * jitter so a seeded day does not land on a suspiciously even cadence.
 *
 * We are pacing POSTS, not faking times: every message still lands at the real moment
 * it is sent. See apps/seeder/README.md.
 */
export function naturalDelayMs(text: string, opts: { baseSeconds?: number; fast?: boolean }): number {
  if (opts.fast) return 2000;
  const base = (opts.baseSeconds ?? 40) * 1000 + text.length * 60;
  const capped = Math.min(Math.max(base, 20_000), 150_000);
  const jitter = 0.8 + Math.random() * 0.4; // +/-20%
  return Math.round(capped * jitter);
}

// --- prompts ----------------------------------------------------------------

/** Blocks until the operator presses Enter. Returns immediately when not a TTY. */
export async function pressEnter(prompt: string): Promise<void> {
  if (!isTty()) return;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question(`${cyan('>')} ${prompt} ${dim('(Enter)')} `);
  } finally {
    rl.close();
  }
}

/** Typed confirmation for anything that writes to a real Telegram group. */
export async function confirmWord(prompt: string, word: string): Promise<boolean> {
  if (!isTty()) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${cyan('>')} ${prompt} ${dim(`type "${word}" to continue:`)} `);
    return answer.trim().toLowerCase() === word.toLowerCase();
  } finally {
    rl.close();
  }
}
