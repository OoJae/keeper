import { z } from 'zod';
import { MindsConfigError } from './errors.js';
import { CallLog, withCallLog } from './logging/call-log.js';
import { MessagingApiTransport } from './transports/messaging-api.js';
import { TelegramRelayTransport } from './transports/telegram-relay.js';
import type { MindTransport, TransportKind } from './types.js';

export const DEFAULT_BASE_URL = 'https://api.build.hellominds.ai';

export interface MindClientConfig {
  builderApiKey: string;
  mindId: string;
  baseUrl: string;
  authHeader: 'x-api-key' | 'x-access-key' | 'auto';
  statePath: string;
  logPath: string;
  creditSampling: boolean;
  transport: TransportKind;
  requestTimeoutMs: number;
}

/**
 * Every message states the exact edit to make. A config error at 2am on day 7 should
 * cost zero thinking: read line, paste line, rerun.
 */
const FIXES: Record<string, string> = {
  builderApiKey:
    'MINDS_BUILDER_API_KEY is missing. Mint a Builder API key at https://build.hellominds.ai/console ' +
    '(the token is shown ONCE) and add to .env:  MINDS_BUILDER_API_KEY=<key>',
  mindId:
    'MINDS_MIND_ID is missing. Copy the Steward Mind id from https://build.hellominds.ai/console ' +
    'and add to .env:  MINDS_MIND_ID=<mindId>',
  baseUrl: `MINDS_API_BASE_URL must be an absolute URL. Leave it blank to use the default:  MINDS_API_BASE_URL=${DEFAULT_BASE_URL}`,
  authHeader:
    'MINDS_AUTH_HEADER must be one of x-api-key | x-access-key | auto. Use:  MINDS_AUTH_HEADER=x-api-key ' +
    '(canonical; "auto" retries the deprecated X-Access-Key once on 401/403)',
  statePath: 'MINDS_STATE_PATH must be a non-empty path. Use:  MINDS_STATE_PATH=var/minds-state.json',
  logPath: 'MINDS_LOG_PATH must be a non-empty path. Use:  MINDS_LOG_PATH=var/minds-calls.jsonl',
  creditSampling:
    'MINDS_CREDIT_SAMPLING must be true or false. Use:  MINDS_CREDIT_SAMPLING=true (samples credits ' +
    'around each exchange to estimate cost)',
  transport:
    'MINDS_TRANSPORT must be messaging-api or telegram-relay. Use:  MINDS_TRANSPORT=messaging-api ' +
    '(telegram-relay is a typed stub — see src/transports/telegram-relay.ts)',
  requestTimeoutMs:
    'MINDS_REQUEST_TIMEOUT_MS must be a positive integer number of milliseconds. Use:  MINDS_REQUEST_TIMEOUT_MS=30000',
};

const booleanish = z.preprocess((value) => {
  if (typeof value === 'boolean' || value === undefined) return value;
  const s = String(value).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true;
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false;
  return value;
}, z.boolean());

const ConfigSchema = z.object({
  builderApiKey: z.string().min(1),
  mindId: z.string().min(1),
  baseUrl: z.string().url().default(DEFAULT_BASE_URL),
  authHeader: z.enum(['x-api-key', 'x-access-key', 'auto']).default('x-api-key'),
  statePath: z.string().min(1).default('var/minds-state.json'),
  logPath: z.string().min(1).default('var/minds-calls.jsonl'),
  creditSampling: booleanish.default(true),
  transport: z.enum(['messaging-api', 'telegram-relay']).default('messaging-api'),
  requestTimeoutMs: z.coerce.number().int().positive().default(30_000),
});

export type EnvLike = Record<string, string | undefined>;

/**
 * Reads process.env as-is. Loading .env is the application's job (dotenv in the
 * connector), not a library's — a library that reaches for a file surprises its tests.
 */
export function loadMindClientConfig(
  overrides: Partial<MindClientConfig> = {},
  env: EnvLike = process.env,
): MindClientConfig {
  const merged = { ...fromEnv(env), ...definedOnly(overrides) };
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    const problems = new Set<string>();
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '');
      problems.add(FIXES[key] ?? `${key}: ${issue.message}`);
    }
    throw new MindsConfigError([...problems]);
  }
  return result.data;
}

function fromEnv(env: EnvLike): Partial<MindClientConfig> {
  const out: Record<string, unknown> = {};
  const put = (key: keyof MindClientConfig, value: string | undefined): void => {
    if (value !== undefined && value.trim() !== '') out[key] = value.trim();
  };

  let apiKey = env['MINDS_BUILDER_API_KEY'];
  if (apiKey === undefined || apiKey.trim() === '') {
    const legacy = env['MINDS_ACCESS_KEY'];
    if (legacy !== undefined && legacy.trim() !== '') {
      apiKey = legacy;
      console.warn(
        '\n*** DEPRECATION: MINDS_ACCESS_KEY is set but MINDS_BUILDER_API_KEY is not. ***\n' +
          '    Using MINDS_ACCESS_KEY. Rename it to MINDS_BUILDER_API_KEY in .env — the\n' +
          '    X-Access-Key auth path was deprecated by the platform on 2026-06-30 and the\n' +
          '    legacy name will stop working without notice.\n',
      );
    }
  }

  put('builderApiKey', apiKey);
  put('mindId', env['MINDS_MIND_ID']);
  put('baseUrl', env['MINDS_API_BASE_URL']);
  put('authHeader', env['MINDS_AUTH_HEADER']);
  put('statePath', env['MINDS_STATE_PATH']);
  put('logPath', env['MINDS_LOG_PATH']);
  put('creditSampling', env['MINDS_CREDIT_SAMPLING']);
  put('transport', env['MINDS_TRANSPORT']);
  put('requestTimeoutMs', env['MINDS_REQUEST_TIMEOUT_MS']);

  return out as Partial<MindClientConfig>;
}

function definedOnly(overrides: Partial<MindClientConfig>): Partial<MindClientConfig> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<MindClientConfig>;
}

export interface MindClient {
  transport: MindTransport;
  log: CallLog;
  config: MindClientConfig;
}

/** The one construction path product code uses. Spikes may build transports directly. */
export function createMindClient(cfg: Partial<MindClientConfig> = {}): MindClient {
  const config = loadMindClientConfig(cfg);
  const log = new CallLog(config.logPath);

  const base: MindTransport =
    config.transport === 'telegram-relay'
      ? new TelegramRelayTransport({})
      : new MessagingApiTransport({
          builderApiKey: config.builderApiKey,
          mindId: config.mindId,
          baseUrl: config.baseUrl,
          authHeader: config.authHeader,
          statePath: config.statePath,
          requestTimeoutMs: config.requestTimeoutMs,
        });

  return { transport: withCallLog(base, log, { creditSampling: config.creditSampling }), log, config };
}
