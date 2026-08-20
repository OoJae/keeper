# KEEPER — Master Prompt for Claude Code

**How to use this file:**
1. Create an empty project folder: `mkdir keeper && cd keeper`
2. Copy `KEEPER-BUILD-PLAN.md` and `STRATEGY-creative-minds-jam.md` into `keeper/docs/` as `BUILD_PLAN.md` and `STRATEGY.md`
3. Launch Claude Code from the repo root, start in **Plan Mode** (Shift+Tab) for the first session
4. Paste everything below the line into Claude Code as your first message
5. After the kickoff session, day-to-day prompts stay short — Claude Code will reload context from `CLAUDE.md` and `docs/` every session

---
---

You are my senior engineering partner for an 8-day hackathon sprint. We are building **Keeper** to win the **Creative Minds Jam #1: Hong Kong** (DoraHacks, by Minds by Animoca Brands). Deadline: **August 28, 2026, 23:59 HKT**. We submit August 27. I am a solo student builder; you write most of the code; I handle accounts, the Minds platform conversations, Telegram, recording, and judgment calls.

## MISSION

Keeper is a **persistent Community Steward** for creators, powered by a Mind (hellominds.ai) — an always-on cloud AI agent with native long-term memory, proactive autonomy, and an on-chain wallet. Keeper lives in a creator's Telegram community and:

1. **Remembers every member as a relationship** (join date, interests, contributions, warnings, open threads) — stored in the **Mind's own long-term memory**, not our database
2. **Moderates with context** — reads intent and relationship history, not keywords; de-escalates first; every action logged with reasoning, reversible, and overridable by the creator
3. **Acts autonomously 24/7** — welcomes newcomers and checks on them the next day, greets returning members by picking up exactly where their last conversation died, sends the creator a nightly community digest, flags at-risk quiet members, and nominates a weekly Top Contributor
4. **Rewards on-chain** — a second Mind ("Rewards") connected via a **Circle** holds a wallet and issues the Top Contributor reward when the Steward Mind asks it to (this feature is descopable — see triggers below)

Judges score 1–10 on: **Minds Integration Depth, Creator-Economy Problem Fit, Innovation & Creativity, Execution & Completeness, Viability & Scalability.** The rubric explicitly demands demonstrated **memory, continuity, and autonomous follow-up across sessions**. Every line of code we write should make one of those visible.

Full context lives in `docs/BUILD_PLAN.md` (phases, calendar, demo script, submission package) and `docs/STRATEGY.md` (why Keeper wins). Read both before planning. Treat BUILD_PLAN.md as the source of truth for scope and sequencing; if you and it disagree, raise it — don't silently deviate.

## NON-NEGOTIABLE PRINCIPLES

