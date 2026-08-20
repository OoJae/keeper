/**
 * Spike environment loading, CLI-arg reading, and secret redaction.
 *
 * This module deliberately has NO runtime imports from the other _shared modules,
 * so it can never participate in an import cycle (report/notes/state all import it).
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

import type { SpikeReporter } from './report.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Walk up from this file until we find the workspace root marker. */
function findRepoRoot(): string {
  let dir = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: apps/connector/spikes/_shared -> repo root is four levels up.
  return resolve(HERE, '..', '..', '..', '..');
}

export const REPO_ROOT = findRepoRoot();
export const ENV_PATH = join(REPO_ROOT, '.env');
export const ENV_EXAMPLE_PATH = join(REPO_ROOT, '.env.example');
export const VAR_DIR = join(REPO_ROOT, 'var');

// --- secrets ---------------------------------------------------------------

/** value -> what to print instead. */
const REDACTIONS = new Map<string, string>();

/** Any value registered here is scrubbed from printed output and from API-NOTES. */
export function registerSecret(value: string | undefined | null): void {
  register(value, 6, () => '***REDACTED***');
}

/**
 * Mind ids are not credentials, but docs/API-NOTES.md is committed to a PUBLIC repo and
 * this harness's own convention there is the truncated form (report.ts `shortId`). Our own
 * writes already use it — but a Mind's verbatim reply does not, and a Mind states its own
 * id readily ("your builder key is … and mind <full id>"), so the full id walks straight
 * into the committed file. Mask it to the SAME truncated form so the doc stays readable
 * and consistent instead of sprouting ***REDACTED*** in the middle of evidence.
 */
export function registerIdentifier(value: string | undefined | null): void {
  register(value, 12, (v) => `${v.slice(0, 8)}\u2026${v.slice(-2)}`);
}

function register(value: string | undefined | null, minLength: number, mask: (v: string) => string): void {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  if (trimmed.length < minLength) return;
  REDACTIONS.set(trimmed, mask(trimmed));
}

export function redact(text: string): string {
  let out = text;
  for (const [value, mask] of REDACTIONS) out = out.split(value).join(mask);
  return out;
}

// --- CLI args --------------------------------------------------------------

/**
 * Reads `--name=value` or `--name value` from argv, falling back to the
 * SPIKE_<NAME> env var. The env fallback exists because `pnpm spike:x -- --flag`
 * has to survive two levels of pnpm script forwarding.
 */
export function argValue(name: string): string | undefined {
  const argv = process.argv.slice(2);
  const prefix = `--${name}=`;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === `--${name}`) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) return next;
    }
  }
  const fromEnv = process.env[`SPIKE_${name.toUpperCase().replace(/-/g, '_')}`];
  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv;
}

export function argFlag(name: string): boolean {
  if (process.argv.slice(2).includes(`--${name}`)) return true;
  const fromEnv = process.env[`SPIKE_${name.toUpperCase().replace(/-/g, '_')}`];
  return fromEnv === '1' || fromEnv === 'true';
}

// --- env -------------------------------------------------------------------

interface EnvGuidance {
  readonly line: string;
  readonly where: string;
}

