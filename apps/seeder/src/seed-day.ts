/**
 * pnpm seed:day <n> — put sprint day <n> of "Ada's Editing Lab" into the group.
 *
 * Three modes, because there are three honest ways to do this and they are not equal:
 *
 *   (default)   --post   : the bot posts the day's lines itself, paced. Fast, and the
 *                          messages are RELAYED (one bot identity, prefixed with the
 *                          handle). Good for a scratch group and for rehearsing pacing.
 *                          Read the warning it prints before using it on the real group.
 *   --script            : print the day as a copy-paste ritual for the real cast
 *                          accounts. Slower for you, and the only way the Mind ends up
 *                          with real per-member relationships. This is the recommended
 *                          path for the demo group. See apps/seeder/README.md.
 *   --dry-run           : print exactly what would be posted, with the pacing schedule.
 *                          Touches nothing, needs no .env, works offline.
 *
 * Whatever the mode: messages land at the real moment they are sent. Nothing here can
 * set a timestamp, and nothing here should ever be able to (BUILD_PLAN §8).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CAST, DAYS, DAY_NOTES, SILENCE_RULES, type SeedMessage } from './cast.js';
import {
  COMPRESSION,
  describeDay,
  isoDate,
  dateForDay,
  scriptedDaysFor,
  timingOf,
  today,
} from './calendar.js';
import {
  SeederError,
  argFlag,
  argValue,
  bold,
  countdown,
  confirmWord,
  dim,
  failBlock,
  green,
  humanMs,
  isTty,
  naturalDelayMs,
  positionals,
  rejectUnknownFlags,
  runMain,
  yellow,
} from './cli.js';
import { REPO_ROOT, loadTelegramConfig, sendMessage, type TelegramConfig } from './telegram.js';

const FLAGS_WITH_VALUES = ['pace', 'to', 'from'] as const;
const KNOWN_FLAGS = [
  'dry-run',
  'script',
  'post',
  'fast',
  'pace',
  'to',
  'from',
  'yes',
  'raw',
  'anyway',
  'debug',
  'help',
] as const;

const USAGE = [
  'Usage:  pnpm seed:day <n> [flags]',
  '',
  '  --script      print the day as a copy-paste script for the real cast accounts',
  '                (recommended for the demo group — see apps/seeder/README.md)',
  '  --dry-run     print what would be posted + the pacing plan; touches nothing',
  '  --post        post via the bot (this is the default when no mode flag is given)',
  '',
  '  --to=<chat>   post somewhere other than DEMO_GROUP_ID (use a scratch group!)',
  '  --from=<i>    start at message i (1-based) — for resuming a part-posted day',
  '  --fast        2s between messages instead of human pacing (rehearsal only)',
  '  --pace=<sec>  base seconds between messages (default 40, plus length + jitter)',
  '  --raw         post the text without the "@handle:" relay prefix',
  '  --yes         skip the confirmation prompt (required when not a TTY)',
  '  --anyway      post a day whose real date is not today (say why to yourself first)',
];

const LOG_PATH = join(REPO_ROOT, 'var', 'seed-log.jsonl');

interface LogEntry {
  day: number;
  index: number;
  handle: string;
  chatId: string;
  messageId: number;
  postedAt: string;
  relayPrefix: boolean;
}

function readLog(): LogEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  const out: LogEntry[] = [];
  for (const line of readFileSync(LOG_PATH, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      out.push(JSON.parse(line) as LogEntry);
    } catch {
      // A corrupt line is not worth failing a recording day over.
    }
  }
  return out;
}

function appendLog(entry: LogEntry): void {
  mkdirSync(join(REPO_ROOT, 'var'), { recursive: true });
  appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
}

// --- day selection ----------------------------------------------------------

function availableDays(): number[] {
  return Object.keys(DAYS)
    .map(Number)
    .sort((a, b) => a - b);
}

function resolveDay(): { day: number; script: SeedMessage[] } {
  const [arg] = positionals(FLAGS_WITH_VALUES);
  const days = availableDays();

  if (arg === undefined) {
    failBlock('Which day?', [
      USAGE[0] ?? '',
      '',
      `Scripted days: ${days.join(', ')}`,
      `Today is ${describeDay(today())}.`,
      '',
      ...USAGE.slice(1),
    ]);
  }

  const day = Number(arg);
  if (!Number.isInteger(day) || day < 1) {
    failBlock(`"${arg}" is not a day number.`, [
      'Days are integers counted from Aug 24 (day 1).',
      `Scripted days: ${days.join(', ')}`,
    ]);
  }

  // A real sprint day carries one or more scripted days (calendar.ts COMPRESSION): the
  // group opened Aug 24, not Aug 20, so the seven-day script is posted across three real
  // days rather than backdated. See the DAY_ONE comment for why backfilling is not an option.
  const scripted = scriptedDaysFor(day);
  const script = scripted.flatMap((n) => DAYS[n] ?? []);
  if (script.length === 0) {
    failBlock(`No script for real sprint day ${day}.`, [
      `Real sprint days: ${Object.keys(COMPRESSION).join(', ')} (day ${day} would be ${isoDate(dateForDay(day))}).`,
      `Scripted days available in cast.ts: ${days.join(', ')}.`,
      '',
      'Add one in apps/seeder/src/cast.ts — and keep it short. The point is real elapsed',
      'days, not volume: five lines a day is plenty.',
    ]);
  }

  return { day, script };
}

// --- integrity guards -------------------------------------------------------

/**
 * Stops a data-entry mistake from quietly killing a demo beat. If Lena ever appears in a
 * day-3+ script, the returning-member beat is dead and you would find out on camera.
 */
