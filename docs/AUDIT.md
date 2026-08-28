# Adversarial review — 2026-08-28

An attempt to break the whole system rather than admire it: the deployed API, the connector, the
protocol, the docs, and the claims. Everything below was checked against the running deployment
or the code, not recalled. Findings are ordered by what they would actually cost.

**Fixed in this pass: 10. Outstanding and stated: 9.**

---

## Fixed

### 1. A real person's data was on a public URL — HIGH
The dashboard went public and took a real human with it. `@quietfox` joined the real Telegram
group; the API published their **real Telegram user id**, handle, display name, join time, their
message content, and the Mind's written behavioural assessment of them (*"brand-new member with a
quiet arrival… lurking past the one-day mark"*). BUILD_PLAN §8 promises *"No real user data"* —
that had been quietly false since the deploy.

**Fixed** in `apps/connector/src/api/redact.ts`: pseudonymised, not deleted, because deleting the
row would delete Phase 3's autonomy evidence (Keeper welcomed a newcomer and checked in a day
later). Real ids map one-way to a stable synthetic id; a lookup by the real id is refused so the
mapping cannot be probed; the dashboard *says* a row is pseudonymised rather than quietly showing
a fake name.

### 2. Redacting fields was not enough — the Mind writes prose about people — HIGH
The first fix mapped every structured column and the live API **still leaked the real id five
times**, in `reasoning`, `message` and `targetHandle`. The moderation log's value *is* the Mind's
prose, so it cannot simply be dropped.

**Fixed**: free text is scrubbed wherever it appears — reasoning, message, detail, override notes,
event content, recall summaries — including *a fictional member's summary that named the real
one*, which row-by-row redaction would never have caught. Verified by sweeping every live endpoint
for the id, the handle and the display name: **0 occurrences**.

Deliberate limit, asserted by test: a display name under 5 characters is left alone in ordinary
prose. This person's is `Lol`; mangling every "lol" in a chat log to protect a string that
identifies nobody would corrupt the evidence. The Mind's canonical `display:'Lol'` form *is*
scrubbed, because there it is unambiguously the person.

### 3. Operational internals were public — MEDIUM
`/api/actions` published the Mind's complete raw reply, undo plans, the group chat id and posted
message ids — the coordinates of a private group. **Fixed**: all withheld; the dashboard gets a
`reversible` boolean, which is all a button ever needed.

### 4. The whole community database sat in Railway's variable store — MEDIUM
The first-boot seed shipped as `KEEPER_SEED_DB_B64_*`. Once the volume held live data those
variables could never be read again — only leaked. **Fixed**: deleted, along with a leftover
`KEEPER_FORCE_RESEED`.

### 5. "connector live" over frozen data — MEDIUM (honesty)
The deployed mirror is a snapshot; nothing writes to it because the bot is local. The badge said
"connector live", true of the API and misleading about the data. **Fixed**: `/api/health` publishes
`dataAsOfMs`, and the badge now reads **"mirror snapshot · newest activity 2h ago"**.

### 6. Non-constant-time token comparison — LOW
`!==` returns as soon as two bytes differ. Not realistically exploitable over a network for a
192-bit token, but there is no reason to hand out the signal. **Fixed**: `timingSafeEqual`, with a
length check first (which would otherwise throw and leak the length).

### 7. No backoff on repeated auth failures — LOW
12 rapid wrong-token attempts all returned instantly. **Fixed**: backoff after 5 consecutive
failures and a log line carrying the count. The token is not brute-forceable; the point is that an
open endpoint should not be a free, silent oracle.

### 8. The demo harness was enabled on the deployment — LOW
`KEEPER_SEED_ATTRIBUTION=true` shipped to Railway. Inert there (api-only never starts the seed
inbox), but it is the switch that lets a file forge community members. **Fixed**: `false` in
production.

### 9. Docs disagreed with reality — MEDIUM (submission risk)
`ARCHITECTURE.md` predated the API, the dashboard and the deployment entirely, and the tracker
*understated* progress — Phase 1's acceptance criterion was still unchecked despite Lena's return
being exactly that criterion, end to end. A judge reading it would conclude less was built than
is. **Fixed**: both updated.

---