const GUIDANCE: Record<string, EnvGuidance> = {
  MINDS_BUILDER_API_KEY: {
    line: 'MINDS_BUILDER_API_KEY=<paste the key here>',
    where:
      'Builder console -> https://build.hellominds.ai/console -> create an API key ' +
      '(name + expiry). The token is shown ONCE — copy it the moment it appears.',
  },
  MINDS_MIND_ID: {
    line: 'MINDS_MIND_ID=<steward mind id>',
    where:
      'The Minds app (https://hellominds.ai) -> open your Steward Mind -> copy its id ' +
      '(also returned by GET /v1/humans/{humanId}/minds).',
  },
  MINDS_REWARDS_MIND_ID: {
    line: 'MINDS_REWARDS_MIND_ID=<rewards mind id>',
    where:
      'The Minds app -> your second (Rewards) Mind -> copy its id. If you have not made ' +
      'one yet, create it: the first 3 Minds each get free Cognition.',
  },
  MINDS_API_BASE_URL: {
    line: 'MINDS_API_BASE_URL=https://api.build.hellominds.ai',
    where: 'Optional override. Leave blank unless the platform tells you otherwise.',
  },
  MINDS_AUTH_HEADER: {
    line: 'MINDS_AUTH_HEADER=x-api-key',
    where:
      'x-api-key (canonical) | x-access-key (deprecated) | auto (retry the legacy header ' +
      'on 401/403). Run `pnpm spike:api-smoke` — it tells you which one the platform honors.',
  },
  TELEGRAM_BOT_TOKEN: {
    line: 'TELEGRAM_BOT_TOKEN=<token from @BotFather>',
    where: 'Telegram -> @BotFather -> /newbot (or /token for an existing bot).',
  },
};

export interface SpikeEnv {
  /** Throws only if called with a name that was not in `required`. */
  get(name: string): string;
  optional(name: string): string | undefined;
  readonly baseUrl: string;
  readonly authHeaderPreference: string;
}

const NON_EMPTY = z.string().trim().min(1);

/** The only three values @keeper/minds-client's config schema accepts, lowercase. */
const AUTH_HEADER_VALUES = ['x-api-key', 'x-access-key', 'auto'] as const;

/**
 * Loads .env from the repo root and validates the vars this spike needs.
 * On failure it prints the exact fix for every missing var and exits 2.
 */
export function loadSpikeEnv(required: string[], r?: SpikeReporter): SpikeEnv {
  const envFileExists = existsSync(ENV_PATH);
  const loaded = envFileExists ? dotenv.config({ path: ENV_PATH }) : undefined;

  // Register redactions BEFORE anything can be printed. Everything key-shaped that our own
  // .env declares is scrubbed, not just the vars this particular spike happens to require:
  // a Mind can quote back anything we ever put on the wire, and API-NOTES is committed.
  for (const [name, value] of Object.entries(loaded?.parsed ?? {})) {
    if (/KEY|TOKEN|SECRET|PASSWORD/i.test(name)) registerSecret(value);
  }
  registerSecret(process.env['MINDS_BUILDER_API_KEY']);
  registerSecret(process.env['MINDS_ACCESS_KEY']);
  registerIdentifier(process.env['MINDS_MIND_ID']);
  registerIdentifier(process.env['MINDS_REWARDS_MIND_ID']);

  const shape: Record<string, typeof NON_EMPTY> = {};
  for (const name of required) shape[name] = NON_EMPTY;
  const parsed = z.object(shape).safeParse(
    Object.fromEntries(required.map((name) => [name, process.env[name]])),
  );

  if (!parsed.success) {
    const missing = required.filter((name) => {
      const value = process.env[name];
      return value === undefined || value.trim() === '';
    });
    printEnvFailure(missing.length > 0 ? missing : required, envFileExists);
    if (r) {
      r.fail(
        'MISSING_ENV',
        'PRECONDITION',
        `missing required environment variables: ${(missing.length > 0 ? missing : required).join(', ')}`,
      );
      r.finishAndExit();
    }
    process.exit(2);
  }

  for (const name of required) {
    if (/KEY|TOKEN|SECRET/.test(name)) registerSecret(process.env[name]);
  }

  // The adapter reads MINDS_AUTH_HEADER straight out of process.env and rejects anything
  // that is not one of three LOWERCASE literals — including "X-Api-Key", which is exactly
  // how the header is spelled in .env.example's comments and in docs/API-NOTES.md. Left
  // alone, that typo surfaces as a MindsConfigError thrown from createMindClient(), which
  // the spikes print under a "HARNESS BUG — fix the harness" banner. It is not a harness
  // bug and it is not a platform verdict: it is one line of .env. Normalise it here, and
  // reject an unusable value with the exact fix instead of a stack trace.
  const rawAuthHeader = (process.env['MINDS_AUTH_HEADER'] ?? '').trim();
  const authHeaderPreference = rawAuthHeader === '' ? 'x-api-key' : rawAuthHeader.toLowerCase();
  if (!(AUTH_HEADER_VALUES as readonly string[]).includes(authHeaderPreference)) {
    printBadAuthHeader(rawAuthHeader);
    if (r) {
      r.fail(
        'BAD_ENV',
        'PRECONDITION',
        `MINDS_AUTH_HEADER="${rawAuthHeader}" is not one of ${AUTH_HEADER_VALUES.join(' | ')}.`,
      );
      r.finishAndExit();
    }
    process.exit(2);
  }
  // Hand the adapter the normalised value so its own schema agrees with ours.
  process.env['MINDS_AUTH_HEADER'] = authHeaderPreference;

  const values = parsed.data;
  return {
    get(name: string): string {
      const value = values[name];
      if (typeof value !== 'string') {
        throw new Error(
          `spike bug: env "${name}" was read but not declared in loadSpikeEnv([...]).`,
        );
      }
      return value;
    },
    optional(name: string): string | undefined {
      const value = process.env[name];
      return value === undefined || value.trim() === '' ? undefined : value.trim();
    },
    baseUrl: (process.env['MINDS_API_BASE_URL'] ?? '').trim() || 'https://api.build.hellominds.ai',
    authHeaderPreference,
  };
}

