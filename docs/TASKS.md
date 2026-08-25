# Keeper — Task Tracker

Phases mirror `docs/BUILD_PLAN.md` §5. Check items off as they complete; add
discovered work here rather than doing drive-by scope.

**Descope trigger (BUILD_PLAN §12):** if multi-agent + wallet (Phase 5) is not
demo-stable by **end of Aug 24**, execute Descope Plan A — single Steward Mind,
rewards become autonomous *recommendations* in the digest. No sentimentality.

---

## Phase 0 — De-risk everything (Aug 20–21) ⚠️ most important phase

### Manual (Demilade)
- [x] Sign up at hellominds.ai; create the **Steward Mind** (`Keeper.Steward`, wallet on Base)
- [x] Create the **Rewards Mind** (first 3 Minds get free Cognition)
- [x] Mint a Builder API key at build.hellominds.ai/console (shown once → `.env`)
      ⚠️ this key was pasted into a chat transcript — **rotate before the repo goes public**
- [ ] Register on DoraHacks for the Jam; request the **cognition boost** for Steward
- [ ] Join the Creative Minds Telegram community + Open Campus hub; note office hours
- [ ] Create the demo **supergroup** "Ada's Editing Lab"; add @KeeperBot as **admin**
      (needs `can_delete_messages` + `can_restrict_members`)
- [ ] `/start` the bot in DM as the creator account (required before it can DM digests)
- [ ] Invent/confirm the cast (BUILD_PLAN §9) and post **Day 1 seeded history**
      — real elapsed days start counting now
- [x] Day scripts written through recording day (days 1-7, `apps/seeder/src/cast.ts`);
      `pnpm seed:day <n>` posts/prints them, `apps/seeder/README.md` covers how one
      builder drives six cast accounts and why timestamps are never faked
- [ ] Post day 4 (Aug 23) · [ ] day 5 (Aug 24) · [ ] day 6 (Aug 25) · [ ] day 7 (Aug 26)
      — ten minutes each, from the real cast accounts (`pnpm seed:day <n> --script`)

### Spikes (run in order; results land in docs/API-NOTES.md)
- [x] `pnpm spike:api-smoke` — **PASS 7/7**. `X-Api-Key` honoured. **Transport GO.**
- [x] `pnpm spike:memory` teach → ask (10 min gap) — **PASS 3/3** within one conversation
- [x] `--fresh-conversation` — **1/3 strict, but cross-conversation memory IS verified**: the
      Mind cited "the parallel thread" and "your profile summary". It recalls; it refuses to
      *assert* facts it filed as unconfirmed. ⇒ Phase 2 charter must fix this (API-NOTES)
- [x] `pnpm spike:proactive` — **PASS**. Unprompted, server-dated message 74s past the
      deadline. **Native autonomy confirmed — not cron-faked.**
- [ ] `pnpm spike:circle` — Steward ↔ Rewards relay round-trip
- [x] `pnpm spike:wallet` — **FAIL WALLET_NO_ACTION (class MIND, transport unaffected)**.
      Wallet `0xAfE264…900d` on **Base** is real (balance independently confirmed via Base
      RPC), but `WALLET_TransferNative` is not equipped: gated on a paid cognition top-up
      (~US$10) plus ETH for gas. **Phase 5 is blocked on funding — §12 decision.**
- [x] Latency audit: **23–65s per exchange**. BUILD_PLAN's Phase 1 "< ~15s" target is NOT
      achievable — Mind calls must stay off the Telegram handler's critical path.
      Cognition cost per exchange: **UNRESOLVED** (credits endpoint returns an
      undocumented shape) → pre-filter stays conservative. Office-hours question.
- [x] **GO/NO-GO recorded** in API-NOTES: **GO** on MessagingApiTransport; Phase 5 pending funding

## Phase 1 — The core loop (Aug 21–22)
- [x] Scaffold monorepo
- [x] `packages/protocol` — envelope + directive types, zod schemas, unit tests
- [x] `packages/minds-client` — transport interface, Messaging API transport, relay stub,
      per-call cognition/latency logging
- [x] grammY bot in the demo group: capture messages, joins, member metadata
      (`apps/connector/src/telegram/bot.ts` — long polling, auto-retry, `chat_member` in
      `allowed_updates`, admin-rights self-check, SIGTERM/SIGINT via `bot.stop()`)
