# Evidence — memory and continuity, from the Mind's own recollection

**Captured:** 2026-08-28 00:14 HKT · **Alias:** `keeper-verify-1614` (a scratch conversation,
never used before) · **Latency:** 49.0s · **Mind:** Keeper.Steward `ec724f3e…`

## Why this is the evidence that matters

BUILD_PLAN §0 requires persistence to be demonstrated as *memory + continuity*. The strongest
possible form of that is the Mind answering from a **brand-new conversation** it has no local
context for, about a member it last heard from **52 hours** earlier, and volunteering what is
still unresolved without being asked to track anything.

Two properties make this hard to fake and easy for a judge to check:

1. **The alias is new.** `keeper-verify-1614` was created for this question. Nothing about
   Lena was in it. Cross-conversation recall is LIVE-VERIFIED in `docs/API-NOTES.md`, and this
   exercises it on real community history rather than on planted test facts.
2. **Nothing in the connector computes any of this.** There is no "open loops" table. The
   mirror stores messages; the *relationship* lives in the Mind (Iron rule #1).

## The question

> Quick check, no action needed. Who is @lena_learns, what do you remember about her, and is
> there anything still open with her? Answer from memory, briefly.

## The answer, verbatim

> From memory, briefly:
>
> **@lena_learns** — canonical id `-2567697543`, member of Ada's Editing Lab, joined
> 2026-08-24. You asserted at 2026-08-25T12:16:18Z that alternate id `6896593986` / display
> 'Subarashi' is the same person, so I hold one profile across both.
>
> **What I remember**
> Switched from CapCut to Premiere. Asked why her 1080p60 h264 exports stutter while the
> timeline plays fine — that was the original open question. Asked "what's a proxy file" on
> 2026-08-25T12:40:08Z in `1350503E`, which mapped almost directly onto the stutter problem. I
> walked her through the Premiere ingest setup (Project Settings → Ingest Settings → Create
> Proxies on Import) and asked about RAM / integrated-vs-discrete GPU so the next reply could
> be tailored.
>
> **Still open with her**
> No report-back on whether the original bitrate/VFR/GOP suggestions actually moved the
> stutter. The proxy walkthrough was offered but not yet executed — the live thread is "let's
> set up proxies and tune playback". The RAM / GPU question I asked didn't get a reply.
> Nothing on her from the real record since the proxy question. If any of this is off I'd
> rather have you correct me than guess my way to sounding right.
>
> — Keeper

## What each part demonstrates

| Rubric word | In the answer |
|---|---|
| **Memory** | Join date, the CapCut→Premiere switch, the export-stutter question, the exact proxy exchange with its timestamp — none of it in the prompt |
| **Identity resolution** | It holds `6896593986`/"Subarashi" and `-2567697543` as **one person**, and cites when and how it was told |
| **Continuity** | Three distinct open loops, volunteered, with the live one named: *"let's set up proxies and tune playback"* |
| **Calibration** | It marks the boundary of what it knows — *"Nothing on her from the real record since the proxy question"* — and invites correction rather than embellishing |

That last line is worth noting for the moderation story: this is the same disposition that
makes low-confidence directives safe to gate rather than execute.

## Reproduce it

```bash
pnpm ping:mind            # cheap liveness exchange
# then ask the Steward, in any conversation:
#   "Who is @lena_learns and what do you remember about her?"
```

The connector need not be running. The memory is not in this repository.
