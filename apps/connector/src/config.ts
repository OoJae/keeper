/**
 * Connector configuration.
 *
 * Same contract as `@keeper/minds-client`'s config: every failure message states the
 * EXACT line to paste into .env. At 2am on day 7 a config error must cost zero thinking.
 * Nothing here reads a file — loading .env is `src/index.ts`'s job.
 */
import { z } from 'zod';

export interface ConnectorConfig {
  /** @BotFather token. Absent => the bot entrypoint refuses to start (clearly). */
  botToken: string;
  /** Numeric Telegram user id of the creator. Digest/flag DMs go here. */
  creatorTelegramId: number;
  /** Numeric id of the demo supergroup (negative). */
  groupChatId: number;
  /** Human name of the community, used verbatim in the envelope's `group:` line. */
  groupName: string;
  /** SQLite mirror file. A MIRROR — deleting it must not lose relationship memory. */
  mirrorPath: string;
  /** One long-lived Minds conversation per community (see docs/API-NOTES.md). */
  mindAlias: string;
  /** Mind exchanges measured at 23-65s; this is the give-up point, not a target. */
  mindTimeoutMs: number;
  /** Minutes east of UTC used for envelope timestamps and the daily-budget day boundary. */
  utcOffsetMinutes: number;
  /** BUILD_PLAN §7: <= 40 Mind exchanges/day. Hard cap, enforced. */
  dailyMindBudget: number;
  /** Slice of the budget only joins / returns / creator commands may spend. */
  priorityReserve: number;
  /** 1-in-N ambient sampling for relationship colour. 0 disables ambient sampling. */
  ambientSampleRate: number;
  /** Backlog depth per chat before new Mind jobs are dropped (and logged). */
  queueMaxPending: number;
  /** Telegram refuses deleteMessage on messages older than this. */
  deleteWindowMs: number;
  /**
   * Demo harness only: accept "@handle: text" relayed through our OWN bot in the demo
   * group and attribute it to that cast member. Without it, seeded history is invisible
   * to the Mind, because Telegram never shows a bot another bot's messages and we ignore
   * our own. Default off — it must never be on for a real community.
   */
  seedAttribution: boolean;
}

export class ConnectorConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      ['Keeper connector configuration is invalid. Fix your .env:', ...problems.map((p) => `  - ${p}`)].join(
        '\n',
      ),
    );
    this.name = 'ConnectorConfigError';
    this.problems = problems;
  }
}

const FIXES: Record<string, string> = {
  botToken:
    'TELEGRAM_BOT_TOKEN is missing or malformed. Open Telegram -> @BotFather -> /newbot ' +
    '(or /token for an existing bot), then add to .env:  TELEGRAM_BOT_TOKEN=123456:ABC-DEF…',
  creatorTelegramId:
    'CREATOR_TELEGRAM_ID must be your numeric Telegram user id. DM @userinfobot to get it, ' +
    'then add to .env:  CREATOR_TELEGRAM_ID=123456789   (and /start the Keeper bot once, or ' +
    'it cannot DM you)',
  groupChatId:
    'DEMO_GROUP_ID must be the numeric id of the demo supergroup (negative, starts -100). ' +
    'Add the bot to the group as an ADMIN, post any message, then read the id from the bot log ' +
    'or @userinfobot. Add to .env:  DEMO_GROUP_ID=-1001234567890',
  groupName: "KEEPER_GROUP_NAME must be non-empty. Use:  KEEPER_GROUP_NAME=Ada's Editing Lab",
  mirrorPath: 'KEEPER_MIRROR_PATH must be a non-empty path. Use:  KEEPER_MIRROR_PATH=var/keeper.db',
  mindAlias:
    'KEEPER_MIND_ALIAS must be a non-empty conversation alias. Use:  KEEPER_MIND_ALIAS=keeper-steward ' +
    '(one long-lived conversation per community — do not rotate it, memory recall across fresh ' +
    'conversations is not reliable, see docs/API-NOTES.md)',
  mindTimeoutMs:
    'KEEPER_MIND_TIMEOUT_MS must be a positive integer. Measured latency is 23-65s, so use:  ' +
    'KEEPER_MIND_TIMEOUT_MS=180000',
  utcOffsetMinutes:
    'KEEPER_UTC_OFFSET_MINUTES must be minutes east of UTC between -840 and 840. Hong Kong is ' +
    '+08:00, so use:  KEEPER_UTC_OFFSET_MINUTES=480',
  dailyMindBudget:
    'KEEPER_DAILY_MIND_BUDGET must be a positive integer. BUILD_PLAN §7 targets 40, so use:  ' +
    'KEEPER_DAILY_MIND_BUDGET=40',
  priorityReserve:
    'KEEPER_PRIORITY_RESERVE must be a non-negative integer strictly less than ' +
    'KEEPER_DAILY_MIND_BUDGET (it is the slice of the budget reserved for joins, returns and ' +
    'creator commands). Use:  KEEPER_PRIORITY_RESERVE=10',
  ambientSampleRate:
    'KEEPER_AMBIENT_SAMPLE_RATE must be a non-negative integer (0 disables ambient sampling; ' +
    'N routes every Nth otherwise-uninteresting message). Use:  KEEPER_AMBIENT_SAMPLE_RATE=12',
  queueMaxPending:
    'KEEPER_QUEUE_MAX_PENDING must be a positive integer. Use:  KEEPER_QUEUE_MAX_PENDING=20',
  seedAttribution:
    "KEEPER_SEED_ATTRIBUTION must be 'true' or 'false'. It lets apps/seeder relay a cast " +
    "member's line through this bot as \"@handle: text\" when that character has no real " +
    'Telegram account, so the seeded history still reaches the Mind. Use:  ' +
    'KEEPER_SEED_ATTRIBUTION=true   (demo harness only — never for a real community)',
  deleteWindowMs:
    'KEEPER_DELETE_WINDOW_MS must be a positive integer. Telegram refuses deleteMessage after ' +
    '48h, so use:  KEEPER_DELETE_WINDOW_MS=172800000',
};