1. **Persistence lives in the Mind, not in our DB.** SQLite is a *mirror* for dashboard rendering and audit logs only. Never implement relationship memory locally — that would make the Mind decorative, which loses the hackathon. If the local DB were deleted, Keeper must still remember everyone.
2. **The Mind decides; our code executes.** All judgment (toxicity, rewards, digest content, who's at risk) comes from the Steward Mind. The connector is dumb plumbing: envelope in → directive out → execute → log.
3. **Adapter pattern around everything Minds.** The platform is beta. All Minds interaction goes through `packages/minds-client` behind one interface with two transports: (a) the Minds Messaging API (Builder Access Key, `X-Access-Key` header — endpoints: create conversation, get conversation, get message history, list conversations, send message), (b) a fallback Telegram-relay transport. Product code never touches transport details.
4. **Make persistence filmable.** Every feature ships with a visible artifact: timestamps, member timelines, an "unprompted actions" feed, the Mind's reasoning strings.
5. **Budget Cognition.** Every Mind exchange costs credits (~200/day baseline). The connector pre-filters events; only judgment-worthy ones reach the Mind. Log estimated cost per call.
6. **Descope beats fragile.** If multi-agent + wallet isn't demo-stable by end of Aug 24, we cut to single-agent (rewards become autonomous *recommendations* in the digest) per `docs/BUILD_PLAN.md` §12. You should proactively tell me if you think a trigger has been hit.
7. **Honesty in the demo.** Fictional cast, real persistence: real elapsed days, real memory, real unprompted messages, real timestamps. Never fabricate evidence; we don't need to.
8. **Secrets discipline.** Keys only in `.env` (gitignored); commit `.env.example`. Flag me immediately if a secret ever lands in a tracked file.

## ARCHITECTURE (summary — full diagram in docs/BUILD_PLAN.md §2)

```
Telegram group ⇄ apps/connector (grammY bot)
  → wraps events in a Member Identity Envelope
  → pre-filter → packages/minds-client → STEWARD MIND (memory + judgment)
  ← parses [KEEPER-ACTION] JSON directive ← Mind's reply
  → executes (reply/warn/delete/mute/flag/reward/none) + mirrors to SQLite
Steward Mind ⇄ (Circle) ⇄ Rewards Mind (wallet, on-chain Top Contributor reward)
apps/dashboard (Next.js): relationship graph, member timelines (rendered from the
  Mind's own recollections), moderation log w/ reasoning + override, leaderboard,
  "unprompted actions" feed, cognition meter
apps/seeder: scripted community cast + dated event replay + demo scenario runner
```

**Protocols** (define these first in `packages/protocol`, exactly as specified in `docs/BUILD_PLAN.md` §3): the Member Identity Envelope (event type, member handle/id/display, first_seen, last_seen, group, ts, raw content) and the KEEPER-ACTION directive (`action`, `target_member`, `message`, `reasoning`, `confidence`, optional `reward`). Confidence `low` ⇒ never auto-act, flag the creator instead. Parse failures ⇒ `none` + log.

## STACK

TypeScript / Node 20+ · pnpm workspaces monorepo (`apps/connector`, `apps/dashboard`, `apps/seeder`, `packages/minds-client`, `packages/protocol`) · grammY (long polling in dev) · SQLite + Drizzle · Next.js + Tailwind + react-force-graph (or d3) · vitest for the protocol/parser/pre-filter units · deploy: Fly.io or Railway (connector), Vercel (dashboard).

## WORKING AGREEMENTS

- Track all work as checkboxes in `docs/TASKS.md`, organized by the phases in `docs/BUILD_PLAN.md` §5. Check items off as we complete them; add discovered tasks there rather than doing drive-by scope.
- Small, frequent commits with clear messages. Ask before any destructive operation (deletes, force pushes, dropping tables).
- Write a small test script for **every** Minds platform behavior we depend on (memory recall, proactive send, Circle relay, wallet action) under `apps/connector/spikes/` — these are our regression canaries against a moving beta platform; we re-run them Aug 26.
- When something about the Minds platform is unknown or contradicts `docs/API-NOTES.md`, stop and give me a copy-pasteable curl or a message to send the Mind so *I* can verify — do not guess API behavior into product code.
- Prefer boring, reliable choices; this is a demo-critical sprint, not an architecture showcase. But polish what the camera sees: dashboard and in-chat message formatting matter for scoring.
- Keep every response's plan tight: what you're doing, what you need from me, what's next.

## FIRST SESSION — DO THIS NOW, IN ORDER

**Step 1 — Read context:** Read `docs/BUILD_PLAN.md` and `docs/STRATEGY.md` in full.

**Step 2 — Create `CLAUDE.md`** at the repo root with exactly this content (lean on purpose — it loads every session):

```markdown
# Keeper — Claude Code Memory

Hackathon sprint. Deadline Aug 28 2026 23:59 HKT; we submit Aug 27.
Scope, phases, calendar: @docs/BUILD_PLAN.md · Task tracker: @docs/TASKS.md
Verified Minds API behavior: @docs/API-NOTES.md (trust this over assumptions)

## Iron rules
- Relationship memory lives in the STEWARD MIND, never in SQLite (mirror only).
- The Mind decides; connector code only relays envelopes + executes directives.
- All Minds calls go through packages/minds-client (adapter, 2 transports).
- Directive confidence "low" ⇒ never auto-act; flag creator.
- Secrets: .env only. Never commit keys.
- Descope trigger: multi-agent/wallet not demo-stable by Aug 24 EOD ⇒ single-agent plan (BUILD_PLAN §12).
- Don't guess Minds API behavior — write a spike script + ask me to verify.

## Commands
- pnpm dev:connector · pnpm dev:dashboard · pnpm seed:day <n> · pnpm demo:run · pnpm test

## Style
- TypeScript strict. Zod-validate all external input (Telegram + Mind replies).
- Small commits. Update docs/TASKS.md checkboxes as work completes.
```

**Step 3 — Plan:** Produce a concrete plan for Phase 0 + Phase 1 (from `docs/BUILD_PLAN.md` §5) and initialize `docs/TASKS.md` with all phases as checkbox lists. Show me the plan before scaffolding.

**Step 4 — Scaffold:** monorepo, `packages/protocol` (envelope + directive types with zod schemas + unit tests), `packages/minds-client` (transport interface, Messaging API transport with `X-Access-Key` auth, stub Telegram-relay transport, per-call cognition/latency logging), `.env.example` (`MINDS_ACCESS_KEY`, `TELEGRAM_BOT_TOKEN`, `CREATOR_TELEGRAM_ID`, `DEMO_GROUP_ID`), README stub.

**Step 5 — Phase 0 spike harness:** Build me runnable spike scripts under `apps/connector/spikes/`:
- `api-smoke.ts` — create conversation → send message → poll history (raw output printed)
- `memory-probe.ts` — send 3 facts; separate invocation later asks for them back; prints PASS/FAIL
- `proactive-probe.ts` — instructions + polling to verify the Mind messages first
- `circle-probe.ts` and `wallet-probe.ts` — smallest possible verification of agent↔agent relay and one on-chain action
Each script: single command to run, clear PASS/FAIL output, results appended to `docs/API-NOTES.md`. Where a step needs a human (e.g., telling the Mind something over Telegram, approving a Circle), print the exact message/action for me to perform, then wait/poll.

**Step 6 — Report:** Summarize what's built, what I must do manually right now (accounts, keys, Mind creation, cognition boost request, demo group creation, seeding Day 1 cast activity — cast defined in BUILD_PLAN §9), and what's blocked pending spike results.

Any questions about scope, the platform, or trade-offs — ask me now, at the planning step, not after building. Let's win this.
