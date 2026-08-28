# DoraHacks BUIDL — submission copy

Draft for **you** to paste and edit. Filing it is yours, not mine. Everything below is checkable
against the repo or the live URLs; nothing claims work that was not done.

---

## Name
**Keeper — a persistent Community Steward**

## Tagline
Every creator community, run like a relationship — not a rulebook.

## Track
**Track 3 — Moderation & Community Assistance**

## Links
| | |
|---|---|
| Site + dashboard | https://dashboard-chi-one-92.vercel.app |
| Public API | https://connector-production-b5e9.up.railway.app/api/members |
| Repo | https://github.com/OoJae/keeper |
| Video | *(paste after upload)* |

## Builder
Solo, **student** — stated explicitly for Student Prize eligibility.

---

## Description

*(paste as-is; ~400 words)*

Solo creators run their whole business inside community chats, and they run them with bots that
know nobody. MEE6 and Nightbot match keywords. They cannot tell a regular's affectionate insult
from an actual attack, they greet a member returning after a week exactly as they greet a
stranger, and they never notice someone going quiet. The creator absorbs all of it, which is why
burnout is the single most reported problem in creator communities.

**Keeper is a Mind that lives in the community and remembers every member as an ongoing
relationship.**

The persistence is not ours. Keeper's memory lives in the long-term memory of a Mind
(hellominds.ai). Our connector is plumbing: it wraps a Telegram event in an envelope, hands it to
the Mind, and executes the structured directive that comes back. There is no toxicity classifier
in this repository, no scoring function, no reward heuristic — go looking, the README invites it.
The only decisions our code makes are *whether to ask* (a cost filter) and *whether it is safe to
act* (a confidence gate). Every judgment is the Mind's, and the moderation log carries the Mind's
own reasoning string next to each action.

What that buys, all of it evidenced with real timestamps in `docs/EVIDENCE/`:

- **Memory.** Asked from a conversation it had never used, 52 hours after her last message, the
  Mind recalled a member's join date, her switch from CapCut to Premiere, her stuttering-export
  question and the exact proxy walkthrough it had given her — citing its timestamp — and held her
  two Telegram accounts as one person.
- **Continuity.** When she came back, unprompted, Keeper greeted her by name, resumed the thread
  that had died, and re-asked the two questions she never answered. Nothing in our code tracks
  that; there is no open-loops table.
- **Autonomy.** Seven actions with nothing triggering them: a newcomer welcome, a next-day
  check-in, and nightly digests the Mind schedules itself.
- **Proportionality.** A spam account got flagged to the creator first and only deleted on its
  third post. A regular's blunt insult was left alone, because the Mind had four days of context
  saying that is how he talks to friends.
- **Multi-agent.** A second Mind sits in a Circle with the Steward, established programmatically —
  which the public docs say is not possible for Minds.

**What is not built, stated plainly:** the on-chain payout. Three value-moving tools all refuse at
the *equip* step with the same steward-billing gate, and two US$10 purchases did not lift it. So
rewards are autonomous **nominations** the creator approves. The full transcript is in
`docs/API-NOTES.md`, and nothing in the demo claims a transaction.

**Why this needs a Mind at the platform layer:** delete our database and Keeper still knows
everyone. The memory *is* the product.

---

## Pre-submit checklist

- [ ] Video 1.5–2:00, audible, captioned, uploaded, link pasted above
- [ ] **Builder key rotated**, then repo flipped **public** (`gh repo edit OoJae/keeper --visibility public`)
- [ ] Site reachable from a logged-out browser, and /dashboard shows live data
- [ ] Student status stated in the form itself, not only here
- [ ] Confirmation screenshot saved to `docs/EVIDENCE/`

## Judge shortcuts worth pasting into the form

- `docs/MINDS-INTEGRATION.md` — rubric word → feature → code path → evidence, negatives included
- `docs/AUDIT.md` — adversarial review of our own system, findings and fixes
- Try it: open a conversation to the Steward Mind and ask *"who is @lena_learns?"* — it answers
  from memory, in a conversation with no history, about a member it last heard from days ago.
