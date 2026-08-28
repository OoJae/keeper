# Keeper — a persistent Community Steward, powered by a Mind

> Every creator community, run like a relationship — not a rulebook.

Keeper lives in a creator's Telegram community and remembers every member as an ongoing
relationship: when they joined, what they care about, what they've contributed, what
question of theirs is still hanging. It moderates by reading intent and history instead of
keywords, and it acts on its own — welcoming newcomers and checking back the next day,
greeting returning members by picking up exactly where their last conversation died,
sending the creator a nightly digest, and nominating contributors for rewards.

**The persistence is not ours.** Keeper's memory lives in the long-term memory of a
[Mind](https://www.hellominds.ai) — an always-on cloud AI agent with its own identity,
memory, and on-chain wallet. Our code is plumbing: it wraps community events in an
envelope, hands them to the Mind, and executes the structured directive that comes back.
Delete our database and Keeper still remembers everyone.

Built for **Creative Minds Jam #1: Hong Kong** (Track 3 — Moderation & Community
Assistance) by a solo student builder.

## What it actually does, and what it doesn't

Keeper has been running in a real Telegram group since 2026-08-24, on real elapsed days.

**Working, with timestamped evidence:**

- **Remembers members across sessions.** Asked from a conversation it had never used, 52 hours
  after her last message, the Mind returned Lena's join date, her CapCut→Premiere switch, her
  export-stutter question and the proxy exchange with its timestamp — and held her two Telegram
  ids as one person. → [memory-continuity.md](docs/EVIDENCE/memory-continuity.md)
- **Tracks open loops and resumes them.** Unprompted, it listed three unresolved threads with
  that member and named the live one. No code computes this; there is no open-loops table.
- **Acts without being asked.** Nightly digests, newcomer welcomes, next-day check-ins, an
  at-risk radar — fired on the Mind's own initiative, not on a cron we wrote.
  → [autonomy-digest.md](docs/EVIDENCE/autonomy-digest.md)
- **Moderates on context, not keywords.** 10/10 on a scripted judgment test including cases a
  keyword bot gets wrong in both directions. → [judgment-test.md](docs/EVIDENCE/judgment-test.md)
- **Stays overridable.** `/keeper undo` reversed a live action 17 minutes after it posted, and
  the log records both moments. → [override.md](docs/EVIDENCE/override.md)
- **Talks to a second Mind.** Steward and Rewards are in a reciprocal Circle, added over the
  API — which the public docs say is for humans only.

**Not working, and why:**

- **No on-chain reward was issued.** The Rewards Mind has a funded wallet on Base, but every
  tool that can move value refuses at the *equip* step: *"You are not allowed to equip this tool
  until your steward has paid for cognition beyond any initial free cognition credits."* Two
  US$10 purchases did not lift it. No transaction was ever constructed, so there is no hash to
  show and we do not pretend otherwise. Rewards are autonomous **nominations** the creator
  approves. Details, with the full transcript: [API-NOTES.md](docs/API-NOTES.md).

## See it

- **Site:** <https://site-six-wheat-17.vercel.app> — start here. The landing page is a corridor of real
  messages hung in time; you traverse the 52-hour silence before the thread reassembles.
- **Dashboard:** <https://dashboard-chi-one-92.vercel.app> — the relationship graph, what the
  Mind remembers about each member in its own words, the moderation log with its reasoning, and
  everything Keeper did unprompted.
- **API:** <https://connector-production-b5e9.up.railway.app/api/members> — the same data, raw.

The deployed connector runs in `api-only` mode: it serves the mirror but does **not** run the
Telegram bot, because the bot holds a long-poll and two of them split updates unpredictably.
So the public dashboard is a window onto a live system, not a second copy of it, and it says so.

## The site

`apps/site` is Keeper's public face — brand assets and six pages, built from the same real record
as everything else. Its signature is **the Corridor of Days**: scroll is time, cards hang in
Z-space at their true timestamps, and the 52-hour silence between Lena's last message and her
return is something you physically traverse before the retrieved thread assembles beside Keeper's
reply.

Live at <https://site-six-wheat-17.vercel.app>; the design system is documented at
[`/brand`](https://site-six-wheat-17.vercel.app/brand). Locally: `pnpm dev:site` → <http://localhost:3200>.

Live task state: [docs/TASKS.md](docs/TASKS.md). Rubric-by-rubric verification:
**[docs/MINDS-INTEGRATION.md](docs/MINDS-INTEGRATION.md)** — start there.

## Repo layout

```
apps/connector    Telegram bot (grammY), event router, directive executor, SQLite mirror,
                  and the dashboard API (src/api/) incl. the public-view redaction layer
apps/dashboard    Next.js dashboard — relationship graph, member timelines, moderation log
apps/seeder       Demo cast + dated event replay + scenario runner
packages/protocol Member Identity Envelope + KEEPER-ACTION directive (zod, tested)
packages/minds-client  Adapter over the Minds Messaging API (+ fallback transport)
docs/             Build plan, architecture, verified API notes, audit, evidence
```

## Quickstart

Node 20+ and pnpm. Nothing below needs a Telegram group or a Minds key except where it says so.

```bash
pnpm install
pnpm test          # 283 unit tests — no key, no network, no group needed
pnpm typecheck
```

To run it against your own Mind and community:

```bash
cp .env.example .env      # every key is documented in there
pnpm spike:api-smoke      # proves your key, the transport and a real Mind reply end-to-end
pnpm teach:charter        # teach the Steward Mind its role (docs/STEWARD-CHARTER.md, verbatim)
pnpm dev:connector        # the bot + the dashboard API on :4000
```

Then, in a second terminal:

```bash
pnpm dashboard:recall     # ask the Mind what it remembers about each member (25–200s each)
pnpm dev:dashboard        # http://localhost:3000
```

**On the API.** Read endpoints are public by design — the moderation log is meant to be looked
at — and real accounts are pseudonymised before anything leaves the process
(`apps/connector/src/api/redact.ts`). The single write, `POST /api/actions/:id/undo`, needs
`KEEPER_ADMIN_TOKEN`. **Leave that unset and writes are refused outright**: the safe state is the
default rather than something to remember to switch on. `/keeper undo` in Telegram works either
way.

Useful while running: `/keeper status`, `/keeper why`, `/keeper undo`, `/keeper pause`.

## Documentation

- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — phases, calendar, demo script, submission plan
- [docs/STRATEGY.md](docs/STRATEGY.md) — why Keeper, and why this track
- [docs/API-NOTES.md](docs/API-NOTES.md) — **verified** Minds platform behavior
- [docs/TASKS.md](docs/TASKS.md) — live task tracker
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, deployment topology, redaction boundary
- [docs/AUDIT.md](docs/AUDIT.md) — adversarial review: what was found, fixed, and left
- [docs/DEMO-SCRIPT.md](docs/DEMO-SCRIPT.md) — the shooting script, grounded in real timestamps

## Note on the demo community

The demo community ("Ada's Editing Lab") is a **fictional cast in a private group**. The
cast is invented; the persistence is real — real elapsed days, real cross-session memory,
real unprompted messages, real timestamps. Nothing in the demo is staged after the fact.
