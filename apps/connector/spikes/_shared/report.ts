/**
 * Spike reporting. The whole point of this harness is failure legibility:
 * every failure carries a CODE and a CLASS, and the class is the GO/NO-GO signal.
 *
 *   INFRA        the API contract is broken            -> transport NO-GO input
 *   MIND         API healthy, the agent misbehaved     -> feature/scope decision only
 *   PRECONDITION our harness/setup is not ready        -> fix and re-run (exit 2)
 *
 * The last line printed is always machine-parseable:
 *   SPIKE RESULT: PASS|FAIL <name> code=<CODE> class=<INFRA|MIND|PRECONDITION|NONE> steps=n/m
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { redact, VAR_DIR } from './env.js';

export type FailureClass = 'INFRA' | 'MIND' | 'PRECONDITION';

export const CLASS_TRAILER: Record<FailureClass, string> = {
  INFRA:
    'This is an INFRA failure: the API surface differs from research. ' +
    'Do NOT interpret as Mind misbehavior. It IS an input to the transport GO/NO-GO.',
  MIND:
    'This is a MIND failure: the API itself is healthy (all calls 2xx). ' +
    'It is a feature/scope decision and NEVER blocks the transport GO/NO-GO.',
  PRECONDITION:
    'This is a PRECONDITION failure: our harness/setup, not the platform. ' +
    'It says nothing about whether the Minds API works.',
};

const RAW_TRUNCATE_BYTES = 4096;

const COLOR = Boolean(process.stdout.isTTY) && process.env['NO_COLOR'] === undefined;
const paint = (code: string, text: string): string => (COLOR ? `\u001b[${code}m${text}\u001b[0m` : text);
const bold = (t: string): string => paint('1', t);
const green = (t: string): string => paint('32', t);
const red = (t: string): string => paint('31', t);
const yellow = (t: string): string => paint('33', t);
const dim = (t: string): string => paint('2', t);

export interface SpikeFailureInfo {
  readonly code: string;
  readonly cls: FailureClass;
  readonly message: string;
}

export interface SpikeReporter {
  readonly name: string;
  readonly startedAt: Date;
  /** Declares the total step count so the result line can print steps=n/m. */
  plan(total: number): void;
  step(name: string): void;
  pass(message: string): void;
  fail(code: string, cls: FailureClass, message: string): void;
  info(message: string): void;
  warn(message: string): void;
  /** Prints without a timestamp prefix — used for copy-pasteable blocks. */
  plain(text: string): void;
  raw(label: string, value: unknown): void;
  /** Accumulates markdown evidence for the docs/API-NOTES.md entry. */
  note(markdown: string): void;
  notes(): string;
  warnings(): readonly string[];
  failure(): SpikeFailureInfo | null;
  verdict(): 'PASS' | 'FAIL';
  code(): string;
  classOf(): FailureClass | 'NONE';
  elapsedMs(): number;
  /** Marks the current step as passed without printing (used by runSteps). */
  markStepPassed(): void;
  /** Prints the summary + machine-parseable result line. Returns the exit code. */
  finish(): number;
  finishAndExit(): never;
  crash(error: unknown): never;
}

