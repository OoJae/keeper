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
- [x] Demo **supergroup** "Ada's Editing Lab" exists; @KeeperStewardBot is **administrator**
      with `can_delete_messages` + `can_restrict_members` (verified against the Telegram API)
- [x] Creator has `/start`ed the bot — digests arrive as DMs (7 unprompted actions on record)
- [x] Cast confirmed and seeded history posted — 6 members, 36 events, across real elapsed days
      from 2026-08-20. Every timestamp is Telegram's own; none was ever written by hand.
- [x] Day scripts written through recording day (days 1-7, `apps/seeder/src/cast.ts`);
      `pnpm seed:day <n>` posts/prints them, `apps/seeder/README.md` covers how one
      builder drives six cast accounts and why timestamps are never faked
- [x] Days posted through recording day. The history the demo scrolls through is real and dated.

### Spikes (run in order; results land in docs/API-NOTES.md)
- [x] `pnpm spike:api-smoke` — **PASS 7/7**. `X-Api-Key` honoured. **Transport GO.**
- [x] `pnpm spike:memory` teach → ask (10 min gap) — **PASS 3/3** within one conversation
- [x] `--fresh-conversation` — **1/3 strict, but cross-conversation memory IS verified**: the
      Mind cited "the parallel thread" and "your profile summary". It recalls; it refuses to
      *assert* facts it filed as unconfirmed. ⇒ Phase 2 charter must fix this (API-NOTES)
- [x] `pnpm spike:proactive` — **PASS**. Unprompted, server-dated message 74s past the
      deadline. **Native autonomy confirmed — not cron-faked.**
- [x] Circle round-trip **verified, though not via this script**: the Circle was established over
      the API (`POST /v1/circles/{mindId}` `{"emails":[…]}` → `action:"mind_added"`, both
      directions) and the Rewards Mind answered on its own conversation in 46.5s. The spike
      script's manual-introduction step turned out not to be the only route — see API-NOTES.
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
- [x] **Accept: PASSED 2026-08-28 00:26 HKT** — Lena's return was exactly this criterion end to
      end: group message → envelope → Mind → directive → posted reply, with the Mind's reasoning
      in the log (action 67). **The "< ~15s" half is void**: measured latency is 23-200s
      (docs/API-NOTES.md), so the handler returns immediately and the exchange runs on a per-chat
      queue. Evidence: docs/EVIDENCE/returning-member.md

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
- [x] Memory — returning-member recognition **FIRED LIVE 2026-08-28 00:26:17 HKT** after a real
      52h19m gap. Event 59 `member_returned`, action 67 `reply`/high/executed, 77.9s.
      Evidence: docs/EVIDENCE/returning-member.md
- [x] Continuity — **LIVE**. Keeper resumed the proxy walkthrough by name and re-asked both
      unanswered questions, from a vague "still getting that stutter". Also verified cold from a
      never-used conversation: docs/EVIDENCE/memory-continuity.md
- [x] Autonomy #1 — digest FIRED NATIVELY 2026-08-25 ("on my own initiative, no re-asking").
      docs/EVIDENCE/autonomy-digest.md. A clean one still to capture (`/keeper digest`).
- [x] Autonomy #2 — welcome fires on join (evidenced 2026-08-26, @quietfox).
      CheckinScheduler built and tested; its check-in is due 2026-08-27.
- [x] Autonomy #3 — all three digest paths ask for who has gone quiet, and no code computes
      it (asserted by test). Read it out of the clean digest.
- [x] **Accept: PASSED 2026-08-28.** All five behaviours have fired with real timestamps —
      returning-member (returning-member.md), continuity (memory-continuity.md), digest
      (autonomy-digest.md, digest-clean.md), welcome + day-2 check-in (2026-08-26/27),
      at-risk radar (digest-clean.md). **Phase 3 closed.**

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

## Phase 5 — DESCOPED to Plan A on 2026-08-27 (on-chain is not reachable from this account)
- [x] Circle: Steward ↔ Rewards Mind — **works**, both directions, over the API
      (`POST /v1/circles/{mindId}` with `{"emails":[…]}` → `action:"mind_added"`). The
      Rewards Mind answers: `REWARDS-ALIVE HG8NSD` in 46.5s.
- [x] Wallet viability established — **negative, and conclusively.** Three value-moving
      tools were tried against a Mind holding 609 credits and 0.00114 ETH on Base:
      `WALLET_TransferNative`, `WALLET_TransferErc20`, `MENTE_SendToMind`. All three refuse
      at the **equip** step, one layer above execution, with the identical message:
      *"You are not allowed to equip this tool until your steward has paid for cognition
      beyond any initial free cognition credits."* The US$10 purchase is visible to the Mind
      and did not lift it. No transaction was ever constructed. See docs/API-NOTES.md.
