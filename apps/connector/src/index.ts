/**
 * Keeper connector entrypoint.
 *
 * Startup order matters: configuration is validated BEFORE anything opens a socket, so a
 * missing token prints one actionable paragraph and exits 2 instead of a stack trace from
 * somewhere inside grammY. The token and the demo group may not exist yet — that is a
 * supported state, and it must look like a to-do list, not a crash.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { MindsConfigError, createMindClient } from '@keeper/minds-client';

import { ConnectorConfigError, loadConnectorConfig } from './config.js';
import { Mirror } from './db/mirror.js';
import { SeedInbox } from './seed-inbox.js';
import { AlreadyRunningError, acquireSingleInstanceLock } from './single-instance.js';
import { log } from './log.js';
import { SequentialQueue } from './pipeline/queue.js';
import { createConnector } from './telegram/bot.js';

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const ROOT = repoRoot();
dotenv.config({ path: join(ROOT, '.env') });

async function main(): Promise<void> {
  const config = loadConnectorConfig();
  const mirrorPath = resolve(ROOT, config.mirrorPath);
  // Before anything opens a socket: two connectors would double every reply.
  const releaseLock = acquireSingleInstanceLock(`${mirrorPath}.lock`);
  const mirror = Mirror.open(mirrorPath);
  log.info('mirror_ready', { path: mirrorPath, members: mirror.listMembers().length });

  const minds = createMindClient();
  const queue = new SequentialQueue({
    maxPending: config.queueMaxPending,
    onError: (error, key) => log.error('queue_job_failed', { key, detail: error instanceof Error ? error.message : String(error) }),
  });

  const runtime = await createConnector({ config, mirror, transport: minds.transport, queue });

  // Seeded history arrives by file, not by Telegram: a bot never receives its own posts,
  // so a relayed cast line is invisible to the bot API. Demo harness only.
  const seedInbox = config.seedAttribution
    ? new SeedInbox({
        path: resolve(ROOT, 'var/seed-inbox.jsonl'),
        router: runtime.router,
        mirror,
        groupChatId: config.groupChatId,
      })
    : null;

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    log.info('shutdown', { signal });
    // grammY finishes the update it is on, then stops polling; then we let queued Mind
    // exchanges finish so a half-executed directive never disappears silently.
    void runtime
      .stop()
      .catch((e: unknown) => log.error('shutdown_failed', { detail: e instanceof Error ? e.message : String(e) }))
      .finally(() => {
        seedInbox?.stop();
        runtime.watcher.stop();
        mirror.close();
        releaseLock();
        process.exit(0);
      });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  await runtime.start();
  seedInbox?.start();
  runtime.watcher.start();
  log.info('keeper_ready', {
    group: config.groupName,
    chatId: config.groupChatId,
    alias: config.mindAlias,
    budget: `${config.dailyMindBudget}/day`,
  });
}

main().catch((error: unknown) => {
  if (error instanceof AlreadyRunningError) {
    log.banner('KEEPER IS ALREADY RUNNING', [error.message]);
    process.exit(2);
  }
  if (error instanceof ConnectorConfigError || error instanceof MindsConfigError) {
    log.banner('KEEPER CANNOT START — CONFIGURATION IS INCOMPLETE', [
      error.message,
      '',
      `Edit ${join(ROOT, '.env')} (copy .env.example if you have not yet), then re-run`,
      '  pnpm dev:connector',
      '',
      'Nothing above is a bug: the Telegram bot and the demo group may simply not exist yet.',
    ]);
    process.exit(2);
  }
  const detail = error instanceof Error ? error.message : String(error);
  if (/401|404|Not Found|Unauthorized/i.test(detail)) {
    log.banner('TELEGRAM REJECTED THE BOT TOKEN', [
      detail,
      '',
      'TELEGRAM_BOT_TOKEN is set but Telegram does not accept it. Get a fresh one from',
      '@BotFather (/mybots -> your bot -> API Token) and paste it into .env.',
    ]);
    process.exit(2);
  }
  log.error('fatal', { detail });
  if (error instanceof Error && error.stack !== undefined) console.error(error.stack);
  process.exit(1);
});