function assertSilenceRules(day: number, script: SeedMessage[]): void {
  for (const rule of SILENCE_RULES) {
    if (day < rule.fromDay) continue;
    if (!script.some((m) => m.from === rule.member)) continue;
    failBlock(`@${rule.member} must not post on day ${day}.`, [
      rule.why,
      '',
      `Remove @${rule.member} from DAYS[${day}] in apps/seeder/src/cast.ts, or change the`,
      'rule in SILENCE_RULES if the demo plan genuinely changed.',
    ]);
  }
}

function guardDate(day: number): void {
  const timing = timingOf(day);
  if (timing === 'today' || argFlag('anyway')) return;

  const realDate = isoDate(dateForDay(day));
  const lines =
    timing === 'future'
      ? [
          `Day ${day} is ${realDate}. That is not today.`,
          '',
          'Posting it now would put day-' + day + ' content on an earlier real date, so the',
          'group\'s visible history would stop matching the story we tell judges.',
        ]
      : [
          `Day ${day} was ${realDate}. That is in the past.`,
          '',
          'Posting it now stamps it with TODAY\'s time — it does not backdate, and it cannot.',
          'The group would show a day-' + day + ' conversation happening days late.',
        ];

  failBlock(`Day ${day} is not today's script.`, [
    ...lines,
    '',
    `Today is ${describeDay(today())}.`,
    '',
    'If you have thought about it and still want to, re-run with --anyway.',
    'Nothing in this tool can fake a timestamp, so the worst case is honest but wrong.',
  ]);
}

function warnIfAlreadyPosted(day: number): { posted: number } {
  const entries = readLog().filter((e) => e.day === day);
  if (entries.length > 0) {
    process.stdout.write(
      `${yellow('note')} ${dim(
        `var/seed-log.jsonl says ${entries.length} message(s) of day ${day} were already posted ` +
          `(last: ${entries[entries.length - 1]?.postedAt ?? '?'}). Use --from=${entries.length + 1} to resume.`,
      )}\n\n`,
    );
  }
  return { posted: entries.length };
}

// --- rendering --------------------------------------------------------------

function header(day: number): void {
  // The real day carries several scripted days, so derive the cast from the merged script
  // — reading DAYS[day] here would name the wrong people (and hide a silence-rule break).
  const script = scriptedDaysFor(day).flatMap((n) => DAYS[n] ?? []);
  const handles = [...new Set(script.map((m) => `@${CAST[m.from]?.handle ?? m.from}`))];
  process.stdout.write(
    `\n${bold(`Ada's Editing Lab — ${describeDay(day)}`)}\n` +
      `${dim(`Accounts in today's script: ${handles.join(', ')}`)}\n`,
  );
  const note = scriptedDaysFor(day)
    .map((n) => DAY_NOTES[n])
    .filter((x): x is string => x !== undefined)
    .join('\n\n      ');
  if (note) process.stdout.write(`\n${bold('NOTE:')} ${note}\n`);
  process.stdout.write('\n');
}