- [x] **Descope Plan A executed** (BUILD_PLAN §12) — rewards are autonomous *nominations*:
      the Mind picks the member from its own relationship memory and says why; the creator
      approves. `reward` → `flag_creator` with `converted: reward_needs_human`, worded as a
      recommendation. Removed from mind-watch's unprompted-destructive set, because an
      autonomous nomination has no triggering message by definition.
- [ ] Evidence: one nomination captured into `docs/EVIDENCE/` (needs Steward credits)
- [ ] Video: wallet is the roadmap line in the last 5 seconds, per §12 — **not** claimed as built

> The honest framing for judges and README: the multi-agent Circle is real and demonstrated;
> the on-chain payout is blocked by a platform billing gate we cannot open from the API, and
> is labelled roadmap rather than dressed up. Nothing in the demo claims a transaction.

## Phase 6 — Dashboard (built 2026-08-28)
- [x] Connector HTTP API (`apps/connector/src/api/server.ts`) — reads public, one write (undo)
      behind `KEEPER_ADMIN_TOKEN`. With no token set, writes are refused outright rather than
      left open. 10 tests incl. the auth boundary and the Phase 4 failed-undo regression.
- [x] `undoActionById` extracted — `/keeper undo` and the dashboard share ONE implementation,
      so the override bookkeeping cannot drift between the two surfaces
- [x] `pnpm dashboard:recall` — asks the Mind per member for summary, open loops and **warmth**,
      caches to `var/member-recall.json` (an exchange is 25-200s; a page load cannot wait).
      Runs on a scratch alias, never `keeper-steward`, which the connector polls.
- [x] Relationship graph — size = messages (counted), colour = warmth (**the Mind's judgment**)
- [x] Member timeline rendered from the Mind's own recollection, quoted, with capture timestamp
- [x] Moderation log with reasoning + confidence + gated + converted + override, undo buttons
- [x] Leaderboard + reward **nominations** (Plan A; no transaction implied anywhere)
- [x] "Unprompted actions" feed — `event_id IS NULL`, a property of the data, not a label
- [x] Cognition widget — community exchanges vs total, each labelled with what it measures
- [x] **Accept: PASSED.** Opens on Lena with her four open loops in the Mind's own words.
      Evidence: docs/EVIDENCE/dashboard.png
- [x] **Deploy: LIVE.** Dashboard https://dashboard-chi-one-92.vercel.app (Vercel) reading
      https://connector-production-b5e9.up.railway.app (Railway). The Railway connector runs
      `KEEPER_MODE=api-only`, so **the Telegram bot stays local and there is exactly one poller**
      — the deployment is a public window, not a second Keeper. Undo is disabled there and the
      dashboard says why. Volume seeded and verified: 6 members, 20 actions, 7 unprompted, and
      the Mind's own recollections.
- [ ] Optional cutover: flip Railway to `KEEPER_MODE=full` and stop the local connector, so the
      bot itself is hosted. **Not done on purpose** — do it after recording, never before.

> Found while building this: a directive wrapped in `<pre><code>` with every quote
> backslash-escaped was silently falling back to `none` — Keeper would read spam correctly and
> do nothing. Fixed in `packages/protocol` with the safety guard asserted by test.

## Phase 7 — Demo scenario lock + video (Aug 25–26)
- [x] `pnpm demo:run` stages every beat in order (`--dry-run` prints the run sheet
      offline; live mode preflights the bot/group/admin rights, then waits out the
      measured 23-66s Mind latency without ever triggering Keeper itself)
- [x] Voiceover scripted word-for-word (258) — `docs/DEMO-SCRIPT.md`. Rewritten from BUILD_PLAN
      §10, which had gone stale twice over: it staged Lena returning live (she already returned
      for real on a 52h gap, so re-staging would be a re-enactment §8 forbids) and showed an
      on-chain reward that does not exist. Every beat is now real, dated history.
- [ ] Record segments, stitch, caption; 1.5–2:00 exactly
- [ ] Raw uncut fallback take kept
- [ ] Re-run all Phase 0 spikes (regression canaries against the beta platform) — Aug 26

## Phase 8 — Docs + submission (Aug 26–27)
- [x] `docs/ARCHITECTURE.md` — incl. the deployment topology and the public-API redaction boundary
- [x] `docs/MINDS-INTEGRATION.md` — rubric word → feature → code path → evidence, negatives included
- [x] README: pitch, working/not-working split with evidence links, live URLs, quickstart
- [x] `docs/AUDIT.md` — adversarial review of the whole system, findings and fixes
- [x] **Fresh-clone quickstart TESTED** — cloned to a temp dir, `pnpm install`, `pnpm test`
      (283 passed), `pnpm typecheck` (clean), dashboard built and served against the live API.
      No `.env` in the clone; full-history sweep for secrets: 0.
- [ ] Repo public — **blocked on rotating the Builder key** (pasted into a chat transcript; never
      committed, so history is clean and publishing does not expose it, but rotate first anyway)
- [ ] DoraHacks BUIDL submitted (**Aug 27**) with student status stated; confirmation saved
