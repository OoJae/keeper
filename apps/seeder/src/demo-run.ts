/**
 * pnpm demo:run — stage manager for the 110-second demo (BUILD_PLAN.md §10).
 *
 * It walks the beats in order, tells you exactly what to type and from which account,
 * then WAITS — through the 23-66 second window a Mind round-trip really takes — and
 * tells you what should have happened and what to do if it did not.
 *
 * What it deliberately does NOT do is trigger Keeper. The 30-55s and 75-95s beats are
 * only worth anything if Keeper acted unprompted, so the runner's job during those is to
 * count down and keep its hands off. If this tool were the thing that made Keeper speak,
 * the video would be a lie.
 *
 *   --dry-run   print the whole run sheet and stop. No Telegram, no .env, works offline.
 *   --list      one line per beat.
 *   (default)   live stage manager: preflight checks, then beat-by-beat.
 */
import { CAST } from './cast.js';
import { describeDay, today } from './calendar.js';
import {
  BEATS,
  MIND_LATENCY_SECONDS,
  estimateRunSeconds,
  type Beat,
} from './demo-script.js';
import {
  SeederError,
  argFlag,
  argValue,
  bold,
  countdown,
  confirmWord,
  cyan,
  dim,
  failBlock,
  green,
  humanMs,
  isTty,
  pressEnter,
  rejectUnknownFlags,
  runMain,
  yellow,
} from './cli.js';
import {
  getChat,
  getChatMember,
  getMe,
  loadTelegramConfig,
  sendMessage,
  type TelegramConfig,
} from './telegram.js';

const KNOWN_FLAGS = [
  'dry-run',
  'list',
  'from',
  'only',
  'to',
  'post',
  'skip-preflight',
  'include-optional',
  'yes',
  'debug',
  'help',
] as const;

const USAGE = [
  'Usage:  pnpm demo:run [flags]',
  '',
  '  --dry-run            print the full run sheet and exit; touches nothing',
  '  --list               list the beats (id · window · title)',
  '  --from=<beat-id>     start at a beat (e.g. --from=lena-returns)',
  '  --only=<beat-id>     run exactly one beat',
  '  --include-optional   include beats marked optional (spam b-roll)',
  '',
  '  --post               relay this beat\'s scripted line via the bot (rehearsal only)',
  '  --to=<chat>          with --post, aim somewhere other than DEMO_GROUP_ID',
  '  --skip-preflight     skip the bot/group/admin checks (not advisable)',
  '  --yes                skip confirmation prompts (required when not a TTY)',
];

// --- selection ---------------------------------------------------------------

function selectBeats(): Beat[] {
  const only = argValue('only');
  if (only !== undefined) {
    const beat = BEATS.find((b) => b.id === only);
    if (beat === undefined) failBlock(`No beat called "${only}".`, beatListLines());
    return [beat];
  }

  let beats = BEATS.filter((b) => !b.optional || argFlag('include-optional'));

  const from = argValue('from');
  if (from !== undefined) {
    const index = beats.findIndex((b) => b.id === from);
    if (index === -1) {
      failBlock(`No beat called "${from}" in this run.`, [
        ...(BEATS.some((b) => b.id === from)
          ? ['That beat is marked optional — add --include-optional to reach it.', '']
          : []),
        ...beatListLines(),
      ]);
    }
    beats = beats.slice(index);
  }

  return beats;
}

function beatListLines(): string[] {
  return [
    'Beats:',
    '',
    ...BEATS.map(
      (b) =>
        `  ${b.id.padEnd(16)} ${(b.window || b.phase).padEnd(10)} ${b.title}${b.optional ? ' (optional)' : ''}`,
    ),
  ];
}

// --- rendering ---------------------------------------------------------------

function beatHeader(beat: Beat, index: number, total: number): void {
  const where = beat.window === '' ? beat.phase.toUpperCase() : beat.window;
  process.stdout.write(
    `\n${bold(`[${index}/${total}] ${where}  ${beat.title}`)}` +
      `${beat.caption ? ` ${dim(`— caption: ${beat.caption}`)}` : ''}\n`,
  );
}