function renderLine(index: number, msg: SeedMessage, prefix = ''): string {
  const member = CAST[msg.from];
  const handle = member?.handle ?? String(msg.from);
  const out = [`${bold(`${index}. @${handle}`)} ${dim(`(${member?.display ?? '?'})`)}`];
  out.push(`   ${prefix}${msg.text}`);
  if (msg.beat) out.push(`   ${dim(`why: ${msg.beat}`)}`);
  return out.join('\n');
}

function printScriptMode(day: number, script: SeedMessage[]): void {
  header(day);
  process.stdout.write(
    `${dim('Post these in order, from the real cast accounts, a few minutes apart.')}\n\n`,
  );
  script.forEach((msg, i) => process.stdout.write(`${renderLine(i + 1, msg)}\n\n`));
  process.stdout.write(
    `${dim('After posting, screenshot the group into docs/EVIDENCE/ — timestamps are the evidence.')}\n\n`,
  );
}

function printDryRun(day: number, script: SeedMessage[], opts: PaceOptions): void {
  header(day);
  process.stdout.write(`${bold('DRY RUN')} ${dim('— nothing is sent, no .env needed.')}\n\n`);

  // The wait BEFORE a message is derived from that message's own text — exactly what the
  // posting loop does — so this schedule is a real preview, not a second guess at it.
  let cumulative = 0;
  script.forEach((msg, i) => {
    if (i > 0) cumulative += naturalDelayMs(msg.text, opts);
    const stamp = i === 0 ? 'now' : `+${humanMs(cumulative)}`;
    process.stdout.write(`${dim(stamp.padStart(8))}  ${renderLine(i + 1, msg, prefixFor(msg, opts))}\n\n`);
  });

  process.stdout.write(
    `${dim(`${script.length} messages, about ${humanMs(cumulative)} from first to last at this pacing.`)}\n`,
  );
  process.stdout.write(
    `${dim(`Target chat: ${argValue('to') ?? 'DEMO_GROUP_ID from .env'} · pacing: ${describePacing(opts)}`)}\n\n`,
  );
  process.stdout.write(
    `${dim('To post for real: drop --dry-run. To post from the real cast accounts: --script.')}\n\n`,
  );
}

// --- pacing -----------------------------------------------------------------

interface PaceOptions {
  baseSeconds?: number | undefined;
  fast?: boolean;
  raw: boolean;
}

function readPaceOptions(): PaceOptions {
  const raw = argValue('pace');
  let baseSeconds: number | undefined;
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      failBlock(`--pace=${raw} is not a number of seconds.`, ['Example:  --pace=15']);
    }
    baseSeconds = parsed;
  }
  return { baseSeconds, fast: argFlag('fast'), raw: argFlag('raw') };
}

function describePacing(opts: PaceOptions): string {
  if (opts.fast) return 'fast (2s flat — rehearsal only)';
  return `${opts.baseSeconds ?? 40}s base + length + jitter`;
}

function prefixFor(msg: SeedMessage, opts: PaceOptions): string {
  if (opts.raw) return '';
  return `@${CAST[msg.from]?.handle ?? String(msg.from)}: `;
}

// --- posting ----------------------------------------------------------------

function relayWarning(config: TelegramConfig): string[] {
  return [
    'RELAY MODE — read this once, then decide:',
    '',
    '  1. Every line below is posted by ONE bot account, not by six people. To the Mind',
    '     that is one member talking, not six relationships. The per-member memory the',
    '     whole demo rests on does not get built this way.',
    '',
    '  2. Telegram does not deliver messages from one bot to another bot. If Keeper\'s',
    '     connector is running on a different bot token, it will never see these lines',
    '     at all — and if it is the same bot, a bot never receives its own messages.',
    '     Either way the Steward Mind learns nothing from a relayed day.',
    '',
    '  So: use this for a scratch group (--to=<id>), for rehearsing pacing, or for',
    '  filling a group with visual backdrop. For the history the demo is built on,',
    '  use --script and post from the real cast accounts.',
    '',
    `  Target chat: ${config.chatId}${config.chatIdIsOverride ? ' (from --to)' : ' (DEMO_GROUP_ID)'}`,
  ];
}

