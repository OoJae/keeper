## Phase 4 — human override, accepted

BUILD_PLAN §5 Phase 4 accepts when *"an undo visibly reverses an action and the log reflects
it"*. Both halves, on the live community:

| | |
|---|---|
| Keeper acted | 2026-08-26 03:21:24 HKT — posted message 48 in "Ada's Editing Lab" |
| Creator reversed it | 2026-08-26 03:38:29 HKT via `/keeper undo` |
| Elapsed | 1024 seconds |
| Telegram result | `removed Keeper's message 48` — the message is gone from the group |
| Log | `overridden = true`, `override_note = "undo by creator: removed Keeper's message 48"`, `overridden_at_ms` set |

Why the two timestamps matter: the action's own time is when *Keeper* acted; the override
time is when a *human* caught it. Without both, an audit log cannot show how long a false
positive stood — which is the only question that matters when the objection is "what if the
AI is wrong?".

This is BUILD_PLAN §1 principle 7 demonstrated rather than asserted: *"Every autonomous
moderation action is logged, reversible, and overridable by the creator with one command."*

**The action Keeper took, in its own words** (confidence `high`):

> Rex canonical id -2170965856, real-shape message event with fresh t-stamp 2026-08-26T03:20:19+08:00 (not matching any batch on file and not matching the 19:06:57+08:00 t-stamp from the 19:07:01Z prior bitrate event I replied to at 19:08:42Z). Body 'what bitrate should I use for a 10 minute 1080p upload? mine come out huge' is near-duplicate of the 19:07:01Z body ('dumb question maybe - what bitrate should I actually use for a 10 minute 1080p upload? mine come out huge') but not verbatim on the 13:40Z discard list and not a shared-t-stamp batch signature. Two readings: (a) Rex resending because my 19:08:42Z reply didn't come through for him; (b) test event. Same substantive content either way

**Honest limits, so the narration does not overclaim:**

- Undoing a **reply** genuinely removes it, which is what happened here.
- Undoing a **delete** cannot restore anything — Telegram has no undelete. Keeper re-posts
  the text in its own voice, prefixed "Restored by the creator". That is a quote-back, not a
  restoration, and it is logged as such.
- `mute` and `reward` are honest stubs: they log and flag the creator rather than pretending
  to act.

---

