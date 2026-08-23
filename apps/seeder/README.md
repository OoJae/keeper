# apps/seeder — the demo harness

Two commands:

```bash
pnpm seed:day <n>     # put sprint day <n> of "Ada's Editing Lab" into the group
pnpm demo:run         # stage the 110-second demo, beat by beat (BUILD_PLAN §10)
```

Both take `--dry-run`, which prints exactly what would happen and touches nothing — no
`.env`, no network, no Telegram. Start there.

```bash
pnpm seed:day 4 --dry-run     # today's script + the pacing schedule
pnpm seed:day 4 --script      # the same day as a copy-paste ritual for the cast accounts
pnpm demo:run --dry-run       # the full run sheet, with the real waiting times
pnpm demo:run --list          # just the beat names
pnpm seed:day --help          # flags
```

Sprint day 1 is **2026-08-20**, the day the group opened. Day 4 is Aug 23, day 7 (recording
day) is Aug 26. `apps/seeder/src/calendar.ts` owns that mapping.

---

## The cast is fictional. The timestamps are real.

"Ada's Editing Lab" is a simulated community: Ada, Marco, Lena, Rex, the dropshipper and
Kai are invented, and the group is private. That is stated here, in the repo README, and in
the submission.

What is **not** simulated is the thing the judges are actually scoring. Marco really has
been answering people since Aug 20. Lena really did ask about choppy exports on Aug 21 and
really did go quiet afterwards. When Keeper picks that thread back up on camera on Aug 26,
it is genuinely reaching across five real days of its own memory.

So the one rule in this directory:

> **Nothing here can set a timestamp, and nothing here ever should.**

Telegram stamps every message server-side when it is sent. There is no backdating flag in
this code because there is no backdating flag in Telegram, and we would not want one —
BUILD_PLAN §8 forbids faking a timestamp, and the whole demo is worth more without it. The
cost is real: a day you skip is gone. `seed:day` therefore refuses to post a day whose real
date is not today unless you pass `--anyway`, and tells you what you would be distorting.

Two more guards, for the same reason:

- **`SILENCE_RULES` (`src/cast.ts`)** — Lena must not post after day 2 and Kai must not be
  in the group before the live join. `seed:day` refuses to post a day that breaks either.
  One stray line from Lena's account on day 5 would quietly kill the highest-scoring 25
  seconds of the video, and you would find out while recording.
- **`var/seed-log.jsonl`** — every relayed message is logged, so a day you already posted
  says so instead of being silently duplicated (`--from=<i>` resumes a part-posted day).

---

## How one person drives six community members

This is the real logistical problem of the demo, and it has no elegant answer. A Telegram
account has exactly one user id, and Keeper's memory is keyed on that id — so two cast
members sharing an account are **one person** to the Mind, which breaks the exact thing we
are demonstrating. Four honest options:

### 1. One real account per handle — recommended, and what the demo is built for

Six Telegram accounts, six phone numbers. Painful, and the only option that produces six
genuine relationships in the Mind's memory.

It is less hardware than it sounds: the Telegram mobile app holds several accounts at once
(three on older versions, more on recent ones) and Telegram Desktop does too. One phone
plus one laptop can comfortably drive the whole cast — you are switching profiles, not
juggling six devices. During recording, keep Lena and Rex on the *phone* (they post the two
live beats and it reads better on camera than alt-tabbing).

**Tradeoff:** an hour of setup and six numbers. **Buys:** every rubric beat, honestly.

### 2. Fewer accounts — cut the cast, do not double up

If you cannot get six numbers, drop cast members rather than sharing accounts.
`MINIMUM_CAST` in `src/cast.ts` is the order to cut in: Ada, Marco, Lena and Rex buy
memory, continuity, contextual moderation and the reward nomination. Dropping
`@dr0pshipper_99` costs a b-roll shot (any handle can drop a spam link). Dropping
`@new_kid_kai` costs the live-join welcome, which the day-2 check-in screenshots can carry
instead.

**Tradeoff:** a thinner community. **Buys:** honesty, and every beat that scores.

### 3. Bot relay — `pnpm seed:day <n>` (the default `--post` mode)

The bot posts the day's lines itself, paced, prefixed with `@handle:`. Zero accounts,
30 seconds of work. It is in the box because rehearsing pacing is worth something, and
because filling a *scratch* group (`--to=<chat_id>`) is how you test this tool without
touching the demo group.

Do not mistake it for seeding. Two things are wrong with it, and the command prints both
before it posts anything:

1. Six handles become one bot identity. The Mind sees one member, not six.
2. **Telegram does not deliver messages from one bot to another bot**, and a bot never
   receives its own messages. Keeper's connector will not see a single relayed line, so the
   Steward Mind learns nothing from a relayed day — the group merely *looks* populated.

**Tradeoff:** costs nothing, teaches the Mind nothing. Rehearsal and scratch groups only.

### 4. MTProto user sessions (gramjs / Telethon) — deliberately not built

You can log into real user accounts programmatically and post as them: real ids, real
handles, real relationships, fully automated. It is the only automation that would actually
seed the Mind.

**Tradeoff:** an `api_id`/`api_hash` and an SMS login code per account, a new dependency,
and automating user accounts risks those numbers being limited or banned — mid-hackathon,
with the demo group inside them. That is a bad trade four days from submission. Option 1
plus ten minutes a day is cheaper and cannot lose the account. Revisit after Aug 27 if
Keeper becomes a product.

---

## The daily ritual (ten minutes)

```bash
pnpm seed:day <today's day> --script   # then post the lines from the cast accounts
```

Post in order, a few minutes apart. Read the `NOTE:` first — it usually says what *not* to
do (day 2: do not answer Lena; day 6: post the spam and leave it alone). Then screenshot
anything Keeper did into `docs/EVIDENCE/` with timestamps visible.

If you would rather have the pacing driven for you, `--dry-run` prints the schedule, and
`--post --to=<scratch group>` will run it against a group that is not the demo.

## Recording day (Aug 26, sprint day 7)

```bash
pnpm demo:run --dry-run    # read the whole run sheet first, out loud
pnpm demo:run              # preflight, then beat by beat
```

Live mode first checks the boring things that ruin takes: the bot token works, the group is
reachable, the bot is an admin that can delete messages, and `CREATOR_TELEGRAM_ID` is set so
the digest DM has somewhere to land. Then it walks the beats, shows you the exact line to
type and from which account, and waits.

**It never triggers Keeper.** The 30–55s and 75–95s beats are only worth something if
Keeper acted unprompted, so during those the runner counts down and keeps its hands off.
A measured Mind round-trip is **23–66 seconds** (`docs/API-NOTES.md`, live-verified
2026-08-22), so the runner budgets the worst case and tells you to keep rolling through the
silence: the unbroken shot of nobody typing is what proves the action was unprompted. Expect
roughly **7–8 real minutes** to capture 110 finished seconds. Record segments separately and
stitch, exactly as BUILD_PLAN §10 says.

## Files

| File | What it holds |
|---|---|
| `src/cast.ts` | the cast, the scripted days, the day notes, `SILENCE_RULES` |
| `src/calendar.ts` | sprint day ↔ real date, and the no-backdating guard |
| `src/demo-script.ts` | the §10 beats: cues, lines, what to expect, what to do if it fails |
| `src/seed-day.ts` | `pnpm seed:day` |
| `src/demo-run.ts` | `pnpm demo:run` |
| `src/telegram.ts` | config + Bot API client (every error carries its own fix) |
| `src/cli.ts` | args, colours, pacing, prompts, and the no-stack-traces rule |
