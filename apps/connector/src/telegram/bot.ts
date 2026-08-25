/**
 * grammY wiring. Everything here is Telegram-shaped; the judgement lives elsewhere.
 *
 * Long polling, single instance. Two Telegram-specific facts drive the design:
 *  - `chat_member` updates are NOT delivered unless explicitly requested in
 *    `allowed_updates`, so joins would silently never fire if this list were defaulted;
 *  - a second polling process makes Telegram answer 409 to both. We detect it and say so
 *    rather than looking mysteriously deaf.
 */
import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import type { Message, Update, User } from 'grammy/types';
import type { MindTransport } from '@keeper/minds-client';

import { handleCreatorCommand, isKeeperCommand } from '../commands.js';
import type { ConnectorConfig } from '../config.js';
import type { Mirror } from '../db/mirror.js';
import { log } from '../log.js';
import { DigestScheduler } from '../pipeline/digest.js';
import { MindWatcher } from '../pipeline/mind-watch.js';
import { EventRouter } from '../pipeline/router.js';
import type { SequentialQueue } from '../pipeline/queue.js';
import { GrammyTelegramSurface } from './surface.js';

/** `chat_member` is the one that matters: without it, joins never arrive. */
const ALLOWED_UPDATES: ReadonlyArray<Exclude<keyof Update, 'update_id'>> = [
  'message',
  'chat_member',
  'my_chat_member',
];

/** SIGTERM under a supervisor is not patient. Finish what we can, then let go. */
const DRAIN_TIMEOUT_MS = 15_000;

export interface ConnectorDeps {
  config: ConnectorConfig;
  mirror: Mirror;
  transport: MindTransport;
  queue: SequentialQueue;
}

export interface ConnectorRuntime {
  bot: Bot;
  router: EventRouter;
  /** Watches for messages the Mind sent on its own; started and stopped by index.ts. */
  watcher: MindWatcher;
  /** Arms the Mind's own nightly digest, and backstops it. */
  digest: DigestScheduler;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export async function createConnector(deps: ConnectorDeps): Promise<ConnectorRuntime> {
  const { config, mirror, transport, queue } = deps;
  const bot = new Bot(config.botToken);

  // Retries 429s with the server's own retry_after, plus transient 5xx. Without it a
  // single flood-wait during the demo drops the update instead of delaying it.
  bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));

  await bot.init();
  const me = bot.botInfo;
  const surface = new GrammyTelegramSurface(bot.api, me.username, me.id);
  // The watcher needs the surface, and the router needs the watcher (it sweeps at the end
  // of every exchange), so both are built here where the surface exists.
  const watcher = new MindWatcher({ transport, mirror, surface, queue, config });
  const router = new EventRouter({ mirror, surface, transport, queue, config, watcher });
  const digest = new DigestScheduler({ mirror, router, transport, queue, config });
  watcher.onDigestDelivered = (tsMs) => digest.markDelivered(tsMs, 'mind');

  const memberOf = (user: User): { telegramId: number; handle: string | null; display: string } => ({
    telegramId: user.id,
    handle: user.username ?? null,
    display: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || `user${user.id}`,
  });

  bot.on('chat_member', (ctx) => {
    const update = ctx.chatMember;
    if (update.chat.id !== config.groupChatId) return;
    const was = update.old_chat_member.status;
    const now = update.new_chat_member.status;
    const joined = (was === 'left' || was === 'kicked') && now !== 'left' && now !== 'kicked';
    if (!joined) return;
    const user = update.new_chat_member.user;
    if (user.is_bot) return;

    router.ingest({
      kind: 'join',
      member: memberOf(user),
      text: `${user.first_name} joined the group.`,
      chatId: update.chat.id,
      tsMs: update.date * 1000,
    });
  });

  bot.on('message', async (ctx) => {
    const msg = ctx.message;
    const from = msg.from;
    // Telegram never delivers a bot its own messages, nor one bot another bot's — so a
    // relayed cast line can never arrive here. Seeded history comes in through
    // src/seed-inbox.ts instead; see that file's header for why.
    if (from === undefined || from.is_bot) return;

    const inGroup = ctx.chat.id === config.groupChatId;
    const creatorDm = ctx.chat.type === 'private' && from.id === config.creatorTelegramId;
    if (!inGroup && !creatorDm) return;

    const tsMs = msg.date * 1000;
    const member = memberOf(from);

    // Service message fallback: some group configurations deliver joins here rather
    // than (or as well as) via chat_member.
    const newcomers = msg.new_chat_members ?? [];
    if (newcomers.length > 0 && inGroup) {
      for (const user of newcomers) {
        if (user.is_bot) continue;
        router.ingest({
          kind: 'join',
          member: memberOf(user),
          text: `${user.first_name} joined the group.`,
          chatId: ctx.chat.id,
          tsMs,
        });
      }
      return;
    }

    const text = msg.text ?? msg.caption ?? '';
    if (text.trim() === '') return;

    if (isKeeperCommand(text)) {
      await handleCreatorCommand(
        { mirror, surface, config, router },
        { text, chatId: ctx.chat.id, fromId: from.id, messageId: msg.message_id, member, tsMs },
      );
      return;
    }

    if (!inGroup) {
      // A creator DM that is not a command. Do not spend Cognition guessing.
      await ctx.reply('Send me <code>/keeper help</code> to see what I can do.', { parse_mode: 'HTML' });
      return;
    }

    router.ingest({
      kind: 'message',
      member,
      text,
      chatId: ctx.chat.id,
      messageId: msg.message_id,
      tsMs,
      mentionsBot: mentionsBot(msg, me.username, me.id),
      hasLinkEntity: hasLinkEntity(msg),
    });
  });

  // Our own membership changing is the single most common cause of "Keeper went deaf".
  bot.on('my_chat_member', (ctx) => {
    const update = ctx.myChatMember;
    if (update.chat.id !== config.groupChatId) return;
    log.info('bot_membership_changed', {
      chatId: update.chat.id,
      from: update.old_chat_member.status,
      to: update.new_chat_member.status,
    });
    void selfCheck(surface, config);
  });

  bot.catch((err) => {
    const description = err.error instanceof Error ? err.error.message : String(err.error);
    if (/409|terminated by other getUpdates/i.test(description)) {
      log.banner('TELEGRAM 409 — ANOTHER INSTANCE IS POLLING THIS BOT', [
        'Telegram allows exactly one long-polling consumer per bot token.',
        'Stop the other `pnpm dev:connector` / deployed process, or mint a second bot',
        'token for local development. Until then neither instance will see updates.',
      ]);
      return;
    }
    log.error('bot_error', { detail: description, update: err.ctx.update.update_id });
  });

  return {
    bot,
    router,
    watcher,
    digest,

    async start(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        void bot
          .start({
            allowed_updates: [...ALLOWED_UPDATES],
            onStart: (info) => {
              settled = true;
              log.info('bot_started', { username: info.username, id: info.id });
              resolve();
            },
          })
          .catch((e: unknown) => {
            const detail = e instanceof Error ? e.message : String(e);
            if (settled) log.error('polling_stopped', { detail });
            else reject(e instanceof Error ? e : new Error(detail));
          });
      });

      await selfCheck(surface, config);
      try {
        const conversation = await transport.ensureConversation(config.mindAlias);
        log.info('mind_conversation_ready', { alias: conversation.alias, conversationId: conversation.conversationId });
      } catch (e) {
        log.banner('STEWARD MIND UNREACHABLE', [
          `Could not open conversation "${config.mindAlias}": ${e instanceof Error ? e.message : String(e)}`,
          'Telegram is running and events are being mirrored, but nothing will be judged.',
          'Check MINDS_BUILDER_API_KEY / MINDS_MIND_ID in .env and run `pnpm spike:api-smoke`.',
        ]);
      }
    },

    async stop(): Promise<void> {
      await bot.stop();
      // An in-flight Mind exchange can still have a minute to run. Give it a bounded
      // grace period rather than either dropping it or hanging past the SIGKILL.
      const drained = await Promise.race([
        queue.drain().then(() => true),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DRAIN_TIMEOUT_MS)),
      ]);
      if (!drained) log.warn('drain_timeout', { pending: queue.size, waitedMs: DRAIN_TIMEOUT_MS });
    },
  };
}

