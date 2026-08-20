# Keeper — Architecture

The one-sentence version: **the Mind is the brain and the memory; our code is the nervous
system.** Everything below follows from refusing to put relationship memory in a database.

```
                        ┌─────────────────────────────────────────┐
                        │      TELEGRAM COMMUNITY GROUP           │
                        │  (creator + members + @KeeperBot)       │
                        └───────────────┬─────────────────────────┘
                                        │ messages, joins, commands
                                        ▼
┌──────────────────────────────────────────────────────────────────┐
│  CONNECTOR  (apps/connector · Node/TS · grammY long polling)     │
│  1. wrap every event in a Member Identity Envelope               │
│  2. pre-filter — only judgment-worthy events reach the Mind      │
│  3. relay via packages/minds-client                              │
│  4. parse the [KEEPER-ACTION] directive out of the Mind's reply  │
│  5. execute: reply / warn / delete / mute / flag / reward / none │
│  6. mirror everything to SQLite + serve the dashboard API        │
└───────┬──────────────────────────────────────────┬───────────────┘
        │ Minds Messaging API (X-Api-Key)          │ REST
        ▼                                          ▼
┌──────────────────────┐                  ┌──────────────────┐
│  STEWARD MIND ★      │                  │  DASHBOARD       │
│  • member memory     │                  │  (apps/dashboard)│
│  • moderation calls  │                  │  relationship    │
│  • digests, welcomes │                  │  graph, member   │
│  • at-risk detection │                  │  timelines,      │
└──────────┬───────────┘                  │  moderation log, │
           │ Circle (manual introduction) │  unprompted feed │
           ▼                              └──────────────────┘
┌──────────────────────┐
│  REWARDS MIND        │
│  • on-chain wallet   │
│  • issues the Top    │
│    Contributor reward│
└──────────────────────┘
```

## Why the Mind is not optional here

A judge's fair question is "isn't this just a database with an LLM on top?" The answer has
to be structural, not rhetorical:

- **Delete our SQLite file and Keeper still knows everyone.** The mirror holds message
  rows and an audit log for rendering the dashboard. Who Marco *is* — that he has been
  helpful since day one, that he wrote the export cheat sheet, that Rex's insults are
  affectionate — lives only in the Steward Mind's long-term memory.
- **No judgment is implemented in our code.** There is no toxicity classifier, no scoring
  function, no reward heuristic. The connector cannot decide anything; it can only ask and
  execute. Grep for it: the only decisions our code makes are *whether to ask* (the
  pre-filter) and *whether it is safe to act* (the confidence gate).
- **The autonomy is the platform's, not a cron job's.** Where the Mind's native scheduling
  works, proactive behavior is the Mind's own. Any connector-side trigger we fall back on
  still sources 100% of its content from the Mind's memory.

## The two protocols

Everything crossing the boundary uses one of two formats, both defined and unit-tested in
`packages/protocol` (see [BUILD_PLAN §3](BUILD_PLAN.md)).

**Inbound — Member Identity Envelope.** Every event becomes a small text block carrying
the member's identity and relationship timing (`first_seen`, `last_seen` with a
human-readable "(3 days ago)"), so the Mind can attach what it reads to who said it. A
missing `last_seen` line means first contact. Member-typed content sits below a `---`
fence and is explicitly untrusted — a literal `[KEEPER-EVENT]` inside it is neutralized so
a member cannot forge an envelope header.

**Outbound — KEEPER-ACTION directive.** The Mind replies in prose and ends with a fenced
JSON block naming the action, target, message, its own one-line reasoning, and a
confidence. The reasoning string is not decoration: it is what the creator reads in the
moderation log, and it is the most legible evidence a judge has that the Mind is doing the
thinking.

## The safety rails, and where they live

Two rules protect a real community from a beta-platform agent, and both are enforced in
one place so they cannot be forgotten at a call site:

1. **Low confidence never auto-acts.** `extractDirective` gates the directive itself: any
   acting action arriving with `confidence: "low"` — or with confidence missing or
   malformed, which defaults to low — is rewritten into `flag_creator` carrying the
   original suggestion. The creator decides.
2. **A parse failure is never a crash and never an action.** Any unparseable reply
   degrades to `action: "none"` plus a logged reason. The connector runs
   `execute(result.directive)` unconditionally and is safe by construction.

Everything executed is logged with the Mind's reasoning and confidence, is reversible via
`/keeper undo`, and is overridable by the creator.

## Why an adapter around the platform

`packages/minds-client` exists because the Minds platform is in beta and its own
documentation already lags itself (the Bazaar listing documents an auth header the
changelog deprecated). Product code sees one `MindTransport` interface and opaque string
cursors; it never learns whether a cursor is a Minds fingerprint or a Telegram message id.

Two transports sit behind it. The **Messaging API** transport is the real one. The
**Telegram relay** is disaster insurance and remains a documented stub, because the honest
finding is that it cannot be built the obvious way: Telegram bots cannot see or message
other bots, and Minds appear on Telegram as bots. If it is ever needed, human-relay mode
comes before an MTProto user session.

Every call is logged to JSONL with latency and an estimated cognition-credit delta —
sampled from the platform's own credits endpoint, because the per-exchange cost is not
published. That log is what the pre-filter budget and the dashboard's cognition meter are
built on.

## Cost shaping

Cognition is metered, so the connector spends it deliberately. Most group chatter is
mirrored locally and never reaches the Mind. Events are escalated when they are
judgment-worthy: joins, direct mentions, questions, cheap local heuristics for spam and
hostility, creator commands, scheduled triggers, and a small ambient sample so the Mind
keeps absorbing relationship color. Target: ≤40 exchanges/day in normal operation.
