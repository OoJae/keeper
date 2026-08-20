# Keeper — Task Tracker

Phases mirror `docs/BUILD_PLAN.md` §5. Check items off as they complete; add
discovered work here rather than doing drive-by scope.

**Descope trigger (BUILD_PLAN §12):** if multi-agent + wallet (Phase 5) is not
demo-stable by **end of Aug 24**, execute Descope Plan A — single Steward Mind,
rewards become autonomous *recommendations* in the digest. No sentimentality.

---

## Phase 0 — De-risk everything (Aug 20–21) ⚠️ most important phase

### Manual (Demilade)
- [ ] Sign up at hellominds.ai; create the **Steward Mind**
- [ ] Create the **Rewards Mind** (first 3 Minds get free Cognition)
- [ ] Mint a Builder API key at build.hellominds.ai/console (shown once → `.env`)
- [ ] Register on DoraHacks for the Jam; request the **cognition boost** for Steward
- [ ] Join the Creative Minds Telegram community + Open Campus hub; note office hours
- [ ] Create the demo **supergroup** "Ada's Editing Lab"; add @KeeperBot as **admin**
      (needs `can_delete_messages` + `can_restrict_members`)
- [ ] `/start` the bot in DM as the creator account (required before it can DM digests)
- [ ] Invent/confirm the cast (BUILD_PLAN §9) and post **Day 1 seeded history**
      — real elapsed days start counting now

### Spikes (run in order; results land in docs/API-NOTES.md)
- [ ] `pnpm spike:api-smoke` — create conversation → send → poll history; which auth header works
- [ ] `pnpm spike:memory -- --phase=teach` then (≥10 min later, separate run) `--phase=ask`
- [ ] `pnpm spike:memory -- --phase=ask --fresh-conversation` — cross-conversation recall
- [ ] `pnpm spike:proactive` — Mind messages first, unprompted
- [ ] `pnpm spike:circle` — Steward ↔ Rewards relay round-trip
- [ ] `pnpm spike:wallet` — smallest on-chain action; record chain + tx hash
- [ ] Latency + Cognition audit: seconds-per-round-trip, credits-per-exchange (from
      `var/minds-calls.jsonl`) → sets the pre-filter budget
- [ ] **GO/NO-GO recorded** in API-NOTES: transport decision + Phase 5 viability

## Phase 1 — The core loop (Aug 21–22)
- [x] Scaffold monorepo
- [x] `packages/protocol` — envelope + directive types, zod schemas, unit tests
- [x] `packages/minds-client` — transport interface, Messaging API transport, relay stub,
      per-call cognition/latency logging
- [ ] grammY bot in the demo group: capture messages, joins, member metadata
- [ ] Envelope builder (computes `first_seen`/`last_seen` from the mirror DB)
- [ ] Pre-filter (joins, heuristics, 1-in-N ambient sampling, creator commands, schedules)
- [ ] Directive parser wired in with `none` fallback on parse failure
- [ ] Executors: reply, delete, warn, flag_creator (DM creator)
- [ ] SQLite mirror: members, events, actions tables
- [ ] **Accept:** group message → context-aware reply end-to-end < ~15s; log shows reasoning

## Phase 2 — Teach Keeper the community (Aug 22)
- [ ] Write `docs/STEWARD-CHARTER.md` (role, envelope format, directive format, norms,
      moderation philosophy, standing relationship-memory instruction)
- [ ] Send the charter to the Mind conversationally
- [ ] Probe: "who is @ada_edits and what do you remember about her?" → answers from memory
- [ ] Iterate until 10 scripted test messages (5 fine, 3 borderline, 2 toxic) judge correctly
- [ ] **Accept:** 10-message judgment test passes; Mind recites any seeded member's history

## Phase 3 — Persistence features (Aug 22–23)
- [ ] Memory — returning-member recognition (`last_seen > 48h` ⇒ `member_returned`)
- [ ] Continuity — open threads resumed (leave a question dangling one day, verify next day)
- [ ] Autonomy #1 — nightly digest DM to the creator (prefer the Mind's native scheduling)
- [ ] Autonomy #2 — newcomer welcome + day-2 check-in
- [ ] Autonomy #3 — at-risk radar ("members going quiet") in the digest
- [ ] **Accept:** all five fired with real timestamps, screenshotted into `docs/EVIDENCE/`

## Phase 4 — Human override + moderation log (Aug 23)
- [ ] `/keeper pause`, `/keeper resume`, `/keeper undo`, `/keeper why`
- [ ] Moderation log complete: action + reasoning + confidence + override status
- [ ] **Accept:** an undo visibly reverses an action and the log reflects it

## Phase 5 — Rewards Mind + Circles + on-chain reward (Aug 23–24) — P2, descopable
- [ ] Circle: Steward ↔ Rewards Mind
- [ ] Steward nominates a Top Contributor from relationship memory → Rewards executes on-chain
- [ ] Proof surface: reward + receipt/link posted in group and on the dashboard
- [ ] **Accept:** full chain runs twice in a row unattended — else Descope Plan A

## Phase 6 — Dashboard (Aug 24–25)
- [ ] Relationship graph (nodes sized by contribution, colored by warmth)
- [ ] Member timeline rendered from the Mind's own recollection
- [ ] Moderation log with reasoning + override buttons
- [ ] Leaderboard + issued rewards
- [ ] "Unprompted actions" feed (timestamped)
- [ ] Cognition-spent-today widget
- [ ] Deploy: dashboard (Vercel) + connector (Fly/Railway) — live URL for judges
- [ ] **Accept:** a stranger understands Keeper from 30 seconds of dashboard

## Phase 7 — Demo scenario lock + video (Aug 25–26)
- [ ] `pnpm demo:run` stages every beat in order
- [ ] Voiceover scripted word-for-word (~260 words)
- [ ] Record segments, stitch, caption; 1.5–2:00 exactly
- [ ] Raw uncut fallback take kept
- [ ] Re-run all Phase 0 spikes (regression canaries against the beta platform) — Aug 26

## Phase 8 — Docs + submission (Aug 26–27)
- [ ] `docs/ARCHITECTURE.md`
- [ ] `docs/MINDS-INTEGRATION.md` — rubric word → feature → code path → screenshot
- [ ] README: pitch, problem, 3 bullets, diagram, "why this needs a Mind", links, quickstart
- [ ] Repo public; no secrets in history; fresh-clone quickstart tested
- [ ] DoraHacks BUIDL submitted (**Aug 27**) with student status stated; confirmation saved