### 10. Three surfaces said the group was private. It is public — MEDIUM (accuracy)
`README.md`, `docs/MINDS-INTEGRATION.md` and the live dashboard all described "Ada's Editing Lab"
as a **private** group. It has a public username (`@adaeditinglab`) and Telegram serves a join
page: *"You can view and join @adaeditinglab right away."* Three surfaces stating something
checkably false, on a project whose entire pitch is *check me*.

**Fixed**, and turned into the thing it should always have been: judges are now told they can join
at <https://t.me/adaeditinglab>, ask an editing question, and watch what Keeper does with it. The
`/proof` page previously told them to "open a conversation to the Steward Mind" — an instruction
requiring an API key they do not have, addressed to the exact audience that cannot follow it.

The privacy posture is unchanged and still holds: real accounts were already pseudonymised
everywhere the product is public, which is the correct treatment whether the group is public or
not.

## Outstanding — deliberate or needing a human

### A. The Builder API key must be rotated before the repo goes public — **ACTION REQUIRED**
Git history is clean (swept for JWTs, bot tokens, private keys: nothing). `.env` was never
tracked; `.env.example` holds only placeholders. **But the key was pasted into a chat transcript**,
so it should be rotated at build.hellominds.ai/console and updated in `.env` and Railway. Do it
*after* recording — rotating mid-demo breaks the connector.

### B. `postcss` HIGH advisory in the Next build chain
Two path-traversal advisories via `apps/site > next > postcss`. Build-time only, and it
processes *our* CSS, so it is not attacker-reachable here. Fixing it means moving Next off its
pinned transitive dependency — not worth destabilising a working build before a recording.

### C. `vitest` CRITICAL advisory — dev-only
Arbitrary file read *when the Vitest UI server is listening*. We never run the UI. No production
path.

### D. Concurrent undo is read-check-act with no lock — LOW
Two simultaneous requests for the same action can both pass the `!overridden` check. Worst case is
a second `deleteMessage` that Telegram rejects and a second override note. A single creator with
one button makes this theoretical.

### E. CORS is not an access control
It restrains browsers only; `curl` ignores it entirely, and the read endpoints are public by
design. Stated here so nobody mistakes the allow-list for authorisation. **The redaction layer —
not CORS — is what makes the reads safe.**

### F. The dashboard has no tests
283 tests cover the connector and protocol. The React components and the undo proxy route have
none. The proxy's behaviour is asserted indirectly through the connector's API tests.

### G. The public dashboard will drift further out of date
It is a snapshot by design (see §5). Re-seeding is manual. The badge makes the age visible, which
is the honest minimum, but a judge visiting in a week sees week-old data.

### I. The bot judges would interact with runs on the builder's machine
The deployed connector is `api-only` by design — one Telegram poller, and it is the local one. So
the dashboard and the API are up 24/7, but **Keeper only answers in the group while the local
connector is running**. A judge who joins and posts while it is off sees nothing happen, and the
deployed mirror will not show their message either, because nothing writes to it.

Closing this means a cutover: `KEEPER_MODE=full` on Railway and stopping the local connector, so
the bot is hosted. The Steward has ~612 credits, the recording is done, and the risk that made this
worth deferring has passed. It is a deliberate, reversible decision — not a defect — but it is the
difference between judges *reading* Keeper and judges *using* it.

### H. Keeper can still moderate a real person
`@quietfox` is a real account in a moderated group. Confidence gating, the destructive-action
fence and `/keeper undo` all apply, and nothing has been directed at them — but the demo community
is not purely fictional, and the README should not imply it is.

---

## Checked and found sound

- **No secrets in git history** — full-history sweep for JWTs, bot tokens, hex keys: clean.
- **`.env.example` complete** — every key in `.env` is documented; no real values.
- **No XSS surface** — no `dangerouslySetInnerHTML` anywhere; React escapes the Mind's HTML.
- **Errors leak nothing** — bad ids, unknown routes and malformed input all return a bare
  `{"error":"not_found"}`; no stack traces, no internal paths.
- **Duplicate auth headers fail closed** — Node yields an array, which is rejected.
- **Watcher state is bounded** — `mind_watch_claimed` is one fingerprint (53 bytes), not a set.
- **Creator commands are id-checked** with a refusal cooldown against reply-flooding.
- **Every documented command exists** — all 10 in CLAUDE.md resolve to real scripts.
- **The undo path has one implementation**, shared by Telegram and the dashboard, with the Phase 4
  regression (a failed undo marking the row overridden) asserted from both surfaces.