/** Bot admin rights are a setup problem that presents as "Keeper does nothing". Say it loudly. */
async function selfCheck(surface: GrammyTelegramSurface, config: ConnectorConfig): Promise<void> {
  const rights = await surface.checkAdminRights(config.groupChatId);
  if (rights.isAdmin && rights.canDeleteMessages && rights.canRestrictMembers) {
    log.info('admin_selfcheck_ok', { chatId: config.groupChatId });
    return;
  }
  log.banner('TELEGRAM PERMISSIONS ARE NOT SUFFICIENT', [
    `Group: ${config.groupChatId} — ${rights.detail}`,
    `  administrator ......... ${rights.isAdmin ? 'yes' : 'NO'}`,
    `  can_delete_messages ... ${rights.canDeleteMessages ? 'yes' : 'NO'}`,
    `  can_restrict_members .. ${rights.canRestrictMembers ? 'yes' : 'NO'}`,
    '',
    `Fix: open the group -> Manage -> Administrators -> add @${surface.botUsername} and enable`,
    'BOTH "Delete messages" and "Ban users". The group must be a SUPERGROUP.',
    'Keeper will keep running and can still reply — but delete and mute will fail.',
  ]);
}

function mentionsBot(msg: Message, botUsername: string, botId: number): boolean {
  const text = msg.text ?? msg.caption ?? '';
  const entities = msg.entities ?? msg.caption_entities ?? [];
  const needle = `@${botUsername.toLowerCase()}`;
  for (const entity of entities) {
    if (entity.type === 'mention') {
      if (text.slice(entity.offset, entity.offset + entity.length).toLowerCase() === needle) return true;
    } else if (entity.type === 'text_mention' && entity.user.id === botId) {
      return true;
    }
  }
  return msg.reply_to_message?.from?.id === botId;
}

function hasLinkEntity(msg: Message): boolean {
  const entities = msg.entities ?? msg.caption_entities ?? [];
  return entities.some((e) => e.type === 'url' || e.type === 'text_link');
}
