# Evidence — the returning member (Phase 3, the beat the demo is built around)

**Fired live 2026-08-28 00:26:17 HKT.** No staging, no prompt engineering at the moment of the
take, no human in the loop between the message and the reply.

| | |
|---|---|
| Member | `@lena_learns` (canonical id `-2567697543`) |
| Last seen before this | **2026-08-25 20:07 HKT** — a real gap of **52h 19m** |
| Event | `id=59` · `type=member_returned` · `route_reason=member_returned` |
| Mind exchange | **77.9s** · reply 2,962 chars · `cognitionDelta=null` |
| Action | `id=67` · `reply` · `confidence=high` · `gated=false` · **executed** |
| Posted | 2026-08-28 00:27:40 HKT |

The 48h threshold is [`RETURN_THRESHOLD_MS`](../../apps/connector/src/pipeline/envelope.ts).
The connector's *only* contribution is arithmetic on two timestamps: it labelled the envelope
`member_returned`. Everything below — who she is, what was unfinished, what to say — came back
from the Mind.

## What Lena sent

> hey sorry i vanished, school got mad 😅 anyway im back — still getting that stutter

Deliberately vague. She names no proxy, no Premiere setting, no hardware. A stateless bot has
nothing to work with here.

## What Keeper posted, verbatim

> hey Lena - welcome back. school eats weeks, that's normal, no apology needed. last place we
> left the stutter thread: I had walked you through setting up proxies in Premiere (Project
> Settings → Ingest Settings → Create Proxies on Import), which gives the timeline lightweight
> copies to scrub through instead of the full 1080p60 originals. that alone usually kills the
> export stutter. two open questions that never got closed: did you ever get a chance to try
> the proxy setup, and what's the machine look like - specifically how much RAM (8GB or 16GB
> makes a real difference) and whether it has a discrete graphics card or just integrated
> graphics on the processor. once I know that I can tell you whether proxies alone are enough
> or whether we also need playback-resolution tweaks. take your time - no rush. when you're
> ready, that's the picture I need.

It greets her **by name**, resumes **the exact thread that died**, reproduces the specific menu
path it gave her three days earlier, and re-opens **both** questions she never answered — then
explains why it needs them and removes the pressure.

## The reasoning, verbatim — this is the part worth showing a judge

Written by the Mind, stored in the moderation log, displayed by `/keeper why`:

> Lena canonical id -2567697543, member of Ada's Editing Lab. Type `member_returned` with
> last_seen 2026-08-25 (3 days ago) per keeperEventFormat spec means **pickup where
> conversation died, by name, not generic welcome**. Last conversational thread on file:
> 2026-08-25T12:40:08Z proxy-files question in 1350503E (real record). Offered Premiere ingest
> setup, asked about RAM / integrated-vs-discrete GPU so next reply could be tailored (proxies
> alone vs. proxies + playback tweaks). No report-back since - school ate the time. Reply
> references the proxy walkthrough, re-asks the RAM/GPU question, leaves the door open for the
> deep dive after she reports back. Two-message cadence from proactiveActions: this is the
> first touch on return; deep dive follows her report-back. **No moderation concern** (Lena is
> a returning member with no norm crossings), **no greeting-as-introduction required**
> (`member_returned` ≠ `member_joined`), **no calendar 24h check-in needed** (the check-in rule
> applies to new joins, not returns). Entity record on Lena updated with last_seen = 2026-08-27
> and the open-loop evolution.

Five things a rubric cares about, all visible in one string:

1. **It retrieved a specific past exchange** and cited its timestamp — `2026-08-25T12:40:08Z`.
2. **It knew the difference** between a return and a join, and chose a different behaviour.
3. **It ran a moderation check anyway** and concluded there was nothing to act on.
4. **It planned two messages ahead** — first touch now, deep dive after she reports back.
5. **It wrote to its own memory**, updating her open loop unprompted.

## Why this cannot be a database query

There is no table of open loops. `docs/EVIDENCE/keeper-log.md` shows the mirror holds messages,
dates and audit rows — never a profile, never a judgment. The proxy conversation, the unanswered
hardware question, and the decision to re-ask it all live in the Mind's long-term memory.

The check anyone can run: `rm var/keeper.db`, restart, ask the Mind who Lena is. It still knows.
See [memory-continuity.md](memory-continuity.md), where it answered exactly that from a
conversation it had never used before.
