/**
 * Point a real Telegram account at the identity the Mind already remembers.
 *
 *   pnpm link:member --handle lena_learns --telegram-id 856123419
 *   pnpm link:member --list
 *   pnpm link:member --handle lena_learns --telegram-id 856123419 --unlink
 *
 * Why this exists: seeded cast members are ingested with a synthetic id derived from their
 * handle. When a character gets a real Telegram account, its positive id would mirror a
 * brand-new member — first_seen resets, the >48h `member_returned` promotion never fires,
 * and the envelope tells the Mind this is a stranger. For @lena_learns that is the entire
 * demo: she asks a question, goes quiet for days, and is recognised on camera.
 *
 * We alias rather than migrate because the Mind has already memorised the synthetic id and
 * quotes it back. Changing the id in her envelopes would introduce a second Lena to the one
 * thing whose memory is the product.
 */
import { join, resolve } from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

import { ConnectorConfigError, loadConnectorConfig } from '../config.js';
import { Mirror, MirrorLinkError, type MemberSnapshot } from '../db/mirror.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
dotenv.config({ path: join(ROOT, '.env') });

const ArgsSchema = z.object({
  handle: z.string().min(1).optional(),
  telegramId: z.number().int().optional(),
  canonicalId: z.number().int().optional(),
  note: z.string().default(''),
  force: z.boolean().default(false),
  unlink: z.boolean().default(false),
  list: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

function parseArgs(argv: string[]): z.infer<typeof ArgsSchema> {
  const flag = (name: string): string | undefined => {
    const exact = argv.indexOf(`--${name}`);
    if (exact !== -1 && argv[exact + 1] !== undefined && !argv[exact + 1]!.startsWith('--')) {
      return argv[exact + 1];
    }
    const inline = argv.find((a) => a.startsWith(`--${name}=`));
    return inline?.slice(name.length + 3);
  };
  const num = (v: string | undefined): number | undefined =>
    v === undefined ? undefined : Number(v);
  return ArgsSchema.parse({
    handle: flag('handle')?.replace(/^@/, ''),
    telegramId: num(flag('telegram-id')),
    canonicalId: num(flag('canonical-id')),
    note: flag('note') ?? '',
    force: argv.includes('--force'),
    unlink: argv.includes('--unlink'),
    list: argv.includes('--list'),
    dryRun: argv.includes('--dry-run'),
  });
}

const day = (ms: number | null): string =>
  ms === null ? 'never' : new Date(ms).toISOString().slice(0, 10);

function describeMember(m: MemberSnapshot): string {
  return `first seen ${day(m.firstSeenMs)} · last seen ${day(m.lastSeenMs)} · ${m.messageCount} message(s)`;
}

function fail(lines: string[], code: number): never {
  process.stderr.write(`\n${lines.join('\n')}\n\n`);
  process.exit(code);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConnectorConfig();
  const mirror = Mirror.open(resolve(ROOT, config.mirrorPath));

  try {
    if (args.list) {
      const rows = mirror.listAliases();
      process.stdout.write('\nkeeper link:member --list\n\n');
      if (rows.length === 0) process.stdout.write('  (no aliases)\n\n');
      for (const r of rows) {
        process.stdout.write(
          `  @${r.handle}  ${r.aliasTelegramId} -> ${r.canonicalTelegramId}` +
            `${r.note === '' ? '' : `  (${r.note})`}\n`,
        );
      }
      process.stdout.write('\n');
      return;
    }

    if (args.handle === undefined || args.telegramId === undefined) {
      fail(
        [
          'Usage:',
          '  pnpm link:member --handle <handle> --telegram-id <real id>',
          '  pnpm link:member --list',
          '  pnpm link:member --handle <handle> --telegram-id <id> --unlink',
          '',
          'Options: --canonical-id <id>  --note "<text>"  --force  --dry-run',
        ],
        2,
      );
    }

    if (args.unlink) {
      const removed = args.dryRun ? true : mirror.unlinkMember(args.telegramId);
      process.stdout.write(
        removed
          ? `\n${args.dryRun ? 'DRY RUN — would remove' : 'removed'} the alias for ${args.telegramId}\n\n`
          : `\nNo alias existed for ${args.telegramId}; nothing to remove.\n\n`,
      );
      return;
    }

    const canonical =
      args.canonicalId ?? mirror.findMemberByHandle(args.handle)?.telegramId ?? undefined;
    if (canonical === undefined) {
      const known = mirror
        .listMembers()
        .sort((a, b) => (b.lastSeenMs ?? 0) - (a.lastSeenMs ?? 0))
        .slice(0, 12)
        .map((m) => `    @${m.handle ?? '?'}  ${m.telegramId}  ${describeMember(m)}`);
      fail(
        [
          `No mirrored member with handle @${args.handle}.`,
          '',
          '  Known members (most recent first):',
          ...(known.length > 0 ? known : ['    (none)']),
          '',
          '  If the Mind has no memory of this person there is nothing to preserve and',
          '  linking buys nothing — just let them speak normally. Pass --canonical-id <id>',
          '  only if you know the id and the mirror was reset.',
        ],
        2,
      );
    }

    if (canonical > 0 && !args.force) {
      fail(
        [
          `The canonical id ${canonical} is positive, i.e. another real account — linking`,
          'would merge two humans into one identity. Pass --force only if that is genuinely',
          'what you want.',
        ],
        3,
      );
    }

    const canonicalBefore = mirror.getMember(canonical);
    const realBefore = mirror.getMember(args.telegramId);

    process.stdout.write('\nkeeper link:member\n\n');
    process.stdout.write(`  handle          @${args.handle}\n`);
    process.stdout.write(
      `  canonical id    ${canonical}   ${canonical < 0 ? '(synthetic, seeded)' : '(real account)'}\n`,
    );
    if (canonicalBefore !== undefined) {
      process.stdout.write(`                  ${describeMember(canonicalBefore)}\n`);
    }
    process.stdout.write(`  real id         ${args.telegramId}   (real Telegram account)\n`);
    if (realBefore !== undefined) {
      process.stdout.write(`                  had its own mirror row: ${describeMember(realBefore)}  -> MERGED\n`);
    }

    if (args.dryRun) {
      process.stdout.write('\n  DRY RUN — nothing was written.\n\n');
      return;
    }

    const outcome = mirror.linkMember({
      realTelegramId: args.telegramId,
      canonicalTelegramId: canonical,
      handle: args.handle,
      note: args.note,
      force: args.force,
      tsMs: Date.now(),
    });

    process.stdout.write('\n');
    if (outcome.status === 'already_linked') {
      process.stdout.write(`  already linked — no change.\n`);
    } else {
      if (outcome.previousCanonicalId !== undefined) {
        process.stdout.write(`  overwrote the previous mapping -> ${outcome.previousCanonicalId}\n`);
      }
      process.stdout.write(`  wrote member_aliases: ${args.telegramId} -> ${canonical}\n`);
      if (outcome.merged !== undefined) {
        process.stdout.write(
          `  moved ${outcome.merged.eventsMoved} event row(s) and removed the duplicate members row\n` +
            `  merged identity: first seen ${day(outcome.merged.firstSeenMs)} · ` +
            `last seen ${day(outcome.merged.lastSeenMs)} · ${outcome.merged.messageCount} message(s)\n`,
        );
      }
    }

    const after = mirror.getMember(canonical);
    process.stdout.write(
      `\n  Messages from ${args.telegramId} are now ingested as ${canonical}.\n` +
        `  The Mind keeps calling this person @${args.handle}` +
        (after?.lastSeenMs != null
          ? `; last_seen stays ${day(after.lastSeenMs)}, so their next message more than 48h\n  later classifies as member_returned.\n`
          : '.\n') +
        `\n  Verify:  start the connector, have them post, and look for\n` +
        `           prefilter ... type=member_returned member=@${args.handle}\n` +
        `  Undo:    pnpm link:member --handle ${args.handle} --telegram-id ${args.telegramId} --unlink\n\n`,
    );
  } catch (error) {
    if (error instanceof MirrorLinkError) fail([error.message], 3);
    throw error;
  } finally {
    mirror.close();
  }
}

try {
  main();
} catch (error) {
  if (error instanceof ConnectorConfigError) fail([error.message], 2);
  throw error;
}
