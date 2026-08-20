# KEEPER — Complete Build Plan
### Creative Minds Jam #1: Hong Kong · Track 3: Moderation & Community Assistance
**Builder:** Solo, student, shipping with Claude Code · **Deadline:** August 28, 2026, 23:59 HKT · **Today:** August 20, 2026

> **What we're building:** Keeper is a persistent Community Steward — a Mind (hellominds.ai) that lives inside a creator's community, remembers every member as an ongoing relationship, moderates with context instead of keywords, autonomously welcomes, nurtures, and rewards contributors 24/7 (including on-chain rewards from a second Mind's wallet), and hands the creator a daily digest without ever being asked.
>
> Companion docs: `STRATEGY-creative-minds-jam.md` (why Keeper wins) and `KEEPER-MASTER-PROMPT.md` (paste into Claude Code to start).

---

## 0. Win Conditions (what "done" means)

The judges score five criteria 1–10. Every build decision below traces to one of these:

| # | Criterion | How Keeper scores it |
|---|---|---|
| 1 | **Minds Integration Depth** | The Mind's native long-term memory IS the member-relationship store. Multi-agent via Circles (Steward + Rewards). Autonomy is native, not cron-faked. |
| 2 | **Creator-Economy Problem Fit** | Solo creators run their whole business on communities with stateless bots (MEE6/Nightbot). Burnout + moderation load are documented top pains. |
| 3 | **Innovation & Creativity** | Relationship-native moderation (no one does this), memory-based returning-member recognition, on-chain contributor rewards issued by an agent. |
| 4 | **Execution & Completeness** | Working Telegram community + live dashboard + human override + real multi-day persistence on camera. |
| 5 | **Viability & Scalability** | Community CRM = recurring-revenue SaaS; Bazaar distribution; Minds Investment Programme framing ("Minds at the platform layer"). |

**Hard submission requirements (all mandatory):**
- [ ] Working product with the Mind **integral** to core operations
- [ ] Persistence demonstrated: **memory + continuity + autonomous follow-up** across sessions
- [ ] Clear Track 3 problem fit
- [ ] Demo video, **1.5–2 minutes**
- [ ] Public repo (GitHub) + technical documentation
- [ ] Submitted on DoraHacks before **Aug 28, 23:59 HKT**

---

## 1. Non‑Negotiable Design Principles

These are the rules that keep the build honest and the judges convinced. They go into `CLAUDE.md` and never get violated.

1. **Persistence lives in the Mind, not in Postgres.** The Mind's long-term memory is the source of truth for member relationships. Any local DB is a *mirror* for dashboard rendering and audit logs only. If a judge asks "isn't this just a database?", the answer must demonstrably be no — delete the local DB, and Keeper still remembers everyone.
2. **The Mind decides; the code executes.** All judgment calls (is this toxic? who deserves a reward? what goes in the digest?) are made by the Steward Mind. The connector code is dumb plumbing: it relays events in and executes structured directives out. This split is what makes "Minds Integration Depth" legible.
3. **Make persistence visible.** Every feature ships with a way to *show* memory/continuity/autonomy on camera: timestamps, a member timeline view, "last interaction" surfaces, proactive messages arriving unprompted.
4. **Real history beats faked history.** Start seeding the demo community with real, dated interactions on **Day 1** so that by demo day the Mind has genuinely remembered things across 6–7 real days. Judges can probe faked demos; they can't argue with real timestamps.
5. **Adapter pattern around the beta API.** The Minds platform is in Beta and the API surface is thin. Every Minds interaction goes through one `MindsClient` adapter so that if an endpoint changes or is unavailable, we swap the transport (Messaging API ↔ Telegram relay) without touching product code.
6. **Budget Cognition like money.** Every message routed to the Mind burns Cognition credits (~200/day free top-up per Mind; a cognition boost is available for one agent). The connector pre-filters so only judgment-worthy events reach the Mind.
7. **Human stays in charge.** Every autonomous moderation action is logged, reversible, and overridable by the creator with one command. This defuses the false-positive objection before judges raise it.
8. **Descope beats fragile.** Single-agent Keeper with rock-solid persistence beats a wobbly multi-agent demo. Pivot triggers are defined in §12 — follow them without sentimentality.

---

## 2. Architecture

```
                        ┌─────────────────────────────────────────┐
                        │      TELEGRAM COMMUNITY GROUP           │
                        │  (creator + members + @KeeperBot)       │
                        └───────────────┬─────────────────────────┘
                                        │ messages, joins, events
                                        ▼
┌──────────────────────────────────────────────────────────────────┐
│  CONNECTOR SERVICE (Claude Code · Node/TS, grammY)               │
│  • wraps every event in a Member Identity Envelope               │
│  • pre-filters (only judgment-worthy events → Mind)              │
│  • parses [KEEPER-ACTION] directives from the Mind               │
│  • executes: reply / warn / delete / mute / flag / reward / none │
│  • mirrors everything to SQLite + serves the dashboard API       │
└───────┬──────────────────────────────────────────┬───────────────┘
        │ Minds Messaging API                      │ REST/WS
        │ (X-Access-Key)                           ▼
        ▼                                 ┌──────────────────┐
┌──────────────────────┐                  │  DASHBOARD       │
│  STEWARD MIND ★      │                  │  (Next.js)       │
│  (cognition boost)   │                  │  • relationship  │
│  • member memory     │                  │    graph         │
│  • moderation calls  │                  │  • member        │
│  • digests, welcomes │                  │    timelines     │
│  • at-risk detection │                  │  • moderation log│
└──────────┬───────────┘                  │  • leaderboard   │
           │ Circle (agent↔agent)         │  • override UI   │
           ▼                              └──────────────────┘
┌──────────────────────┐
│  REWARDS MIND        │
│  • on-chain wallet   │
│  • issues Top-       │
│    Contributor       │
│    rewards on        │
│    Steward's request │
└──────────────────────┘
```

**Why Telegram-first (not Discord):** Minds natively speak Telegram; the hackathon's own community lives on Telegram; the judges use Telegram. One fewer integration layer, and the demo happens on the platform the platform-makers use. Discord connector = post-hackathon stretch goal only.

**Component inventory (everything Claude Code builds):**

| Component | What it is | Priority |
|---|---|---|
| `packages/minds-client` | Adapter over the Minds Messaging API (create conversation, send message, get history, list conversations) with `X-Access-Key` auth + a Telegram-relay fallback transport | P0 |
| `apps/connector` | Telegram bot (grammY) + event router + directive parser + action executor + SQLite mirror + API server | P0 |
| `apps/dashboard` | Next.js dashboard: relationship graph, member timeline, moderation log, leaderboard, override controls | P1 |
| `packages/protocol` | Shared types: Member Identity Envelope, KEEPER-ACTION directive schema, event types | P0 |
| `apps/seeder` | Demo harness: scripted cast of community members, dated event replay, "member returns" scenario runner | P0 (yes, P0 — the demo IS the product here) |
| Rewards flow | Circle between Steward ↔ Rewards Mind + reward execution + on-screen proof (tx/receipt) | P2 (descopable) |
| `docs/` | Architecture diagram, Minds-feature mapping, README, submission text | P0 |

---

## 3. The Two Protocols (the heart of the system)

### 3.1 Member Identity Envelope (connector → Steward Mind)
Every event relayed to the Mind is wrapped so the Mind can build per-member memory:

```
[KEEPER-EVENT]
type: message | member_joined | member_returned | scheduled_digest | creator_command
member: @handle (id:12345, display:"Ada")
first_seen: 2026-08-21
last_seen: 2026-08-24 (3 days ago)
group: "Ada's Editing Lab"
ts: 2026-08-27T14:02:11+08:00
---
<raw message content>
```

The Mind is primed (once, conversationally — see §5 Phase 2) to treat each member as an ongoing relationship: maintain a durable profile (join date, interests, contributions, warnings, running threads), and to consult that memory before responding.

### 3.2 KEEPER-ACTION directive (Steward Mind → connector)
The Mind replies with a fenced JSON block the connector parses and executes:

```json
{
  "action": "reply | warn | delete | mute | flag_creator | reward | digest | none",
  "target_member": "@handle",
  "message": "text to post, if any",
  "reasoning": "one-line rationale (shown in moderation log)",
  "confidence": "high | medium | low",
  "reward": { "type": "top_contributor", "note": "..." }
}
```

Rules: `low` confidence → never auto-act; flag to creator instead. Every executed action is written to the moderation log with the Mind's own reasoning — this log is judge candy (it shows the Mind *thinking*).

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (Node 20+) | One language everywhere; Claude Code excels at it |
| Telegram | grammY | Modern, typed, long-polling (no webhook/tunnel pain during dev) |
| Monorepo | pnpm workspaces | apps/ + packages/ layout |
| Mirror DB | SQLite via Drizzle ORM | Zero-ops; explicitly a mirror (Principle 1) |
| Dashboard | Next.js + Tailwind + a graph lib (react-force-graph or d3) | Fast to ship, looks good on camera |
| Minds | Messaging API (`X-Access-Key`) via `packages/minds-client` | The documented builder surface |
| Deploy | Fly.io / Railway (connector) + Vercel (dashboard) | Live URL for judges; connector needs an always-on process |
| Secrets | `.env` (gitignored) + `.env.example` committed | Never commit keys |

---

## 5. Build Phases

> Each phase has acceptance criteria. Do not start the next phase until they pass. Track with checkboxes in `docs/TASKS.md`.

### Phase 0 — De-risk everything (Day 1: Aug 20–21) ⚠️ MOST IMPORTANT PHASE
The whole plan rests on beta-platform assumptions. Verify them **before** writing product code.

- [ ] Sign up at hellominds.ai; create the **Steward Mind** (and a second Mind for Rewards if allowed — first 3 Minds get free Cognition)
- [ ] Register/apply on DoraHacks for the Jam; request the **cognition boost** for the Steward Mind
- [ ] Join the Creative Minds Telegram community + Open Campus hub; note next office hours
- [ ] Obtain the **Builder Access Key**; hit the Messaging API raw (curl): create conversation → send message → get history. Save working requests in `docs/API-NOTES.md`
- [ ] **Memory spike:** tell the Mind 3 facts in one conversation; open a NEW conversation/session later and ask about them. Confirm cross-session recall.
- [ ] **Proactivity spike:** instruct the Mind to message you at a set time / on a schedule, unprompted. Confirm it arrives.
- [ ] **Circles spike:** connect two Minds in a Circle; have Steward ask Rewards to do something. Confirm agent↔agent messaging works.
- [ ] **Wallet spike:** confirm what the Mind's on-chain wallet can actually do (hold/send what asset? on which chain? via what instruction?). Document exactly.
- [ ] **Latency + Cognition audit:** measure seconds-per-round-trip and credits-per-exchange. This sets the pre-filter budget.

**GO/NO-GO gates:**
- Messaging API unusable → **fallback transport:** run Keeper's brain over the Mind's native Telegram interface (connector relays into the Mind's chat programmatically). Adapter pattern (§1.5) makes this a transport swap, not a rewrite.
- Circles or wallet flaky → pre-arm **Descope Plan A** (§12): single-agent Keeper, rewards become "reward recommendations" the Mind autonomously drafts for the creator.
- Memory doesn't persist across sessions (extremely unlikely — it's the platform's core claim) → escalate at office hours immediately; this is existential.

**Also Day 1:** create the demo Telegram group ("Ada's Editing Lab"), invent the cast (§9), and post the first day of seeded history. *Real elapsed days start counting now.*

### Phase 1 — The core loop (Aug 21–22)
Telegram event → envelope → Mind → directive → executed action.

- [ ] Scaffold monorepo; `packages/protocol` types; `packages/minds-client` with both transports behind one interface
- [ ] grammY bot in the demo group: capture messages, joins, member metadata
- [ ] Envelope builder (computes `first_seen`/`last_seen` from the mirror DB)
- [ ] Pre-filter: route to Mind only — new member joins, messages that trip a cheap local heuristic (mentions, questions, profanity/caps heuristics, links), 1-in-N ambient sampling for relationship color, creator commands, scheduled triggers. Everything else mirrors locally without burning Cognition.
- [ ] Directive parser with strict JSON extraction + `none` fallback on parse failure
- [ ] Executors: reply, delete, warn (reply + log), flag_creator (DM the creator)
- [ ] SQLite mirror: members, events, actions tables

**Accept when:** a message in the group produces a context-aware reply from Keeper, end-to-end, in < ~15s, and the action log shows the Mind's reasoning.

### Phase 2 — Teach Keeper the community (Aug 22)
This is done *conversationally* with the Mind — showcase it, it's the platform's signature interaction.

- [ ] Write the **Steward Charter** (in `docs/STEWARD-CHARTER.md`) and send it to the Mind: its role, the envelope format, the directive format, the community's norms (tone, what's out of bounds, sarcasm ≠ toxicity here, etc.), moderation philosophy (de-escalate first, low-confidence → flag), and the standing instruction to maintain per-member relationship memory
- [ ] Verify with probes: "who is @ada_edits and what do you remember about her?" → Mind answers from memory
- [ ] Iterate the charter until moderation judgment on 10 scripted test messages (5 fine, 3 borderline, 2 clearly toxic) matches expectations

**Accept when:** the Mind correctly passes the 10-message judgment test and can recite any seeded member's history unprompted.

### Phase 3 — Persistence features (Aug 22–23)
The three rubric behaviors, productized:

- [ ] **Memory — Returning member recognition:** on message from a member with `last_seen > 48h`, envelope type `member_returned`; charter instructs a personal, history-referencing welcome-back
- [ ] **Continuity — Open threads:** charter instructs the Mind to keep "open loops" per member (unresolved questions, ongoing situations) and resume them; verify by leaving a member's question dangling one day and having them return the next
- [ ] **Autonomous follow-up #1 — Daily digest:** the Mind proactively sends the creator a nightly digest (new members, mood, flags, star contributor, suggested action). Prefer the Mind's *native* scheduling (proven in Phase 0); connector-side scheduled trigger only as fallback — and if used, the *content* still comes 100% from the Mind's memory
- [ ] **Autonomous follow-up #2 — Newcomer welcome + day-2 check-in:** welcomes on join, then checks in on that member the next day, unprompted
- [ ] **Autonomous follow-up #3 — At-risk radar:** digest includes "members going quiet" (Mind reasons over its own relationship memory)

**Accept when:** all five behaviors have fired at least once with real timestamps, screenshotted into `docs/EVIDENCE/`.

### Phase 4 — Human override + moderation log (Aug 23)
- [ ] Creator commands in-chat: `/keeper pause`, `/keeper resume`, `/keeper undo` (reverses last action), `/keeper why` (posts the Mind's reasoning for its last action)
- [ ] Moderation log complete: every action + reasoning + confidence + override status

**Accept when:** an undo visibly reverses an action and the log reflects it.

### Phase 5 — Rewards Mind + Circles + on-chain reward (Aug 23–24) — P2, descopable
- [ ] Circle: Steward ↔ Rewards Mind
- [ ] Weekly (and on-demand) flow: Steward autonomously nominates a Top Contributor **from its relationship memory**, messages the Rewards Mind through the Circle; Rewards Mind executes an on-chain reward from its wallet (whatever Phase 0 proved viable: token transfer, on-chain attestation/receipt — smallest credible on-chain artifact wins)
- [ ] Proof surface: the reward + a link/receipt posted in the group and shown on the dashboard
- [ ] **Descope trigger:** if this isn't demo-stable by **end of Aug 24**, execute Descope Plan A (§12) and move on without looking back

**Accept when:** the full Steward→Circle→Rewards→on-chain→announcement chain runs twice in a row without intervention.

### Phase 6 — Dashboard (Aug 24–25)
Built for the camera. Every panel answers a rubric line:

- [ ] **Relationship graph:** members as nodes sized by contribution, colored by warmth/activity (Minds Integration made visual)
- [ ] **Member timeline:** click a member → their whole relationship history *as Keeper remembers it* (pull the Mind's own summary of that member and display it — memory, on screen, in the Mind's voice)
- [ ] **Moderation log:** action, reasoning, confidence, override buttons (Execution + trust)
- [ ] **Leaderboard + rewards:** contributors and issued on-chain rewards (web3 + autonomy)
- [ ] **"Unprompted" feed:** everything Keeper did without being asked, timestamped (autonomous follow-up, impossible to miss)
- [ ] Deploy dashboard (Vercel) + connector (Fly/Railway); judges get a live URL

**Accept when:** a stranger can look at the dashboard for 30 seconds and explain what Keeper does.

### Phase 7 — Demo scenario lock + video (Aug 25–26)
See §9 and §10. Record by **Aug 26** so Aug 27 is buffer.

### Phase 8 — Docs + submission (Aug 26–27)
See §11. Submit **Aug 27**, a full day early. Aug 28 is for disasters only.

---

## 6. Suggested Calendar (Aug 20 → 28)

| Date | Focus | Milestone |
|---|---|---|
| Aug 20–21 | Phase 0 + seed day 1 | All spikes verified; GO/NO-GO decided; community history starts accruing |
| Aug 21–22 | Phase 1 | Core loop live |
| Aug 22 | Phase 2 | Charter accepted; judgment test passed |
| Aug 22–23 | Phase 3 | All five persistence behaviors evidenced |
| Aug 23 | Phase 4 | Override + log complete |
| Aug 23–24 | Phase 5 | Rewards chain runs ×2 — or descope decision executed |
| Aug 24–25 | Phase 6 | Dashboard live at a URL |
| Aug 25–26 | Phase 7 | Demo video recorded + edited |
| Aug 26–27 | Phase 8 | README, docs, DoraHacks submission **submitted Aug 27** |
| Aug 28 | Buffer | Fixes only. Deadline 23:59 HKT |

Daily habit: 10 minutes of in-character seeded activity in the demo group (keeps real history compounding), plus screenshot any persistence behavior into `docs/EVIDENCE/`.

---

## 7. Cognition Budget

- Baseline: ~200 free Cognition/day for the primary Mind (plus the boost — confirm size at office hours).
- Pre-filter target: ≤ 40 Mind exchanges/day in normal operation; scripted demo day may spike — bank credits by keeping ambient sampling low on Aug 24–26.
- Instrument it: `minds-client` logs estimated credits per call; dashboard shows a tiny "Cognition spent today" widget (subtle flex: you engineered for the platform's economics — Viability points).

---

## 8. Security, Safety, and Honesty Rails

- Keys in `.env` only; `.env.example` documents shape. Rotate the Builder key before making the repo public if it ever touched a commit.
- Moderation defaults conservative: `low` confidence never auto-deletes; de-escalation before punishment; everything reversible; creator override always wins.
- Demo integrity: the cast is fictional and labeled as a simulated community in the README — but the *persistence is real* (real days, real memory, real unprompted messages). Never fake a timestamp; you don't need to.
- No real user data; demo group is private.

---

## 9. Demo Harness & Cast (build this like a feature)

**The community:** "Ada's Editing Lab" — a video-editing creator's community (creator persona: Ada). Student-relevant, judge-relatable, and lets moderation examples be craft-flavored rather than ugly.

**Cast (run via `apps/seeder` + a second/third Telegram account for live shots):**
- **@ada_edits** — the creator (you, on camera)
- **@marco_cuts** — loyal helpful regular since Day 1 (the eventual Top Contributor reward recipient)
- **@lena_learns** — beginner with an *open loop*: asked about fixing choppy exports on Day 2, went quiet → **the returning member** in the demo
- **@rex_hotkeys** — the borderline case: sarcastic "this edit is garbage lol" — context says banter; a keyword bot would nuke it; Keeper reads the relationship and responds proportionally
- **@dr0pshipper_99** — obvious spam/link drop → clean delete with reasoning
- **@new_kid_kai** — joins live on camera → welcome referencing group norms; day-2 check-in already evidenced in screenshots

**Scenario runner:** `pnpm seed:day <n>` posts that day's scripted events (via bot accounts) so history accrues on schedule; `pnpm demo:run` triggers the live sequence beats in order during recording.

---

## 10. Demo Video — 110-Second Shooting Script

Format: screen recording (Telegram + dashboard side-by-side where possible), your voiceover, bold captions. Record at 1080p, tight cuts, no dead air.

| Time | Shot | Caption |
|---|---|---|
| 0–12s | You on camera: "My community is my business — and I run it alone, with bots that don't know anyone." Stat card: *78% of creators report burnout.* | THE PROBLEM |
| 12–30s | Telegram: you telling Keeper (the Mind) its charter in plain English. One line: "It's an agent you *talk* to, and it remembers." | MEET KEEPER — A MIND |
| 30–55s | **@lena_learns returns after days away.** Keeper, unprompted by you, greets her by name and picks up her choppy-exports thread from where it died. Cut to dashboard member-timeline showing the remembered history with real dates. | MEMORY + CONTINUITY |
| 55–75s | **@rex_hotkeys** posts the borderline jab. Split-screen: "what a keyword bot does" (delete/ban) vs Keeper's proportionate, norm-aware call — show the reasoning line from the moderation log. | CONTEXT, NOT KEYWORDS |
| 75–95s | **Nobody touches anything.** Steward nominates @marco_cuts through the Circle; Rewards Mind sends the on-chain reward; announcement + receipt land in-chat; nightly digest arrives in Ada's DMs. | ACTS 24/7, UNPROMPTED |
| 95–110s | Dashboard relationship graph → one line: "Every creator community, run like a relationship — not a rulebook." Flash: Bazaar distribution + built solo by a student in 8 days. | KEEPER |

Production notes: script the voiceover word-for-word (~260 words max); pre-stage every beat with `demo:run`; record each segment separately and stitch; export both a 16:9 master and the exact file DoraHacks needs; keep a raw uncut fallback take.

---

## 11. Submission Package

**Repo layout:**
```
keeper/
├── CLAUDE.md                  # working memory for Claude Code (lean)
├── README.md                  # the pitch + quickstart + demo GIFs
├── apps/
│   ├── connector/
│   ├── dashboard/
│   └── seeder/
├── packages/
│   ├── minds-client/
│   └── protocol/
└── docs/
    ├── BUILD_PLAN.md          # this file
    ├── STRATEGY.md            # the research doc
    ├── ARCHITECTURE.md        # diagram + component walkthrough
    ├── MINDS-INTEGRATION.md   # ★ explicit rubric mapping (see below)
    ├── STEWARD-CHARTER.md     # what the Mind was taught, verbatim
    ├── API-NOTES.md           # verified Minds API behavior
    ├── TASKS.md               # checkbox tracker
    └── EVIDENCE/              # timestamped persistence screenshots
```

**`docs/MINDS-INTEGRATION.md` is the highest-leverage document.** A table: each rubric word (memory, continuity, autonomous follow-up, multi-agent, wallet) → the exact feature → the exact code path → a timestamped screenshot. Judges should be able to verify Minds Integration Depth in 60 seconds.

**README structure:** one-line pitch → 30-second problem → what Keeper does (3 bullets mapped to memory/continuity/autonomy) → architecture diagram → "why this needs a Mind" → live demo URL + video link → quickstart → student note.

**DoraHacks BUIDL form:** Track 3 · video link · repo link · description opening with the problem stat and closing with the Investment Programme framing ("Minds at the platform layer: the Mind's memory is the product"). **State student status explicitly** for Student Prize eligibility (stackable with track/Grand prizes).

**Submission checklist:**
- [ ] Video is 1.5–2:00 exactly, audible, captioned
- [ ] Repo public; no secrets in history; `.env.example` present; fresh-clone quickstart tested
- [ ] Live dashboard URL up; connector running
- [ ] MINDS-INTEGRATION.md complete with evidence
- [ ] Student status stated
- [ ] Submitted on DoraHacks — confirmation screenshot saved — by Aug 27

---

## 12. Risk Register & Pivot Triggers

| Risk | Likelihood | Mitigation / Trigger |
|---|---|---|
| Messaging API limited/unstable (beta) | Medium | Adapter fallback to Telegram-relay transport. Decide in Phase 0, not Phase 5. |
| Circles/wallet fragile on camera | Medium | **Descope Plan A** (by end Aug 24): single Steward Mind; rewards become autonomous *reward recommendations* in the digest ("Marco earned Top Contributor this week — send it?"). Autonomy story intact, one fewer failure mode. Wallet becomes "roadmap" in the video's last 5 seconds. |
| Mind latency too high for live chat feel | Medium | Pre-filter harder; async UX framing ("Keeper considers, then acts"); pre-trigger demo beats. |
| Cognition runs dry mid-demo-week | Low-Med | Budget (§7); bank credits Aug 24–26; confirm boost size at office hours. |
| Moderation false positive on camera | Low | Confidence gating + scripted demo beats + override shown as a *feature*. |
| Track 3 turns out crowded | Low | Differentiate harder on relationship-memory + wellbeing framing (Aegis angle): "Keeper absorbs the toxicity so the creator doesn't have to." |
| Platform changes mid-week (beta) | Low | Pin all evidence with screenshots as you go; re-verify spikes Aug 26. |

**Standing rule:** any feature not demo-stable 48h before recording gets cut from the demo (it can stay in the repo as "experimental").

---

## 13. Open Questions → Office Hours (ask early, Aug 20–21)
1. Cognition boost: size, and how it's granted to the chosen agent?
2. Messaging API: official docs / rate limits / is the `X-Access-Key` Builder flow the sanctioned path for hackathon builds?
3. Wallet: exactly what on-chain actions can a Mind's wallet perform today, and on which chain?
4. Circles: any limits on agent↔agent messaging frequency?
5. Judging: is persistence evidence (timestamped screenshots + live URL) reviewed beyond the 2-minute video?
6. Confirm per-prize split and Student Prize stacking rules.

---

*Next step: open `KEEPER-MASTER-PROMPT.md`, paste it into Claude Code from an empty `keeper/` directory, and start Phase 0.*
