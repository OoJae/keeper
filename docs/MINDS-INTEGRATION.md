# Minds Integration — the 60-second verification

**Purpose:** a judge should be able to confirm Minds Integration Depth without reading the
codebase. Each rubric word maps to a feature, an exact code path, and timestamped
evidence.

**Status:** skeleton — code paths are filled in as phases land; evidence links are added
as behaviors fire for real. Nothing goes in the evidence column that has not actually
happened, with a real timestamp.

---

## The rubric words

| Rubric word | Keeper feature | Code path | Evidence |
|---|---|---|---|
| **Memory** | Every member is a durable relationship profile — join date, interests, contributions, warnings — held in the Steward Mind's own long-term memory. Our DB never stores a judgment or a profile. | `packages/protocol` envelope → `packages/minds-client` → Steward Mind | **[judgment-test.md](EVIDENCE/judgment-test.md)** (2026-08-25, 10/10): asked cold, the Mind recited Lena's join date, her CapCut→Premiere switch and her still-open export loop. |
| **Memory (proof by deletion)** | Delete the SQLite mirror and Keeper still recognizes everyone, because nothing about *who someone is* was ever stored locally. | `apps/connector` SQLite is write-only mirror + audit log | _Pending — the on-camera deletion run. The mirror already holds no judgments: [keeper-log.md](EVIDENCE/keeper-log.md) is dates and counts only._ |
| **Continuity** | Returning members are greeted by picking up the exact thread that died — the Mind tracks "open loops" per member. `last_seen > 48h` promotes an event to `member_returned`. | envelope `type: member_returned` | Code complete and unit-tested to the millisecond. Live evidence lands with Lena's return, which a genuine 48h gap puts no earlier than **2026-08-27 20:07 HKT**. |
| **Autonomous follow-up** | Newcomer welcome, next-day check-in, nightly creator digest, at-risk radar, weekly Top Contributor nomination — none of it prompted. | Mind-native scheduling; connector fallback sources content from Mind memory only | **[autonomy-digest.md](EVIDENCE/autonomy-digest.md)** — digest sent unprompted (*"on my own initiative, no re-asking"*). **[digest-clean.md](EVIDENCE/digest-clean.md)** — clean digest incl. the at-risk radar. Newcomer welcome fired 2026-08-26. |
| **Multi-agent (Circles)** | Steward Mind nominates a Top Contributor from memory and asks the Rewards Mind, through a Circle, to issue it. | `apps/connector/spikes/circle-probe.ts` → Phase 5 flow | _(Phase 5 — descopable per BUILD_PLAN §12)_ |
| **On-chain wallet** | The Rewards Mind's own wallet issues the contributor reward; receipt posted in-chat and on the dashboard. | `apps/connector/spikes/wallet-probe.ts` → Phase 5 flow | _(Phase 5)_ |

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
| Circles | Steward ↔ Rewards agent-to-agent request | `spikes/circle-probe.ts` |
| On-chain wallet | Top Contributor reward issuance | `spikes/wallet-probe.ts` |
| Cognition metering | Pre-filter budget + dashboard cognition meter, measured from the credits endpoint | `packages/minds-client/src/logging/call-log.ts` |

Verified platform behavior — including where the public docs were wrong — is recorded in
[API-NOTES.md](API-NOTES.md).
