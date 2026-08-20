/**
 * pnpm seed:day <n> — prints the posting script for sprint day <n>.
 *
 * This deliberately does NOT post for you. The cast members are human accounts: a
 * Telegram bot cannot post as a user, and messages from other *bots* are invisible to
 * our bot (Telegram's anti-loop rule), so bot-posted cast lines would never reach
 * Keeper at all. Seeding is therefore a human copy-paste ritual — 10 minutes a day.
 */
import { CAST, DAYS, DAY_NOTES, type SeedMessage } from './cast.js';

const BOLD = '[1m';
const DIM = '[2m';
const RESET = '[0m';

function usage(): never {
  const available = Object.keys(DAYS).join(', ');
  console.error(`Usage: pnpm seed:day <n>\n\nScripted days available: ${available}`);
  process.exit(2);
}

const arg = process.argv[2];
if (!arg) usage();

const day = Number(arg);
if (!Number.isInteger(day)) usage();

const script: SeedMessage[] | undefined = DAYS[day];
if (!script) {
  console.error(
    `No script for day ${day}. Scripted days: ${Object.keys(DAYS).join(', ')}\n` +
      `Add one in apps/seeder/src/cast.ts — and keep it short; the point is real elapsed time, not volume.`,
  );
  process.exit(2);
}

const handles = [...new Set(script.map((m) => `@${CAST[m.from]!.handle}`))];

console.log(`\n${BOLD}Ada's Editing Lab — day ${day} posting script${RESET}`);
console.log(`${DIM}Post these in order, a few minutes apart, in the demo group.${RESET}`);
console.log(`${DIM}Accounts needed today (one Telegram account each): ${handles.join(', ')}${RESET}\n`);

const note = DAY_NOTES[day];
if (note) console.log(`${BOLD}NOTE:${RESET} ${note}\n`);

script.forEach((msg, i) => {
  const member = CAST[msg.from]!;
  console.log(`${BOLD}${i + 1}. @${member.handle}${RESET} ${DIM}(${member.display})${RESET}`);
  console.log(`   ${msg.text}`);
  if (msg.beat) console.log(`   ${DIM}why: ${msg.beat}${RESET}`);
  console.log('');
});

console.log(`${DIM}After posting, screenshot the group into docs/EVIDENCE/ — timestamps are the evidence.${RESET}\n`);