export function reporter(name: string): SpikeReporter {
  const startedAt = new Date();
  const started = Date.now();
  let plannedSteps = 0;
  let stepsStarted = 0;
  let stepsPassed = 0;
  let currentStepCounted = false;
  let failure: SpikeFailureInfo | null = null;
  let finished = false;
  const noteChunks: string[] = [];
  const warnList: string[] = [];

  const elapsedMs = (): number => Date.now() - started;

  const stamp = (): string => {
    const now = new Date();
    const clock = now.toISOString().slice(11, 19);
    const secs = (elapsedMs() / 1000).toFixed(1).padStart(6, ' ');
    return dim(`[${clock} +${secs}s]`);
  };

  const line = (text: string): void => {
    process.stdout.write(`${stamp()} ${text}\n`);
  };

  const self: SpikeReporter = {
    name,
    startedAt,

    plan(total: number): void {
      plannedSteps = total;
    },

    step(stepName: string): void {
      stepsStarted += 1;
      currentStepCounted = false;
      const total = plannedSteps > 0 ? String(plannedSteps) : '?';
      process.stdout.write('\n');
      line(bold(`STEP ${stepsStarted}/${total} — ${stepName}`));
    },

    markStepPassed(): void {
      if (!currentStepCounted && stepsStarted > 0) {
        currentStepCounted = true;
        stepsPassed += 1;
      }
    },

    pass(message: string): void {
      self.markStepPassed();
      line(`${green('PASS')}: ${redact(message)}`);
    },

    fail(code: string, cls: FailureClass, message: string): void {
      if (failure === null) failure = { code, cls, message };
      line(`${red('FAIL')}: ${redact(message)}`);
      line(`      ${red(`[${cls} / ${code}]`)} ${CLASS_TRAILER[cls]}`);
    },

    info(message: string): void {
      line(`INFO: ${redact(message)}`);
    },

    warn(message: string): void {
      warnList.push(message);
      line(`${yellow('WARN')}: ${redact(message)}`);
    },

    plain(text: string): void {
      process.stdout.write(`${redact(text)}\n`);
    },

    raw(label: string, value: unknown): void {
      const body = redact(safeStringify(value));
      const bytes = Buffer.byteLength(body, 'utf8');
      let path = '(not written)';
      try {
        const dir = join(VAR_DIR, 'spike-raw');
        mkdirSync(dir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        path = join(dir, `${name}-${slug(label)}-${ts}.json`);
        writeFileSync(path, `${body}\n`, 'utf8');
      } catch (error) {
        path = `(write failed: ${(error as Error).message})`;
      }
      line(`RAW  ${bold(label)} — ${bytes} bytes — full copy: ${path}`);
      const shown = bytes > RAW_TRUNCATE_BYTES ? `${body.slice(0, RAW_TRUNCATE_BYTES)}\n… [truncated at ${RAW_TRUNCATE_BYTES} bytes — read the full copy at the path above]` : body;
      process.stdout.write(`${indent(shown)}\n`);
    },

    note(markdown: string): void {
      noteChunks.push(markdown.trim());
    },

    notes(): string {
      return noteChunks.join('\n\n');
    },

    warnings(): readonly string[] {
      return warnList;
    },

    failure(): SpikeFailureInfo | null {
      return failure;
    },

    verdict(): 'PASS' | 'FAIL' {
      return failure === null ? 'PASS' : 'FAIL';
    },

    code(): string {
      return failure === null ? 'OK' : failure.code;
    },

    classOf(): FailureClass | 'NONE' {
      return failure === null ? 'NONE' : failure.cls;
    },

    elapsedMs,

    finish(): number {
      if (finished) return exitCodeFor(failure);
      finished = true;
      const total = plannedSteps > 0 ? plannedSteps : stepsStarted;
      process.stdout.write('\n');
      if (warnList.length > 0) {
        line(`${yellow(`${warnList.length} warning(s)`)} — non-fatal findings, listed in docs/API-NOTES.md`);
      }
      line(`elapsed ${(elapsedMs() / 1000).toFixed(1)}s`);
      // Never colorize this line: it is parsed by humans in a hurry and by scripts.
      process.stdout.write(
        `\nSPIKE RESULT: ${self.verdict()} ${name} code=${self.code()} class=${self.classOf()} steps=${stepsPassed}/${total}\n`,
      );
      return exitCodeFor(failure);
    },

    finishAndExit(): never {
      process.exit(self.finish());
    },

    crash(error: unknown): never {
      const err = error as Error;
      process.stdout.write('\n');
      line(red('HARNESS BUG — the spike itself threw an unexpected error.'));
      line('This is NOT a platform verdict. Fix the harness and re-run.');
      process.stdout.write(`${indent(redact(err?.stack ?? String(error)))}\n`);
      if (failure === null) failure = { code: 'HARNESS_ERROR', cls: 'PRECONDITION', message: String(err?.message ?? error) };
      const total = plannedSteps > 0 ? plannedSteps : stepsStarted;
      process.stdout.write(
        `\nSPIKE RESULT: FAIL ${name} code=HARNESS_ERROR class=PRECONDITION steps=${stepsPassed}/${total}\n`,
      );
      process.exit(2);
    },
  };

  return self;
}

function exitCodeFor(failure: SpikeFailureInfo | null): number {
  if (failure === null) return 0;
  return failure.cls === 'PRECONDITION' ? 2 : 1;
}

export function safeStringify(value: unknown, space = 2): string {
  const seen = new WeakSet<object>();
  const text = JSON.stringify(
    value,
    (_key, val: unknown) => {
      if (val instanceof Error) return { name: val.name, message: val.message };
      if (typeof val === 'bigint') return val.toString();
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      return val;
    },
    space,
  );
  return text ?? String(value);
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((l) => `    ${l}`)
    .join('\n');
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'raw';
}

/**
 * Truncated identifier for anything written into the committed docs/API-NOTES.md.
 * Mind ids are not credentials, but this repo is public and they are still ours.
 */
export function shortId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 8)}…${id.slice(-2)}`;
}

/** Fenced markdown block, for API-NOTES evidence. */
export function fenced(value: unknown, lang = 'json'): string {
  const body = typeof value === 'string' ? value : safeStringify(value);
  return `\`\`\`${lang}\n${redact(body)}\n\`\`\``;
}