- [x] Envelope builder (computes `first_seen`/`last_seen` from the mirror DB)
- [x] Pre-filter (joins, heuristics, 1-in-N ambient sampling, creator commands, schedules)
      — daily Cognition cap is enforced, with a reserve for joins/returns/creator commands
- [x] Directive parser wired in with `none` fallback on parse failure
- [x] Honour `unfenced_directive`: a directive recovered from bare prose (not a fenced
      block) may be the Mind *quoting a member*, not ordering us. Require a fence for
      destructive actions (`delete`/`mute`/`warn`/`reward`) — otherwise a member can type
      JSON and have it executed. Treat as flag_creator instead.
- [x] Executors: reply, delete, warn, flag_creator (DM creator, falling back to an
      in-group ping on the 403 you get until the creator has `/start`ed the bot).
      `mute`/`reward` are honest stubs: they log and flag rather than silently no-op.
- [x] SQLite mirror: members, events, actions tables (+ settings, for the pause switch)
- [ ] **Accept:** group message → context-aware reply end-to-end; log shows reasoning
      — blocked on the demo group + bot token existing. **The "< ~15s" half of this
      criterion is void**: measured Mind latency is 23–65s (docs/API-NOTES.md), so the
      handler returns immediately and the exchange runs on a per-chat queue instead.

## Phase 2 — Teach Keeper the community (Aug 22)
- [x] Write `docs/STEWARD-CHARTER.md` (6 messages + a gradeable 10-row judgment test)
- [x] Send the charter to the Mind conversationally (`pnpm teach:charter`, resumable)
- [x] Probe → the Mind recited Lena's join date, her CapCut→Premiere switch, her export
      question and, unprompted, that the loop is still open
- [x] **10/10** (`pnpm test:judgment`, 2026-08-25). Took two charter calibrations: a regular
      linking their own work is not self-promo, and abuse from a no-history account is
      removed rather than warned. Evidence: docs/EVIDENCE/judgment-test.md
- [x] **ACCEPTED** — 10/10 with both non-negotiable rows passing (#5 returning-member names
      the open loop without hedging, #9 spam deleted at high confidence)

## Phase 3 — Persistence features (Aug 22–23)
- [x] Memory — returning-member recognition implemented and unit-tested to the ms.
      LIVE evidence pending Lena's return (earliest 2026-08-27 20:07 HKT — a real 48h gap)
- [x] Continuity — the Mind holds Lena's export loop and says so unprompted when asked.
      In-group evidence lands with her return.
- [x] Autonomy #1 — digest FIRED NATIVELY 2026-08-25 ("on my own initiative, no re-asking").
      docs/EVIDENCE/autonomy-digest.md. A clean one still to capture (`/keeper digest`).
- [x] Autonomy #2 — welcome fires on join (evidenced 2026-08-26, @quietfox).
      CheckinScheduler built and tested; its check-in is due 2026-08-27.
- [x] Autonomy #3 — all three digest paths ask for who has gone quiet, and no code computes
      it (asserted by test). Read it out of the clean digest.
- [ ] **Accept:** all five fired with real timestamps, screenshotted into `docs/EVIDENCE/`

## Phase 4 — Human override + moderation log (Aug 23)
- [x] `/keeper pause`, `/keeper resume`, `/keeper undo`, `/keeper why` (plus `/keeper status`
      and `/keeper ask`). Handled entirely in the connector — no Mind call — so they still
      answer when the Mind is slow or out of credits.
- [x] Moderation log complete: action + reasoning + confidence + gated + what we refused
      and why + override status + the Mind's raw reply
- [x] **Accept:** PASSED live 2026-08-26. Keeper replied (msg 48, 03:21:24 HKT); `/keeper undo`
      removed it 17 minutes later and the row carries `overridden`, the note, and
      `overridden_at_ms`. Evidence: docs/EVIDENCE/override.md
      NOTE: an audit before this run found undo would have FAILED on the Mind's own
      unprompted actions (no undo plan persisted) and that a failed undo still marked the
      row overridden. Both fixed; the tracker's earlier "only needs a live run" was wrong.

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
- [x] `pnpm demo:run` stages every beat in order (`--dry-run` prints the run sheet
      offline; live mode preflights the bot/group/admin rights, then waits out the
      measured 23-66s Mind latency without ever triggering Keeper itself)
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