function renderBeat(beat: Beat, index: number, total: number): void {
  beatHeader(beat, index, total);

  for (const line of beat.cue) process.stdout.write(`   ${line}\n`);

  if (beat.post) {
    const member = CAST[beat.post.as];
    const target = beat.post.where === 'group' ? "the group" : "Keeper's own chat";
    process.stdout.write(
      `\n   ${cyan('TYPE THIS')} ${dim(`as @${member?.handle ?? beat.post.as} into ${target}:`)}\n\n`,
    );
    process.stdout.write(`   ${beat.post.text}\n`);
  }

  if (beat.expect) {
    const window =
      beat.expect.latency === 'mind'
        ? `${MIND_LATENCY_SECONDS.min}-${MIND_LATENCY_SECONDS.max}s (measured)`
        : 'immediately';
    process.stdout.write(`\n   ${yellow('THEN WAIT')} ${dim(window)}\n`);
    process.stdout.write(`   expect: ${beat.expect.what}\n`);
    process.stdout.write(`   ${dim(`if it does not happen: ${beat.expect.ifItDoesNotHappen}`)}\n`);
  }

  if (beat.screen && beat.screen.length > 0) {
    process.stdout.write(`\n   ${dim('on screen:')}\n`);
    for (const line of beat.screen) process.stdout.write(`   ${dim(`  ${line}`)}\n`);
  }

  if (beat.notes && beat.notes.length > 0) {
    process.stdout.write('\n');
    for (const line of beat.notes) process.stdout.write(`   ${dim(line === '' ? '' : `# ${line}`)}\n`);
  }

  process.stdout.write('\n');
}

function printDryRun(beats: Beat[]): void {
  const estimate = estimateRunSeconds(beats);
  process.stdout.write(
    `\n${bold("Ada's Editing Lab — demo run sheet")}  ${dim(`(${describeDay(today())})`)}\n` +
      `${dim('DRY RUN — nothing is sent, no .env needed, no network used.')}\n`,
  );
  beats.forEach((beat, i) => renderBeat(beat, i + 1, beats.length));

  const mindBeats = beats.filter((b) => b.expect?.latency === 'mind').length;
  process.stdout.write(
    `${dim('—'.repeat(72))}\n` +
      `${bold('Budget:')} ${beats.length} beats · ${mindBeats} of them wait on the Mind\n` +
      `${dim(
        `Allow about ${humanMs(estimate * 1000)} of real time to capture 110 finished seconds, ` +
          `because each Mind reply takes ${MIND_LATENCY_SECONDS.min}-${MIND_LATENCY_SECONDS.max}s ` +
          `(docs/API-NOTES.md, live-verified 2026-08-22).`,
      )}\n` +
      `${dim('Record each segment separately and stitch; keep the raw uncut take (§10).')}\n\n` +
      `${dim('When you are ready for the real thing:  pnpm demo:run')}\n\n`,
  );
}

// --- preflight ---------------------------------------------------------------

async function preflight(config: TelegramConfig): Promise<void> {
  process.stdout.write(`\n${bold('Preflight')}\n`);

  const me = await getMe(config);
  process.stdout.write(`   ${green('ok')}  bot is @${me.username ?? me.id} (id ${me.id})\n`);

  const chat = await getChat(config);
  process.stdout.write(
    `   ${green('ok')}  chat ${chat.id} — ${chat.title ?? '(untitled)'} [${chat.type}]\n`,
  );
  if (chat.type !== 'supergroup') {
    process.stdout.write(
      `   ${yellow('warn')}  chat type is "${chat.type}", not "supergroup". Telegram only gives\n` +
        `         bots full moderation rights in supergroups — convert it before recording.\n`,
    );
  }

  const membership = await getChatMember(config, me.id);
  if (membership.status !== 'administrator' && membership.status !== 'creator') {
    throw new SeederError(`The bot is in the chat as "${membership.status}", not an admin.`, [
      'Keeper cannot delete a spam message or mute anyone without admin rights, so the',
      'moderation beats cannot be recorded.',
      '',
      'Fix: open the group -> Members -> your bot -> Promote to admin, and enable',
      '"Delete messages" and "Ban users". Then re-run.',
    ]);
  }
  const canDelete = membership.can_delete_messages === true;
  const canRestrict = membership.can_restrict_members === true;
  process.stdout.write(
    `   ${canDelete ? green('ok') : yellow('warn')}  can delete messages: ${canDelete}\n` +
      `   ${canRestrict ? green('ok') : yellow('warn')}  can restrict members: ${canRestrict}\n`,
  );
  if (!canDelete) {
    process.stdout.write(
      `   ${dim('         the spam-delete beat will fail without "Delete messages".')}\n`,
    );
  }

  if (config.creatorId === undefined) {
    process.stdout.write(
      `   ${yellow('warn')}  CREATOR_TELEGRAM_ID is not set in .env — the digest-DM beat (75-95s)\n` +
        `         has nowhere to land. Set it, and make sure Ada's account has sent the\n` +
        `         bot /start at least once.\n`,
    );
  } else {
    process.stdout.write(`   ${green('ok')}  creator DM target: ${config.creatorId}\n`);
  }

  process.stdout.write('\n');
}

// --- live --------------------------------------------------------------------

async function runLive(beats: Beat[], config: TelegramConfig): Promise<void> {
  const relay = argFlag('post');

  process.stdout.write(
    `\n${bold("Ada's Editing Lab — LIVE demo run")}  ${dim(`(${describeDay(today())})`)}\n` +
      `${dim(`${beats.length} beats · roughly ${humanMs(estimateRunSeconds(beats) * 1000)} of real time`)}\n`,
  );

  if (relay) {
    process.stdout.write(
      `\n${yellow('--post is on')} ${dim('— scripted lines will be RELAYED by the bot, prefixed with the handle.')}\n` +
        `${dim('   That is one bot identity, not six people, and Telegram does not deliver bot')}\n` +
        `${dim('   messages to other bots — so Keeper will not react to them. Rehearsal only.')}\n`,
    );
    if (!argFlag('yes')) {
      if (!isTty()) failBlock('--post needs confirmation.', ['Re-run with --yes if you meant it.']);
      const ok = await confirmWord(`Relay scripted lines into ${config.chatId}?`, 'relay');
      if (!ok) {
        process.stdout.write(`\n${yellow('cancelled')} ${dim('— nothing was posted.')}\n\n`);
        return;
      }
    }
  }

  for (let i = 0; i < beats.length; i += 1) {
    const beat = beats[i];
    if (beat === undefined) continue;
    renderBeat(beat, i + 1, beats.length);

    if (beat.post && relay && beat.post.where === 'group') {
      const handle = CAST[beat.post.as]?.handle ?? String(beat.post.as);
      const sent = await sendMessage(config, `@${handle}: ${beat.post.text}`);
      process.stdout.write(`   ${green('relayed')} ${dim(`message ${sent.message_id}`)}\n\n`);
    } else if (beat.post) {
      await pressEnter('posted it?');
    } else {
      await pressEnter('ready for the next beat?');
    }

    if (beat.expect?.latency === 'mind') {
      await countdown(
        MIND_LATENCY_SECONDS.max * 1000,
        `Keeper is thinking — measured ${MIND_LATENCY_SECONDS.min}-${MIND_LATENCY_SECONDS.max}s. Keep rolling.`,
      );
      process.stdout.write(`   ${dim('window elapsed. Did it happen?')} ${beat.expect.what}\n`);
      process.stdout.write(`   ${dim(`if not: ${beat.expect.ifItDoesNotHappen}`)}\n`);
      await pressEnter('continue');
    }
  }

  process.stdout.write(
    `\n${green('run complete')} ${dim('— bank the evidence now, while the timestamps are fresh:')}\n` +
      `${dim('   screenshots into docs/EVIDENCE/, and keep the raw uncut take.')}\n\n`,
  );
}

// --- main --------------------------------------------------------------------

runMain(async () => {
  if (argFlag('help')) {
    process.stdout.write(`\n${USAGE.join('\n')}\n\n`);
    return;
  }
  rejectUnknownFlags(KNOWN_FLAGS, USAGE);

  if (argFlag('list')) {
    process.stdout.write(`\n${beatListLines().join('\n')}\n\n`);
    return;
  }

  const beats = selectBeats();

  if (argFlag('dry-run')) {
    printDryRun(beats);
    return;
  }

  const config = loadTelegramConfig({
    chatIdOverride: argValue('to'),
    alternatives: [
      'pnpm demo:run --dry-run    # the whole run sheet, offline, nothing sent',
      'pnpm demo:run --list       # just the beat list',
    ],
  });

  if (!argFlag('skip-preflight')) await preflight(config);
  await runLive(beats, config);
});
