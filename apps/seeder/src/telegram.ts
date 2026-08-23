/**
 * The seeder's only door to Telegram: config loading + a small Bot API client.
 *
 * Two rules here:
 *  1. Nothing in this file is reached in --dry-run. Dry runs must work on a laptop with
 *     no .env, no network, and no bot — that is what makes them useful before the bot
 *     exists at all (which, on 2026-08-23, is exactly where we are).
 *  2. Every Telegram error is translated into a fix. "Bad Request: chat not found" is
 *     not an error message, it is a riddle; the answer is "your DEMO_GROUP_ID is wrong,
 *     here is the curl that prints the right one".
 *
 * External input is zod-validated (CLAUDE.md), including the Bot API's own responses:
 * this is a public beta-adjacent surface and we would rather fail on a shape mismatch
 * than propagate `undefined` into a recording session.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

import { SeederError, dim, failBlock } from './cli.js';

const HERE = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(): string {
  let dir = HERE;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(HERE, '..', '..', '..');
}

export const REPO_ROOT = findRepoRoot();
export const ENV_PATH = join(REPO_ROOT, '.env');
export const ENV_EXAMPLE_PATH = join(REPO_ROOT, '.env.example');

// --- config -----------------------------------------------------------------

export interface TelegramConfig {
  readonly botToken: string;
  /** Where cast lines go. Overridable with --to so rehearsals miss the real group. */
  readonly chatId: string;
  readonly creatorId: string | undefined;
  /** True when --to pointed us somewhere other than DEMO_GROUP_ID. */
  readonly chatIdIsOverride: boolean;
}

interface EnvGuidance {
  readonly line: string;
  readonly where: string[];
}

const GUIDANCE: Record<string, EnvGuidance> = {
  TELEGRAM_BOT_TOKEN: {
    line: 'TELEGRAM_BOT_TOKEN=123456789:AA...',
    where: [
      'Telegram -> @BotFather -> /newbot (or /token for a bot you already made).',
      'Then add that bot to "Ada\'s Editing Lab" and promote it to ADMIN with',
      '"Delete messages" + "Ban users" enabled — Keeper needs both to moderate.',
    ],
  },
  DEMO_GROUP_ID: {
    line: 'DEMO_GROUP_ID=-1001234567890',
    where: [
      'Create the supergroup, add the bot, post any message in it, then run:',
      '',
      '    curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" \\',
      '      | grep -o \'"chat":{"id":-\\?[0-9]*\' | head -1',
      '',
      'Supergroup ids are negative and begin -100. Keep the minus sign.',
    ],
  },
  CREATOR_TELEGRAM_ID: {
    line: 'CREATOR_TELEGRAM_ID=123456789',
    where: [
      'Your own numeric Telegram user id (Ada\'s account), for digest DMs.',
      'DM the bot /start first, then read result[].message.from.id from getUpdates.',
    ],
  },
};

const TOKEN_SHAPE = /^\d{6,}:[A-Za-z0-9_-]{20,}$/;
const CHAT_ID_SHAPE = /^-?\d+$/;

let envFileLoaded = false;

function loadEnvFile(): boolean {
  const exists = existsSync(ENV_PATH);
  if (exists && !envFileLoaded) {
    dotenv.config({ path: ENV_PATH });
    envFileLoaded = true;
  }
  return exists;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? undefined : value.trim();
}

export interface LoadConfigOptions {
  /** Where this run wants to post, e.g. a scratch group id from --to. */
  readonly chatIdOverride?: string | undefined;
  /** Printed under the missing-vars list: what the operator can do instead, right now. */
  readonly alternatives: string[];
}

/**
 * Loads and validates Telegram config, or exits 2 with a block that tells the operator
 * exactly which lines to add to .env and where each value comes from.
 */
