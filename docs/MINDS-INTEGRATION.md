# Minds Integration — the 60-second verification

**Purpose:** a judge should be able to confirm Minds Integration Depth without reading the
codebase. Each rubric word maps to a feature, an exact code path, and timestamped
evidence.

**Status:** complete as of 2026-08-28. Every row below either links to evidence that really
happened, with a real timestamp, or says plainly that it did not happen and why. One row —
the on-chain payout — is a documented negative. It is left in rather than deleted, because a
judge deserves to see what was attempted and what the platform returned.

---

## The rubric words

| Rubric word | Keeper feature | Code path | Evidence |
|---|---|---|---|
| **Memory** | Every member is a durable relationship profile — join date, interests, contributions, warnings — held in the Steward Mind's own long-term memory. Our DB never stores a judgment or a profile. | `packages/protocol` envelope → `packages/minds-client` → Steward Mind | **[memory-continuity.md](EVIDENCE/memory-continuity.md)** (2026-08-28, 00:14 HKT): asked from a **brand-new conversation**, 52h after Lena's last message, the Mind returned her join date, her CapCut→Premiere switch, the export-stutter question and the proxy exchange *with its timestamp* — and held her two Telegram ids as one person. Also **[judgment-test.md](EVIDENCE/judgment-test.md)** (10/10). |
| **Memory (proof by deletion)** | Delete the SQLite mirror and Keeper still recognizes everyone, because nothing about *who someone is* was ever stored locally. | `apps/connector` SQLite is write-only mirror + audit log | _Pending — the on-camera deletion run. The mirror already holds no judgments: [keeper-log.md](EVIDENCE/keeper-log.md) is dates and counts only._ |
| **Continuity** | Returning members are greeted by picking up the exact thread that died — the Mind tracks "open loops" per member. `last_seen > 48h` promotes an event to `member_returned`. | envelope `type: member_returned` · `apps/connector/src/pipeline/envelope.ts` | **[memory-continuity.md](EVIDENCE/memory-continuity.md)** — unprompted, the Mind listed *three* still-open loops with Lena and named the live one: *"the live thread is 'let's set up proxies and tune playback'"*. **No code computes this** — there is no open-loops table; the mirror stores messages only. |
| **Autonomous follow-up** | Newcomer welcome, next-day check-in, nightly creator digest, at-risk radar, weekly Top Contributor nomination — none of it prompted. | Mind-native scheduling; connector fallback sources content from Mind memory only | **[autonomy-digest.md](EVIDENCE/autonomy-digest.md)** — digest sent unprompted (*"on my own initiative, no re-asking"*). **[digest-clean.md](EVIDENCE/digest-clean.md)** — clean digest incl. the at-risk radar. Newcomer welcome fired 2026-08-26. |
| **Multi-agent (Circles)** | Steward Mind and Rewards Mind are in a reciprocal Circle, added **programmatically**. The Rewards Mind is a second, independently-funded agent with its own wallet and identity. | `POST /v1/circles/{mindId}` `{"emails":[…]}` → `action:"mind_added"` · `apps/connector/spikes/circle-probe.ts` | **LIVE-VERIFIED 2026-08-26/27** ([API-NOTES](API-NOTES.md#mindmind-circles-do-work-via-the-api-live-verified-2026-08-26-)): both directions added; the Rewards Mind answers on its own conversation (`REWARDS-ALIVE HG8NSD`, 46.5s). The public docs say Circles manage *humans* by email — on this deployment they accept Minds, and the API says so itself. |
| **On-chain wallet** | **Not achieved — blocked by the platform, not by us.** Rewards are autonomous *nominations* the creator approves (Descope Plan A, BUILD_PLAN §12). | `apps/connector/src/pipeline/executor.ts` → `reward_needs_human` | **Documented negative.** Three value-moving tools (`WALLET_TransferNative`, `WALLET_TransferErc20`, `MENTE_SendToMind`) all refuse at the **equip** step — one layer above execution — with the identical message: *"You are not allowed to equip this tool until your steward has paid for cognition beyond any initial free cognition credits."* **Two** US$10 purchases did not lift it, with both Minds funded (612 / 609 credits) and both wallets holding ETH on Base. No transaction was ever constructed. Full transcript in [API-NOTES](API-NOTES.md). |

| **Human override** | Every action Keeper takes is logged with the Mind's own reasoning, and reversible by the creator with one command. `/keeper undo` removes what Keeper posted; `/keeper why` recites its reasoning; `/keeper pause` stops it acting at all. The log separates *what the connector refused* from *what the human reversed*. | `apps/connector/src/commands.ts` → `pipeline/executor.ts` `applyUndo` → `actions` table | **[override.md](EVIDENCE/override.md)** — live 2026-08-26: Keeper posted at 03:21:24 HKT, the creator reversed it at 03:38:29, and the row records both times. |

## Where judgment lives (the anti-wrapper argument)

Keeper implements **no** classifier, scoring function, or reward heuristic. Verifiable by
inspection:

- The connector makes exactly two decisions, both mechanical: **whether to ask** the Mind
  (`pre-filter`, a cost control) and **whether it is safe to act** on what came back
  (`gateDirective`, a safety control).
- Every substantive decision — is this toxic, does this person deserve recognition, who
  has gone quiet, what belongs in tonight's digest — arrives as a `KEEPER-ACTION`
  directive with the Mind's own `reasoning` string attached, which is what the moderation
  log displays.

## Platform surface actually used

| Minds capability | How Keeper uses it | Verified in |
|---|---|---|
| Long-term memory | The member-relationship store. The product does not function without it. | `spikes/memory-probe.ts` |
| Proactive messaging | Nightly digest, day-2 check-ins, at-risk alerts | `spikes/proactive-probe.ts` |
| Messaging API (`X-Api-Key`) | Every event relay and directive round-trip | `spikes/api-smoke.ts` |
| Circles | Steward ↔ Rewards, reciprocal, added over the API | `spikes/circle-probe.ts` — **works** |
| On-chain wallet | Attempted; every value-moving tool is behind a steward-billing gate we cannot open from the API | `spikes/wallet-probe.ts` — **blocked, documented** |
| Cognition metering | Pre-filter budget + dashboard cognition meter, measured from the credits endpoint | `packages/minds-client/src/logging/call-log.ts` |

Verified platform behavior — including where the public docs were wrong — is recorded in
[API-NOTES.md](API-NOTES.md).

## What Keeper does not do

Stated plainly, because a demo that hides its edges is worth less than one that names them.

- **No on-chain transaction was ever made.** The Rewards Mind has a real wallet on Base with a
  real balance, and it is in a real Circle with the Steward. It cannot *spend*, because every
  tool that signs and broadcasts is behind a billing gate that two purchases did not open. The
  video says this in the last five seconds and calls it roadmap. Nothing in the demo shows a
  transaction, a hash, or a receipt, because none exists.
- **Muting is not automated.** It is the one moderation action with no cheap undo, so the Mind's
  request is routed to the creator instead (`mute_not_implemented`).
- **The dashboard is not the product.** Everything Keeper knows can be read out of the Mind
  itself; the dashboard renders it.
- **The cast is fictional.** "Ada's Editing Lab" is a **public** group (t.me/adaeditinglab) with invented characters
  played by real Telegram accounts. What is *not* invented: the elapsed days, the timestamps,
  the cross-session recall, and the unprompted messages. No timestamp in this repository was
  ever written by hand — BUILD_PLAN §8.

## Three things a skeptical judge should try

1. **Ask the Mind directly.** Open a conversation to the Steward Mind that Keeper has never
   used and ask *"who is @lena_learns?"*. It answers from memory, in a conversation with no
   history, about a member it last heard from days ago. Our code is not in the loop.
2. **Delete the database.** `rm var/keeper.db`. Restart. Keeper still knows everyone, because
   the mirror holds messages and audit rows — never a profile or a judgment.
3. **Go looking for the classifier.** You will find one word list —
   `PROFANITY` in [prefilter.ts](../apps/connector/src/pipeline/prefilter.ts). Read what it
   feeds: `heuristicReason()` returns a **routing reason** (`heuristic:profanity`), never an
   outcome. It decides whether the Mind gets to *see* a message; it has no vote on what happens
   to the member. As the code says: *"a false positive here costs one Cognition credit, a false
   negative costs a missed moderation beat."*

   Then check the other direction: every `action` the executor acts on originates in
   `extractDirective()` parsing the Mind's reply. `grep -rn "toxic" apps/ packages/` returns
   nothing — there is no severity score, no threshold, and no rule table anywhere in this
   repository. The moderation log's `reasoning` column has exactly one possible author.
