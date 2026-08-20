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

## Status

🚧 Day 1 of an 8-day sprint. Scaffold + protocol + Minds adapter + Phase 0 spike harness
are in; the connector core loop is next. See [docs/TASKS.md](docs/TASKS.md).

## Repo layout

```
apps/connector    Telegram bot (grammY), event router, directive executor, SQLite mirror
apps/dashboard    Next.js dashboard (Phase 6)
apps/seeder       Demo cast + dated event replay + scenario runner
packages/protocol Member Identity Envelope + KEEPER-ACTION directive (zod, tested)
packages/minds-client  Adapter over the Minds Messaging API (+ fallback transport)
docs/             Build plan, strategy, verified API notes, evidence
```

## Quickstart

```bash
pnpm install
cp .env.example .env      # fill in — see the comments in that file
pnpm test                 # protocol unit tests
pnpm spike:api-smoke      # verify the Minds API end-to-end with your key
```

## Documentation

- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) — phases, calendar, demo script, submission plan
- [docs/STRATEGY.md](docs/STRATEGY.md) — why Keeper, and why this track
- [docs/API-NOTES.md](docs/API-NOTES.md) — **verified** Minds platform behavior
- [docs/TASKS.md](docs/TASKS.md) — live task tracker

## Note on the demo community

The demo community ("Ada's Editing Lab") is a **fictional cast in a private group**. The
cast is invented; the persistence is real — real elapsed days, real cross-session memory,
real unprompted messages, real timestamps. Nothing in the demo is staged after the fact.