export function loadTelegramConfig(opts: LoadConfigOptions): TelegramConfig {
  const envFileExists = loadEnvFile();

  const botToken = readEnv('TELEGRAM_BOT_TOKEN');
  const groupId = opts.chatIdOverride ?? readEnv('DEMO_GROUP_ID');

  const missing: string[] = [];
  if (botToken === undefined) missing.push('TELEGRAM_BOT_TOKEN');
  if (groupId === undefined) missing.push('DEMO_GROUP_ID');

  if (missing.length > 0) {
    const lines: string[] = [];
    lines.push(
      envFileExists
        ? `.env found at ${ENV_PATH}, but ${missing.length === 1 ? 'this value is' : 'these values are'} empty or absent:`
        : `.env NOT FOUND at ${ENV_PATH}`,
    );
    if (!envFileExists) {
      lines.push('');
      lines.push(`Create it first:   cp ${ENV_EXAMPLE_PATH} ${ENV_PATH}`);
      lines.push('');
      lines.push(`Then fill in ${missing.length === 1 ? 'this value' : 'these values'}:`);
    }
    missing.forEach((name, i) => {
      const guidance = GUIDANCE[name];
      lines.push('');
      lines.push(`${i + 1}. ${name}`);
      lines.push(`   add to .env:  ${guidance ? guidance.line : `${name}=<value>`}`);
      lines.push('   where to get it:');
      for (const w of guidance?.where ?? ['see docs/BUILD_PLAN.md §5 Phase 0.']) {
        lines.push(`     ${w}`);
      }
    });
    lines.push('');
    lines.push('None of this is set up yet? Nothing is broken — you can work without it:');
    lines.push('');
    for (const alt of opts.alternatives) lines.push(`  ${alt}`);
    failBlock('Telegram is not configured, so nothing can be posted.', lines);
  }

  // Non-null: `missing` was empty, so both were read successfully.
  const token = botToken as string;
  const chat = groupId as string;

  if (!TOKEN_SHAPE.test(token)) {
    failBlock('TELEGRAM_BOT_TOKEN does not look like a bot token.', [
      `Found a ${token.length}-character value in .env that is not shaped like a token.`,
      '',
      'A BotFather token looks like:  123456789:AAH4xk...  (digits, a colon, then ~35 chars)',
      'Common causes: you pasted the bot USERNAME, a truncated copy, or wrapped it in quotes.',
      '',
      'Get a fresh one: Telegram -> @BotFather -> /token -> pick your bot.',
    ]);
  }

  if (!CHAT_ID_SHAPE.test(chat)) {
    failBlock('The chat id is not numeric.', [
      `Got: ${chat}`,
      '',
      'Telegram chat ids are numbers, not @usernames — supergroups are negative (-100...).',
      ...(GUIDANCE['DEMO_GROUP_ID']?.where ?? []),
    ]);
  }

  return {
    botToken: token,
    chatId: chat,
    creatorId: readEnv('CREATOR_TELEGRAM_ID'),
    chatIdIsOverride: opts.chatIdOverride !== undefined,
  };
}

// --- Bot API ----------------------------------------------------------------

const ApiEnvelope = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error_code: z.number().optional(),
  description: z.string().optional(),
  parameters: z
    .object({
      retry_after: z.number().optional(),
      migrate_to_chat_id: z.number().optional(),
    })
    .optional(),
});

const MessageResult = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: z.object({ id: z.number(), title: z.string().optional(), type: z.string() }),
});
export type SentMessage = z.infer<typeof MessageResult>;

const MeResult = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  username: z.string().optional(),
  first_name: z.string().optional(),
});
export type BotIdentity = z.infer<typeof MeResult>;

const ChatResult = z.object({
  id: z.number(),
  type: z.string(),
  title: z.string().optional(),
  username: z.string().optional(),
});
export type ChatInfo = z.infer<typeof ChatResult>;

const ChatMemberResult = z.object({
  status: z.string(),
  can_delete_messages: z.boolean().optional(),
  can_restrict_members: z.boolean().optional(),
});
export type ChatMembership = z.infer<typeof ChatMemberResult>;

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

/**
 * One Bot API call, validated. Retries only on 429 (honouring retry_after) and on
 * transport failures — never on a 4xx, which is always a configuration mistake here.
 */
async function call<T>(
  config: TelegramConfig,
  method: string,
  payload: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = `https://api.telegram.org/bot${config.botToken}/${method}`;
  let lastTransportError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastTransportError = error instanceof Error ? error.message : String(error);
      if (attempt === MAX_ATTEMPTS) {
        throw new SeederError(`Could not reach Telegram (${method}).`, [
          lastTransportError,
          '',
          'Checked 3 times. Check your network / VPN, then re-run.',
          'Nothing was posted by this attempt.',
        ]);
      }
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      continue;
    }

    const bodyText = await response.text();
    let envelope: z.infer<typeof ApiEnvelope>;
    try {
      envelope = ApiEnvelope.parse(JSON.parse(bodyText));
    } catch {
      throw new SeederError(`Telegram returned something we cannot read (${method}).`, [
        `HTTP ${response.status}. First 300 characters of the body:`,
        '',
        bodyText.slice(0, 300),
        '',
        'This is not a normal Bot API response. Check that api.telegram.org is not being',
        'intercepted by a captive portal or corporate proxy.',
      ]);
    }

    if (envelope.ok) {
      const parsed = schema.safeParse(envelope.result);
      if (!parsed.success) {
        throw new SeederError(`Telegram's ${method} reply did not match the shape we expect.`, [
          parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
          '',
          'The call itself succeeded. This is a seeder bug — fix the schema in',
          'apps/seeder/src/telegram.ts.',
        ]);
      }
      return parsed.data;
    }

    const retryAfter = envelope.parameters?.retry_after;
    if (response.status === 429 && retryAfter !== undefined && attempt < MAX_ATTEMPTS) {
      process.stdout.write(
        `${dim(`   rate limited by Telegram, waiting ${retryAfter}s (attempt ${attempt}/${MAX_ATTEMPTS})`)}\n`,
      );
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      continue;
    }

    throw explainApiError(method, response.status, envelope, config);
  }

  throw new SeederError(`Could not reach Telegram (${method}).`, [lastTransportError]);
}