async function postDay(day: number, script: SeedMessage[], opts: PaceOptions): Promise<void> {
  guardDate(day);

  const config = loadTelegramConfig({
    chatIdOverride: argValue('to'),
    alternatives: [
      `pnpm seed:day ${day} --script     # the copy-paste ritual for the real cast accounts`,
      `pnpm seed:day ${day} --dry-run    # see exactly what would be posted, offline`,
    ],
  });

  header(day);
  const { posted } = warnIfAlreadyPosted(day);

  const fromArg = argValue('from');
  const startIndex = fromArg === undefined ? 0 : Number(fromArg) - 1;
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= script.length) {
    failBlock(`--from=${fromArg} is out of range.`, [
      `Day ${day} has ${script.length} messages, so --from must be between 1 and ${script.length}.`,
    ]);
  }
  const queue = script.slice(startIndex);

  printBlockPlain(relayWarning(config));
  process.stdout.write(
    `${dim(`${queue.length} message(s), pacing: ${describePacing(opts)}`)}\n\n`,
  );

  if (!argFlag('yes')) {
    if (!isTty()) {
      failBlock('Refusing to post without confirmation.', [
        'This run is not attached to a terminal, so it cannot ask you to confirm.',
        '',
        `Re-run with --yes if you meant it:   pnpm seed:day ${day} --yes`,
      ]);
    }
    const ok = await confirmWord(`Post ${queue.length} message(s) to ${config.chatId}?`, 'post');
    if (!ok) {
      process.stdout.write(`\n${yellow('cancelled')} ${dim('— nothing was posted.')}\n\n`);
      return;
    }
    process.stdout.write('\n');
  }

  for (let i = 0; i < queue.length; i += 1) {
    const msg = queue[i];
    if (msg === undefined) continue;
    const index = startIndex + i + 1;
    const text = `${prefixFor(msg, opts)}${msg.text}`;

    try {
      const sent = await sendMessage(config, text);
      appendLog({
        day,
        index,
        handle: CAST[msg.from]?.handle ?? String(msg.from),
        chatId: config.chatId,
        messageId: sent.message_id,
        postedAt: new Date().toISOString(),
        relayPrefix: !opts.raw,
      });
      const at = new Date(sent.date * 1000).toLocaleTimeString();
      process.stdout.write(
        `${green('sent')} ${dim(`${index}/${script.length}`)} ${bold(`@${CAST[msg.from]?.handle ?? ''}`)} ` +
          `${dim(`msg ${sent.message_id} at ${at}`)}\n       ${msg.text}\n`,
      );
    } catch (error) {
      if (error instanceof SeederError) {
        throw new SeederError(error.title, [
          ...error.hint,
          '',
          `Posted ${i} of ${queue.length} message(s) before this failed.`,
          `Resume with:  pnpm seed:day ${day} --from=${index}`,
        ]);
      }
      throw error;
    }

    const isLast = i === queue.length - 1;
    if (!isLast) {
      const nextText = queue[i + 1]?.text ?? '';
      await countdown(naturalDelayMs(nextText, opts), `next message (@${CAST[queue[i + 1]?.from ?? 'ada_edits']?.handle ?? ''})`);
    }
  }

  process.stdout.write(
    `\n${green('done')} ${dim(`day ${day} posted. Screenshot the group into docs/EVIDENCE/ — timestamps are the evidence.`)}\n\n`,
  );
}

function printBlockPlain(lines: string[]): void {
  process.stdout.write(`${lines.map((l) => (l === '' ? '' : `  ${l}`)).join('\n')}\n\n`);
}

// --- main -------------------------------------------------------------------

runMain(async () => {
  if (argFlag('help')) {
    process.stdout.write(`\n${USAGE.join('\n')}\n\n`);
    return;
  }
  rejectUnknownFlags(KNOWN_FLAGS, USAGE);

  const { day, script } = resolveDay();
  assertSilenceRules(day, script);
  const opts = readPaceOptions();

  if (argFlag('script')) {
    printScriptMode(day, script);
    return;
  }
  if (argFlag('dry-run')) {
    printDryRun(day, script, opts);
    return;
  }
  await postDay(day, script, opts);
});