function printBadAuthHeader(value: string): void {
  process.stdout.write(
    [
      '',
      'PRECONDITION FAILURE — MINDS_AUTH_HEADER is not a value we understand.',
      '',
      `  you wrote:  MINDS_AUTH_HEADER=${value}`,
      `  edit ${ENV_PATH} to one of (lowercase, exactly):`,
      '',
      '      MINDS_AUTH_HEADER=x-api-key      # canonical; what you want unless a spike says otherwise',
      '      MINDS_AUTH_HEADER=x-access-key   # deprecated, but some deployments still require it',
      '      MINDS_AUTH_HEADER=auto           # try x-api-key, fall back to x-access-key on 401/403',
      '',
      '  (Case matters here even though HTTP header names are case-insensitive: this is the',
      '   name of a MODE in our config, not the header itself. "X-Api-Key" is not accepted.)',
      '',
      'This is a PRECONDITION failure: our harness/setup, not the platform.',
      'It says NOTHING about whether the Minds API works. Fix the above and re-run.',
      '',
    ].join('\n') + '\n',
  );
}

function printEnvFailure(missing: string[], envFileExists: boolean): void {
  const lines: string[] = [];
  lines.push('');
  lines.push('PRECONDITION FAILURE — this spike cannot start: required configuration is missing.');
  lines.push('');
  lines.push(
    envFileExists
      ? `  .env found at: ${ENV_PATH}`
      : `  .env NOT FOUND at: ${ENV_PATH}\n  Fix first:  cp ${ENV_EXAMPLE_PATH} ${ENV_PATH}`,
  );
  lines.push('');
  lines.push(`Missing ${missing.length} variable${missing.length === 1 ? '' : 's'}:`);
  missing.forEach((name, index) => {
    const guidance = GUIDANCE[name];
    lines.push('');
    lines.push(`  ${index + 1}. ${name}`);
    lines.push(`     add this line to ${ENV_PATH}:`);
    lines.push(`         ${guidance ? guidance.line : `${name}=<value>`}`);
    lines.push(`     where to get it: ${guidance ? guidance.where : 'see docs/BUILD_PLAN.md §5 Phase 0.'}`);
  });
  lines.push('');
  lines.push('This is a PRECONDITION failure: our harness/setup, not the platform.');
  lines.push('It says NOTHING about whether the Minds API works. Fix the above and re-run.');
  lines.push('');
  process.stdout.write(`${lines.join('\n')}\n`);
}