function explainApiError(
  method: string,
  status: number,
  envelope: z.infer<typeof ApiEnvelope>,
  config: TelegramConfig,
): SeederError {
  const description = envelope.description ?? `HTTP ${status}`;
  const lower = description.toLowerCase();
  const migrate = envelope.parameters?.migrate_to_chat_id;

  if (migrate !== undefined) {
    return new SeederError('The group was upgraded to a supergroup, so its id changed.', [
      `Telegram says the new id is: ${migrate}`,
      '',
      `Update .env:   DEMO_GROUP_ID=${migrate}`,
      'Then re-run. (This happens the first time you promote a bot to admin.)',
    ]);
  }

  if (status === 401) {
    return new SeederError('Telegram rejected the bot token (401).', [
      description,
      '',
      'The token is wrong, revoked, or from a deleted bot.',
      'Fix: Telegram -> @BotFather -> /token -> pick the bot -> paste into .env',
      'as TELEGRAM_BOT_TOKEN, then re-run.',
    ]);
  }

  if (lower.includes('chat not found')) {
    return new SeederError(`Telegram cannot find chat ${config.chatId}.`, [
      description,
      '',
      'Either the id is wrong, or the bot was never added to that group.',
      '',
      'Check both:',
      '  1. Is @YourBot a MEMBER of "Ada\'s Editing Lab"? Add it, then promote to admin.',
      '  2. Is the id right? Post a message in the group, then:',
      '',
      '     curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates" \\',
      '       | grep -o \'"chat":{"id":-\\?[0-9]*\' | head -1',
      '',
      '  Supergroup ids are negative and start with -100. Keep the minus sign.',
    ]);
  }

  if (lower.includes('bot was kicked') || lower.includes('not a member') || status === 403) {
    return new SeederError('The bot is not allowed to post in that chat (403).', [
      description,
      '',
      'Add the bot back to the group and promote it to admin with',
      '"Delete messages" + "Ban users". If this was a DM: the person must',
      'send /start to the bot once before it can message them.',
    ]);
  }

  if (lower.includes('not enough rights') || lower.includes('need administrator')) {
    return new SeederError('The bot is in the group but lacks admin rights.', [
      description,
      '',
      'Group -> Members -> your bot -> Promote to admin, and enable at least',
      '"Delete messages" and "Ban users". Keeper cannot moderate without them.',
    ]);
  }

  if (status === 429) {
    return new SeederError('Telegram is rate limiting us.', [
      description,
      '',
      'Re-run without --fast: default pacing is deliberately slow (tens of seconds',
      'between messages) and does not trip this.',
    ]);
  }

  return new SeederError(`Telegram refused the ${method} call (HTTP ${status}).`, [
    description,
    '',
    'Full response above. If this is a shape/permission issue it is fixable in .env or',
    'in the group settings; nothing in the seeder needs to change.',
  ]);
}

/** Posts one message. Plain text on purpose — no parse_mode, so nothing can mis-escape. */
export async function sendMessage(
  config: TelegramConfig,
  text: string,
  chatId?: string,
): Promise<SentMessage> {
  return call(
    config,
    'sendMessage',
    { chat_id: chatId ?? config.chatId, text, disable_web_page_preview: true },
    MessageResult,
  );
}

export async function getMe(config: TelegramConfig): Promise<BotIdentity> {
  return call(config, 'getMe', {}, MeResult);
}

export async function getChat(config: TelegramConfig): Promise<ChatInfo> {
  return call(config, 'getChat', { chat_id: config.chatId }, ChatResult);
}

export async function getChatMember(
  config: TelegramConfig,
  userId: number,
): Promise<ChatMembership> {
  return call(config, 'getChatMember', { chat_id: config.chatId, user_id: userId }, ChatMemberResult);
}