/** Telegram bot tokens are `<numeric id>:<35-ish url-safe chars>`. */
const BOT_TOKEN = z.string().trim().regex(/^\d{6,}:[A-Za-z0-9_-]{20,}$/);

const ConfigSchema = z
  .object({
    botToken: BOT_TOKEN,
    creatorTelegramId: z.coerce.number().int().positive(),
    groupChatId: z.coerce.number().int().refine((n) => n !== 0),
    groupName: z.string().trim().min(1).default("Ada's Editing Lab"),
    mirrorPath: z.string().trim().min(1).default('var/keeper.db'),
    mindAlias: z.string().trim().min(1).default('keeper-steward'),
    mindTimeoutMs: z.coerce.number().int().positive().default(180_000),
    utcOffsetMinutes: z.coerce.number().int().min(-840).max(840).default(480),
    dailyMindBudget: z.coerce.number().int().positive().default(40),
    priorityReserve: z.coerce.number().int().min(0).default(10),
    ambientSampleRate: z.coerce.number().int().min(0).default(12),
    queueMaxPending: z.coerce.number().int().positive().default(20),
    deleteWindowMs: z.coerce.number().int().positive().default(172_800_000),
    seedAttribution: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.priorityReserve >= cfg.dailyMindBudget) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['priorityReserve'], message: 'must be < dailyMindBudget' });
    }
  });

export type EnvLike = Record<string, string | undefined>;

function pick(env: EnvLike, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

export function loadConnectorConfig(env: EnvLike = process.env): ConnectorConfig {
  const raw: Record<string, unknown> = {};
  const put = (key: keyof ConnectorConfig, name: string): void => {
    const value = pick(env, name);
    if (value !== undefined) raw[key] = value;
  };

  put('botToken', 'TELEGRAM_BOT_TOKEN');
  put('creatorTelegramId', 'CREATOR_TELEGRAM_ID');
  put('groupChatId', 'DEMO_GROUP_ID');
  put('groupName', 'KEEPER_GROUP_NAME');
  put('mirrorPath', 'KEEPER_MIRROR_PATH');
  put('mindAlias', 'KEEPER_MIND_ALIAS');
  put('mindTimeoutMs', 'KEEPER_MIND_TIMEOUT_MS');
  put('utcOffsetMinutes', 'KEEPER_UTC_OFFSET_MINUTES');
  put('dailyMindBudget', 'KEEPER_DAILY_MIND_BUDGET');
  put('priorityReserve', 'KEEPER_PRIORITY_RESERVE');
  put('ambientSampleRate', 'KEEPER_AMBIENT_SAMPLE_RATE');
  put('queueMaxPending', 'KEEPER_QUEUE_MAX_PENDING');
  put('deleteWindowMs', 'KEEPER_DELETE_WINDOW_MS');
  put('seedAttribution', 'KEEPER_SEED_ATTRIBUTION');

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const problems = new Set<string>();
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '');
      problems.add(FIXES[key] ?? `${key}: ${issue.message}`);
    }
    throw new ConnectorConfigError([...problems]);
  }
  return result.data;
}
