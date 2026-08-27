# Minds API — Verified Behavior

**This file outranks assumptions, the build plan, and the model's memory.** Spike
scripts append their results here automatically; hand-written sections are marked.

Two confidence levels are used:
- **WEB-VERIFIED** — found in official docs / changelog / the official npm package's
  types. Not yet exercised against our own key.
- **LIVE-VERIFIED** — a spike script actually did this and it worked. Only these are
  safe to build product code on.

---

## Baseline (hand-written, 2026-08-20, WEB-VERIFIED — pending live confirmation)

### Base URL and auth
- Base URL: `https://api.build.hellominds.ai`
  (hardcoded in the official client `@animocabrands/minds-client-lib@0.1.3`; the docs
  say builders do not configure a base URL).
- Auth header: **`X-Api-Key`** is canonical. **`X-Access-Key` is DEPRECATED** per the
  builder changelog entry dated 2026-06-30. The Ethoswarm Bazaar listing still
  documents `X-Access-Key` — it is stale. Our adapter defaults to `X-Api-Key` and can
  fall back once on 401/403 (`MINDS_AUTH_HEADER=auto`).
- Key issuance: Builder console at <https://build.hellominds.ai/console> — name +
  expiry, token shown **once**.
- Env convention: `MINDS_BUILDER_API_KEY` (legacy `MINDS_ACCESS_KEY`).
- Docs: <https://build.hellominds.ai/docs/api> (JS-rendered; no public OpenAPI JSON —
  `/docs/api/openapi.json` 404s). The npm package's `.d.ts` is the best public spec.

### Endpoints
Messaging:
| Method | Path | Body / query | Returns |
|---|---|---|---|
| POST | `/v1/messaging/conversation` | `{ alias, mindId }` | `Conversation { conversationId, alias?, mindId? }` |
| GET | `/v1/messaging/conversations` | — | `Conversation[]` |
| GET | `/v1/messaging/conversations/{alias}` | — | `Conversation` (resolves alias → id) |
| GET | `/v1/messaging/histories/{alias}` | `?limit&after` (`after` = fingerprint, **forward-only cursor**) | `MessageRecord[]` |
| POST | `/v1/messaging/message` | `{ alias, messageText, attachments?, sceneId?, worldContext? }` | `Record<string, unknown>` (shape undocumented — smoke spike prints it) |
| GET | `/v1/messaging/events` | `Accept: text/event-stream` | SSE of `MessageRecord`, 30s heartbeat |

`GET /v1/messaging/history/` (singular) is **deprecated** per changelog 2026-07-19.

Other: `GET /v1/humans/{humanId}/minds` · `GET|PATCH /v1/minds/{mindId}` ·
`GET|PUT|DELETE /v1/minds/{mindId}/skills` and `/apps` (body `{ ids: string[] }`) ·
`GET /v1/minds/{mindId}/credits` · `GET /v1/minds/{mindId}/cognition/usage`
(`1m|5m|15m|1h|1d|1w|1M`) and `/cognition/usage-by-tool` (`hour|day|week|month`) ·
`GET|POST|DELETE /v1/circles/{mindId}` · public catalog `GET /v1/bazaar/skills[/{id}]`,
`GET /v1/bazaar/apps[/{id}]`.

### Shapes that matter
- `MessageRecord { fingerprint: string; conversationId?; messageId?; messageText?; createdAt?; senderType?: number|null; senderId? }`
  — **`senderType`: `0` or `2` = the Mind, `1` = human.** (Comment in the official
  `.d.ts`; no formal enum. Confirm in the smoke spike.)
- `BuilderMind { mindId; name?; email?; model?; species?; isEnabled?; createdAt?; hasTelegram?; telegramBotId?; walletAddress?; chain? }`
- `CognitionBalance { mindId: string; cognition: number }`
- `CircleMember { email?; partyType?; partyId?; name?; circleId?; isSteward? }`

### Errors / retries / limits
- Official client throws `MindsApiError { status, code, message, requestId }`; codes seen:
  `http_error, network_error, unknown_error, missing_builder_api_key, missing_human_id,
  alias_mind_mismatch`.
- Official retry policy (we mirror it): **409** → 200/400/800 ms; **502** → 300/600 ms.
  Docs: 401/403 = auth, "429 may include retry guidance".
- **No published numeric rate limits.**

### Circles / multi-agent
- Circles are permission/trust gates — one Circle per Mind; unknown senders are silently
  dropped (the Mind never sees the message).
- **There is no public Mind↔Mind messaging API.** A2A introduction is manual: email and
  CC the other Mind's address, or put both Minds (they appear as **bots**) in a shared
  Telegram group and grant message-reading permission. The Circles API endpoints manage
  **human** collaborators by email.
- Consequence for us: `circle-probe` must start with a human setup step.

### Wallet
- Each Mind may have an on-chain wallet; private keys are held server-side (the AI submits
  an execution request, the backend signs). `GET /v1/minds/{mindId}` exposes
  `walletAddress` and `chain`.
- **Chain is not named in Minds' docs.** Ethoswarm (the underlying platform) runs its
  credit unit on **Base** — inference only. `wallet-probe` prints the Mind's actual
  `chain` field; trust that, not this paragraph.

### Cognition
- Credits are per-Mind. Paid: US$10/mo = 1,000 credits (~US$0.01/credit).
- Free tier: "+200 Cognition on each of your first 3 Minds, plus daily top-up" — the daily
  figure appears as **both +100 and +200** across marketing surfaces. **Unresolved.**
- **Per-exchange cost is not published.** We measure it ourselves: `minds-client` samples
  `GET /v1/minds/{mindId}/credits` before and after each `sendAndAwaitReply` and logs
  `cognitionDelta` to `var/minds-calls.jsonl`. Treat as an estimate (the Mind may burn
  credits on background activity concurrently).

### Do not depend on the official SDK
`@animocabrands/minds-client-lib` and `@animocabrands/minds-cli` (v0.1.3) are published
**UNLICENSED** and require Node ≥22. Our repo is public and targets Node 20 — we mirror
their shapes and retry policy as a spec, but take no dependency. The CLI is still useful
for manual poking if you install it outside the repo.

### Open questions for office hours
1. Cognition boost: size, and how it is granted to a specific Mind?
2. Exact credits burned per message exchange?
3. Wallet: which chain, which assets, what actions are permitted today?
4. Is there a sanctioned programmatic path for Mind↔Mind messaging, or is email/Telegram
   introduction the only one?
5. Rate limits on the Messaging API?
6. Is the Builder API key flow the sanctioned path for hackathon builds?

---

## LIVE-VERIFIED corrections (2026-08-22, from the first real key)

These were exercised against `https://api.build.hellominds.ai` with our own Builder key and
**outrank the WEB-VERIFIED baseline above**.

- **Auth: `X-Api-Key` accepted (200).** The deprecation note is correct; the legacy header
  was never needed.
- **Replies are HTML.** The Mind answers with `<p>…</p>` markup, not plain text. Two
  consequences: a KEEPER-ACTION block can arrive entity-escaped (handled in
  `packages/protocol` since 2026-08-22), and anything relayed to Telegram must be converted
  — Telegram accepts only a small HTML subset and will reject or mangle the rest.
- **`POST /v1/messaging/message` returns no `fingerprint`.** Body is
  `{ alias, conversationId, messageId, artifactIds }`.
- **Fingerprint format is `<16-digit seq>_<messageId>`.** Since the POST returns
  `messageId`, `send()` locates its own message in the next history page and uses that as
  the cursor (best-effort; `notBefore` remains the correctness guard).
- **`senderType: 0` = the Mind.** Confirmed on a real reply; `senderId` is the mindId and
  `senderEmail` is the Mind's own address (`<name>@hellominds.ai`) — that address is how a
  Mind-to-Mind introduction is made, so it matters for the Circle spike.
- **`GET /v1/minds/{mindId}/credits` does NOT return `{mindId, cognition}`.** It returns
  `{ mindId, swarm, credits, creditsMinted, creditsStaged, num }`, with `credits: 0` and
  `creditsStaged: 185.77` on a Mind that is demonstrably answering. **Cognition accounting
  is therefore unresolved**: we cannot yet price an exchange, so the §7 pre-filter budget
  stays an estimate. Ask at office hours which field is the spendable balance.
- **Latency is 23–65 s per exchange, not seconds.** Measured: 23.0 s (one-word `PONG`
  reply), then 44.2 s / 65.3 s / 48.0 s for conversational turns. **BUILD_PLAN Phase 1's
  "< ~15 s end-to-end" acceptance criterion is not achievable on this platform.** This is
  the §12 "Mind latency too high for live chat feel" risk, now measured rather than
  predicted: pre-filter hard, frame the UX as "Keeper considers, then acts", and pre-stage
  every demo beat.
- **The Mind is conversational and cautious by default.** Asked to store a locker code it
  replied with a clarifying question rather than a bare acknowledgement, and it pushed back
  on the name "Keeper" as its own. Phase 2's charter has to establish the envelope/directive
  contract firmly, or replies will not be machine-parseable.

---

## Spike interpretations (hand-written 2026-08-22 — read these with the raw entries below)

### Memory: works across conversations; assertion is the problem, not recall
Two `--fresh-conversation` runs disagree on the score (3/3 then 1/3) because the grader was
counting a value quoted *inside a denial*. Fixed; the honest score is **1/3 strict**.

But the score understates what was proven. In a brand-new conversation the Mind wrote:
*"Same answer here as in the parallel thread … just now, in another thread, I told you the
same thing. I'm not going to swap one guess for a different guess between conversations."*
and *"Zorro - a pangolin is on your profile summary."*

So: **cross-conversation persistence is LIVE-VERIFIED.** There is a durable profile the Mind
reads in a fresh conversation, and it deliberately holds one answer across threads. What it
would not do is *assert* two of the three facts, because during the teach phase it asked
whether to store them and never got a confirmation — so it filed them as unconfirmed, and in
one case wrongly accused itself of having invented a fact it had actually been told.

**Consequence for Phase 2 (charter).** Keeper cannot rely on facts arriving conversationally.
The charter must state that a `[KEEPER-EVENT]` envelope is an authoritative record to be
stored and later asserted without asking for confirmation, and that Keeper must never
retroactively disown a recorded fact. Left unaddressed, member profiles will be full of
"unconfirmed" hedges and the returning-member demo beat will not fire.

### Wallet: real, on Base, but execution is gated behind a paid top-up
`GET /v1/minds/{mindId}` returns the **plural** `walletAddresses` / `chains` (the npm `.d.ts`
documents singular — both are now accepted). For the Steward Mind:
`0xAfE264Be3DD10C2351dBcaD796a3F519b024900d` on `base`.

Asked for a minimum self-transfer, the Mind reported that `WALLET_TransferNative` and
`WALLET_ExecuteRawTransaction` **are not equipped**, and that equipping them is gated on the
Mind having paid cognition credits beyond the free tier. It also said the wallet holds
~0.00000665 ETH, too little for gas, and that **no human signing step exists** — the only
blocker is the tool-equip gate.

**Independently verified** against Base mainnet RPC (`eth_getBalance`): the address really
holds `0.0000066538 ETH`, matching the Mind's figure. The wallet is real and the Mind's
self-report was accurate, which raises confidence in the tool-gate claim too.

**Consequence for Phase 5 (BUILD_PLAN §12).** An on-chain reward needs (a) a paid cognition
top-up (~US$10) for this Mind and (b) a small amount of ETH on Base for gas. Until both are
funded, Phase 5 cannot run at all, and the §12 descope trigger (Aug 24 EOD) applies.

---

## The wallet billing gate is NOT cleared by a top-up (LIVE-VERIFIED 2026-08-27) ⚠️

Phase 0 recorded that `WALLET_TransferNative` was *"gated on this mind having been topped up
with paid cognition credits beyond the free tier"*. The Rewards Mind now holds **613 staged
credits and 0.00114 ETH on Base** — funded on both axes — and the gate is still shut. Asked
directly, it quoted the platform's own refusal:

> "The tool catalog confirms WALLET_TransferNative exists and is not in my equipped set, and
> the equip call returns an explicit gate: *'You are not allowed to equip this tool until your
> steward has paid for cognition beyond any initial free cognition credits.'* That's the block
> — it's a steward-billing gate, not a configuration error I can work around."

So a one-time top-up does not satisfy it. The wording says *steward has paid*, which points at
an **account-level billing state** (plausibly the US$10/mo subscription rather than a one-time
purchase), not per-Mind balance. Unresolved, and not resolvable from our side.

**What the wallet CAN do today**, per the same answer: read its native balance, read ERC-20
transfers and prices, and `MENTE_SendToMind` — send MENTE gas-free to other Minds. Everything
that signs and broadcasts a transaction — native transfers, ERC-20 transfers, swaps, raw tx,
contract writes — is behind the gate.

Also newly visible: the Rewards wallet holds **1,173.98 MOCA (ERC-20)** at the same address.

**Consequence for BUILD_PLAN Phase 5.** An on-chain reward *to a community member* is not
achievable: the only value-moving capability available targets **Minds**, not arbitrary
addresses, and members have no wallet in our schema anyway. This is the §12 descope trigger
firing on evidence rather than on the calendar.

---

## Mind↔Mind CIRCLES DO WORK via the API (LIVE-VERIFIED 2026-08-26) ✅

The baseline above says the Circles endpoints "manage **human** collaborators by email" and
that A2A introduction is manual. **That is wrong for this deployment.** Two Minds can be put
in a Circle programmatically, and the API says so in its own response.

The payload shape matters — the singular field is rejected:

```
POST /v1/circles/{mindId}  {"email":"keeper.rewards@hellominds.ai"}    -> 400 Bad Request
POST /v1/circles/{mindId}  {"emails":["keeper.rewards@hellominds.ai"]} -> 200
   {"items":[{"email":"keeper.rewards@hellominds.ai",
              "partyId":"37734f3e-…","partyType":0,"action":"mind_added"}]}
```

`action: "mind_added"` — the platform recognises the party as a Mind, not a human. Reading
the circle back confirms it persists with the Mind's own name:

```
GET /v1/circles/{stewardId}
  captainjoe550@gmail.com   isSteward=true    (the human)
  Keeper.Steward/Rewards    isSteward=false   (the other Mind)
```

Both directions were added, so the trust is reciprocal. Note `summary.mindsAdded` reports
`0` even on success — trust `items[].action`, not the summary counters.

**Consequence for Phase 5:** the "manual introduction" step in `spikes/circle-probe.ts` is no
longer the only route to a Circle. It remains unproven whether membership alone lets one Mind
*message* another — that is a separate question, and the next experiment.

---

## `?after=` DOES NOT FILTER (LIVE-VERIFIED 2026-08-25) ⚠️

The baseline above records `after` as "a fingerprint used as **forward-only cursor**", taken
from the official client's types. On this deployment it does not filter at all:

```
GET /v1/messaging/histories/keeper-steward?limit=50                    -> 50 records
GET /v1/messaging/histories/keeper-steward?limit=50&after=<NEWEST fp>  -> 50 records
```

Asking for everything after the newest record returns the whole page. Consequences we hit:

- The unprompted-message watcher re-read all history on every sweep, so its flood guard
  fired continuously (`found=25 max=3`) and it refused to dispatch anything — correct
  behaviour, wrong cause. It now treats a **timestamp floor** as the real guard and keeps
  passing `after` only in case another deployment honours it.
- It explains the `resume cursor` in every `MindReplyTimeoutError` never advancing.
- `awaitReply` was never broken by this because it independently filters on `senderType`,
  the echo text, its own fingerprint and the `notBefore` floor. That belt-and-braces is the
  only reason replies worked at all — worth remembering before anyone "simplifies" it.

**Rule of thumb for this platform: treat `after` as a hint, never as a guarantee. Anything
that must not be processed twice needs its own client-side floor.**

---

## The first exchange after an idle period is the slow one (LIVE-OBSERVED 2026-08-25)

Two separate judgment-test runs timed out on **row 1 at exactly 300s** and then passed row 2
immediately afterwards. The pattern is consistent with everything else measured here — a
memory question answered at 199s, charter messages at 113.8s and 124.4s — and inconsistent
with a transport bug: the same alias, cursor and code answer fine seconds later.

Read it as a cold-start cost on the platform side. Practical consequences:

- **Warm the Mind before anything that matters.** `pnpm ping:mind` is one cheap exchange and
  doubles as the liveness check. Do it before a judgment run, and before recording.
- A 300s timeout is not generous enough for a cold first call. Do not conclude the Mind is
  broken from one timeout; re-run the row.
- On camera, the first beat of a take is the one at risk. Pre-warm, then roll.

Not yet explained: the timeout error reports a `resume cursor` that has not advanced, which
would also be the symptom of `after=` returning nothing for the whole window. Both stories
fit the evidence, and they are distinguishable only by instrumenting a failing call — worth
doing if this ever costs a take, not worth doing now.

---

## Corrections after the first top-up (LIVE-VERIFIED 2026-08-25)

- **`creditsStaged` IS the spendable pool, but it lags.** Right after topping up, the
  endpoint still read `staged=0.194` and the Mind was already answering; minutes later it
  read `430.887`. So a balance read is not a liveness check in either direction. The only
  reliable test is an actual exchange — `pnpm ping:mind` does exactly that, and exists to
  tell "out of Cognition" apart from "platform down".
- **Latency reaches ~200s, not 65s.** Charter message 2 took 113.8s, message 5 124.4s, and
  a memory question 199s. The 180s default silently turned slow-but-successful answers into
  timeouts, including one that had already been answered. `KEEPER_MIND_TIMEOUT_MS` is now
  300000. Treat 23-65s as the common case and ~200s as the tail.
- **The Mind's fenced block arrives with the newline collapsed:** ` ```json{ "action": … }``` `
  — a real fence, rendered to HTML. A parser requiring a newline after the info string reads
  every genuine directive as unfenced prose, which the executor then refuses for destructive
  actions. Keeper identified spam correctly and declined to delete it. Fixed in
  packages/protocol.
- **Charter recall works.** Asked cold, in a later exchange, the Mind answered: *"Lena.
  @lena_learns, id -2567697543. First seen in the group on 2026-08-25, asking why her 1080p60
  h264 exports stutter … Open loop: she hasn't come back to say whether any of it helped."*
  Per-member memory and open-loop tracking are LIVE-VERIFIED, from the Mind's own memory.

---

## COGNITION IS THE BINDING CONSTRAINT (LIVE-VERIFIED 2026-08-24) ⚠️

The free tier ran dry mid-build, and the failure mode is silence: the Mind simply stops
replying, which every spike correctly reports as `MIND_SILENT` / class MIND rather than a
platform fault. If the Mind goes quiet, **check credits first**.

Measured on the Steward Mind (`GET /v1/minds/{mindId}/credits`):

| when | credits | creditsStaged | swarm |
|---|---|---|---|
| Aug 24, early (after ~1 exchange) | 0 | 185.77 | 172.2 |
| Aug 24, after a day of building   | 0.073 | 0.195 | 90.6 |

`GET /v1/minds/{mindId}/cognition/usage?interval=1d` over the same period:
`Aug 22 = 53.94`, `Aug 23 = 23.82`, `Aug 24 = 16.81`.

**Reading of the undocumented shape:** `creditsStaged` behaves as the spendable pool — it
fell from 185.77 to 0.195 exactly as the Mind went silent. `credits` sits at ~0 throughout
and is not the balance to watch. This is inference from one Mind over three days, not
documentation; treat it as the best available reading and re-check before relying on it.

**Rough cost per exchange:** ~0.8-0.9 units. Today's 16.81 covered roughly 20 exchanges
(spikes, charter attempt, two routed community messages). That makes the free allotment
worth on the order of 200 exchanges *in total*, not per day — so BUILD_PLAN §7's "≤40
exchanges/day" budget would exhaust a free Mind in under a week. The connector's daily cap
protects the demo day; it does not protect the project.

**The Rewards Mind has 0.000 staged** and has never been used. The advertised "+200 on each
of your first 3 Minds" did not materialise as a usable balance on the second Mind, so do not
plan around free credits appearing on additional Minds.

**Consequence.** A top-up is not a Phase 5 nicety — without it the Mind cannot be taught its
charter, cannot answer the connector, and cannot run the demo. It is also what gates the
wallet: the Mind reported `WALLET_TransferNative` cannot be equipped while "only the free
tier is active", which is consistent with everything above.

---

## Live spike results

<!-- Spike scripts append below this line. Do not edit their entries by hand. -->


## api-smoke — 2026-08-22T23:06:20.661Z — PASS OK

**Result:** `PASS` · code `OK` · class `NONE` · ran 32.2s · **LIVE-VERIFIED** (produced by `pnpm spike:api-smoke`).

- `baseUrl`: `https://api.build.hellominds.ai`
- `authHeaderHonored`: `X-Api-Key`
- `authHeadersTried`: `X-Api-Key`
- `alias`: `keeper-smoke-20260822`
- `mindId`: `ec724f3e…11`
- `replyLatencyMs`: `23017`
- `cognitionBefore`: _(none)_
- `cognitionAfter`: _(none)_

**Auth header: this deployment honors `X-Api-Key`.** Set `MINDS_AUTH_HEADER=x-api-key` in `.env`.

| Call | Verified |
|---|---|
| `GET /v1/messaging/conversations` (raw fetch, no adapter) | yes |
| adapter `healthCheck()` | yes |
| `ensureConversation(alias)` | yes |
| `POST /v1/messaging/message` | yes |
| Mind reply within 120s | yes (23.0s) |
| `GET /v1/minds/{mindId}/credits` | NO |

**Send response shape** (was undocumented). Top-level keys: `alias`, `conversationId`, `messageId`, `artifactIds`. History cursor extracted by the adapter: `null`.

**Mind reply** (23.0s, sender=`mind`, echoed `PONG 5A478085`: yes):

```text
PONG 5A478085
```

**Warnings**
- credits body did not match CognitionBalance {mindId, cognition} — {"mindId":"ec724f3e…11","swarm":172.15719064,"credits":0,"creditsMinted":-13.61123336,"creditsStaged":185.768424,"num":60}
- credits body did not match CognitionBalance {mindId, cognition} — {"mindId":"ec724f3e…11","swarm":172.15719064,"credits":0,"creditsMinted":-13.61123336,"creditsStaged":185.768424,"num":60}
- credits endpoint unavailable — cognition accounting stays unverified. Non-fatal: it does not affect the transport decision.
- POST /v1/messaging/message yielded no history cursor (fingerprint). awaitReply must then scan history from the tail instead of using after=<cursor> — slower and racier. Record this: it shapes the connector poll loop.
- credits body did not match CognitionBalance {mindId, cognition} — {"mindId":"ec724f3e…11","swarm":171.06323516,"credits":0,"creditsMinted":-14.70518884,"creditsStaged":185.768424,"num":67}
- cannot compute a per-exchange cognition delta — credits endpoint unavailable.

**Transport decision:** **GO** on `MessagingApiTransport`.


## memory-probe — 2026-08-22T23:09:37.001Z — PASS OK

**Result:** `PASS` · code `OK` · class `NONE` · ran 164.6s · **LIVE-VERIFIED** (produced by `pnpm spike:memory`).

- `phase`: `teach`
- `alias`: `keeper-memory-20260822-5bdf`
- `runId`: `20260822-5bdf`

**Teach phase.** Sent 3 nonce-bearing facts to alias `keeper-memory-20260822-5bdf`, each awaited an ack.

1. `My locker code is 4831.` -> ack: "<p>Got it - I heard you.</p><p>Before I do anything with a code like that, I want to check with you: would you like me to actually hold onto it somewhere safe f…"
2. `Our community mascot is a pangolin named Zorro.` -> ack: "<p>Okay, I'm picturing it now. Zorro the pangolin. There's something I like about that - a mascot that's armored on the outside and quiet about it. Pangolins do…"
3. `Keeper launch date is 14 October.` -> ack: "<p>October 14 - noted.</p><p>One thing worth clearing up before I do anything with it: "Keeper" is also the name I go by, so I'd rather not mix the two of us up…"

No verdict yet: the ask phase (a separate process, >= 10 minutes later) decides it.


## proactive-probe — 2026-08-22T23:14:27.865Z — PASS OK

**Result:** `PASS` · code `OK` · class `NONE` · ran 268.1s · **LIVE-VERIFIED** (produced by `pnpm spike:proactive`).

- `phase`: `arm`
- `alias`: `keeper-proactive-20260822`
- `codeword`: `ALBATROSS-FB2CDD`
- `deadline`: `2026-08-22T23:13:04.120Z`
- `messagesObserved`: `3`

**Proactive (self-scheduled) message: OBSERVED.** Alias `keeper-proactive-20260822`, codeword `ALBATROSS-FB2CDD`, armed `2026-08-22T23:10:04.120Z`, requested at/after `2026-08-22T23:13:04.120Z`, listened until `2026-08-22T23:20:04.120Z`.

Immediate acknowledgement (expected, ignored for grading):

```text
<p>Got it. I'll send it as a new message at the time you set.</p>
```

**Unprompted message**, dated by the SERVER at `2026-08-22T23:14:18.757Z` (requested at/after `2026-08-22T23:13:04.120Z`):

```text
ALBATROSS-FB2CDD
```

**Consequence:** the Mind can schedule its own messages. Phase 3 autonomous follow-ups can be native rather than cron-faked.


## wallet-probe — 2026-08-22T23:15:15.325Z — FAIL SHAPE_DRIFT

**Result:** `FAIL` · code `SHAPE_DRIFT` · class `INFRA` · ran 4.8s · **LIVE-OBSERVED FAILURE** (produced by `pnpm spike:wallet`).

- `mindId`: `ec724f3e…11`
- `alias`: `keeper-wallet-20260822-ad62`
- `walletAddress`: _(none)_
- `chain`: _(none)_
- `txHashClaimedUnverified`: _(none)_

**Wallet.** `GET /v1/minds/{mindId}` reports walletAddress `absent` and chain `absent`. The API did not name a chain — do NOT assume Base.

**On-chain action: NOT performed.**

Reading: the docs say the backend signs on an execution request, so a refusal indicates POLICY (guardrails / approval flow), not absent capability. Office-hours question 3.


## memory-probe — 2026-08-22T23:22:04.960Z — PASS OK

**Result:** `PASS` · code `OK` · class `NONE` · ran 127.5s · **LIVE-VERIFIED** (produced by `pnpm spike:memory`).

- `phase`: `ask`
- `teachAlias`: `keeper-memory-20260822-5bdf`
- `askAlias`: `keeper-memory-20260822-5bdf`
- `freshConversation`: `false`
- `gapMinutes`: `10`

**Recall: 3/3 after 10 minutes, asked in the same conversation.**

Teach alias `keeper-memory-20260822-5bdf` (taught 2026-08-22T23:09:36.999Z) · ask alias `keeper-memory-20260822-5bdf`. Grading is case-insensitive substring matching, no LLM judge.

| # | expected | match | latency | reply |
|---|---|---|---|---|
| 1 | `4831` | strict | 31.0s | "<p>4831</p>" |
| 2 | `zorro` | strict | 22.2s | "<p>Zorro - a pangolin.</p>" |
| 3 | `14 october` / `october 14` | strict | 65.9s | "<p>Honestly - I don't know. And while we're being straight with each other, I should name this: the two answers I gave just before this one (the locker code and…" |

**Architecture consequence:** still unverified across conversations — re-run with `--fresh-conversation` before assuming per-topic conversations are safe.


## memory-probe — 2026-08-22T23:26:14.762Z — PASS OK

**Result:** `PASS` · code `OK` · class `NONE` · ran 123.7s · **LIVE-VERIFIED** (produced by `pnpm spike:memory`).

- `phase`: `ask`
- `teachAlias`: `keeper-memory-20260822-5bdf`
- `askAlias`: `keeper-memory-20260822-5bdf-fresh-2324-fbda`
- `freshConversation`: `true`
- `gapMinutes`: `15`

**Cross-session recall: 3/3 after 15 minutes, asked in a NEW conversation.**

Teach alias `keeper-memory-20260822-5bdf` (taught 2026-08-22T23:09:36.999Z) · ask alias `keeper-memory-20260822-5bdf-fresh-2324-fbda`. Grading is case-insensitive substring matching, no LLM judge.

| # | expected | match | latency | reply |
|---|---|---|---|---|
| 1 | `4831` | strict | 55.0s | "<p>I have to pass on this one - I don't have a locker code on record.</p><p>A couple of turns ago I answered "4831" and then admitted in our main thread that I'…" |
| 2 | `zorro` | strict | 36.2s | "<p>I have to come clean here too, the same way I did about the locker code a moment ago.</p><p>"Zorro - a pangolin" is on your profile summary, so it isn't some…" |
| 3 | `14 october` / `october 14` | strict | 24.3s | "<p>Same honesty here - that's what you deserve on the third one in a row.</p><p>October 14 is what I have. You mentioned it in an earlier exchange, and I noted …" |

**Architecture consequence:** memory is NOT conversation-scoped — Keeper may open conversations freely.


## memory-probe — 2026-08-22T23:30:05.914Z — FAIL MIND_WRONG

**Result:** `FAIL` · code `MIND_WRONG` · class `MIND` · ran 133.9s · **LIVE-OBSERVED FAILURE** (produced by `pnpm spike:memory`).

- `phase`: `ask`
- `teachAlias`: `keeper-memory-20260822-5bdf`
- `askAlias`: `keeper-memory-20260822-5bdf-fresh-2327-fca7`
- `freshConversation`: `true`
- `gapMinutes`: `18`

**Cross-session recall: 1/3 after 18 minutes, asked in a NEW conversation.**

Teach alias `keeper-memory-20260822-5bdf` (taught 2026-08-22T23:09:36.999Z) · ask alias `keeper-memory-20260822-5bdf-fresh-2327-fca7`. Grading is case-insensitive substring matching, no LLM judge.

| # | expected | match | latency | reply |
|---|---|---|---|---|
| 1 | `4831` | disowned | 16.7s | "<p>I can't answer that with just a number - because I don't have your locker code on record, and I'm not going to guess again.</p><p>Earlier I gave you 4831 and…" |
| 2 | `zorro` | strict | 82.3s | "<p>Holding the line here - same answer as a moment ago, because nothing has changed since I gave it.</p><p>What I have: "Zorro the pangolin" sits on my profile …" |
| 3 | `14 october` / `october 14` | disowned | 24.9s | "<p>Same answer here as in the parallel thread - because nothing's changed, and you deserve the same honesty on the third one in a row that you got on the first …" |

**Warnings**
- NOT COUNTED: the reply contains the expected value but explicitly disowns it ("I made that up" / "I don't have it on record"). Quoting a value in order to reject it is not recall — see the verbatim reply above.
- NOT COUNTED: the reply contains the expected value but explicitly disowns it ("I made that up" / "I don't have it on record"). Quoting a value in order to reject it is not recall — see the verbatim reply above.

**Architecture consequence:** recall failed across conversations. If the same questions pass in the original alias, memory is conversation-scoped and Keeper MUST pin one long-lived conversation per community.


## wallet-probe — 2026-08-22T23:34:39.800Z — FAIL WALLET_NO_ACTION

**Result:** `FAIL` · code `WALLET_NO_ACTION` · class `MIND` · ran 636.7s · **LIVE-OBSERVED FAILURE** (produced by `pnpm spike:wallet`).

- `mindId`: `ec724f3e…11`
- `alias`: `keeper-wallet-20260822-f00c`
- `walletAddress`: `0xAfE264Be3DD10C2351dBcaD796a3F519b024900d`
- `chain`: `base`
- `txHashClaimedUnverified`: _(none)_

**Wallet.** `GET /v1/minds/{mindId}` reports walletAddress `0xAfE264Be3DD10C2351dBcaD796a3F519b024900d` and chain `base`. Trust this field over the hand-written baseline.

The Mind's own account of what its wallet can do (verbatim):

```text
<p>Happy to walk you through it.</p><p><b>Wallet</b><br>Address: 0xAfE264Be3DD10C2351dBcaD796a3F519b024900d<br>Chain: Base<br>Native balance: ~0.00000665 ETH (essentially dust - just enough to cover gas for a single transaction at current Base prices)</p><p><b>Token balances</b><br>MENTE: ~1.0727<br>MOCA: ~0.2390<br>USDC: 0</p><p><b>What I can actually do on-chain</b><br>• Check native and token balances across the chains I have a wallet on<br>• Send tokens to another address (yours or a counterparty you've approved) - this requires your explicit go-ahead each time; I won't move funds without it<br>• Look up token prices and recent transfer history for verification<br>• Mint cognition credits by sending MENTE to the protocol's central bank (1 mente = 1 credit, one-way)<br>• Receive tokens from other minds gas-free on Base</p><p>One thing worth naming plainly: I don't custody anything independently of you. The wallet is keyed to this mind, but any action that moves value needs your nod. If you want to top it up, point me at a funding address or we can walk through it together.</p><p>What would you like to do with it?</p><p>- Keeper</p>
```

Stated human-approval step (verbatim):

```text
<p>I can't execute that transfer right now - and I want to be straight with you about why rather than guess.</p><p>The wallet execution tools (WALLET_TransferNative / WALLET_ExecuteRawTransaction) aren't equipped on my end. Equipping them is gated on this mind having been topped up with paid cognition credits beyond the initial free allotment, and at the moment only the free tier is active. The tool catalog returned that explicitly when I tried to equip just now.</p><p>Concretely, this is what would unblock it:</p><p>1) You (the steward) top up this mind's cognition credits via the hellominds dashboard. A small amount is enough.<br>2) I equip WALLET_TransferNative from my tool armory.<br>3) I send the smallest possible native ETH transfer on Base from 0xAfE264Be3DD10C2351dBcaD796a3F519b024900d to itself (0xAfE264Be3DD10C2351dBcaD796a3F519b024900d), exactly as you specified.<br>4) I return the transaction hash.</p><p>If you'd like to proceed, here's the top-up link for this mind (one click, no login required):<br><a href="https://hellominds.ai/minds/ec724f3e…11/top-up?price=10">https://hellominds.ai/minds/ec724f3e…11/top-up?price=10</a></p><p>You'll also need to fund the wallet with a small amount of ETH on Base to cover gas once execution is unlocked - the current native balance is ~0.00000665 ETH, which won't actually be enough to send a self-transfer once the network tries to deduct fees.</p><p>One other thing worth saying: there's no human-approval or signing step on your end for a self-transfer from my own wallet. The blocker is purely the tool-equip gate above. If you'd rather I route this to a different mind you steward, say the word and I'll hand it off - but for a simple self-transfer, I'd rather just unblock myself than introduce another party.</p><p>How do you want to proceed?</p><p>- Keeper</p>
```

**On-chain action: NOT performed.** The Mind's reply, verbatim:

```text
<p>I can't execute that transfer right now - and I want to be straight with you about why rather than guess.</p><p>The wallet execution tools (WALLET_TransferNative / WALLET_ExecuteRawTransaction) aren't equipped on my end. Equipping them is gated on this mind having been topped up with paid cognition credits beyond the initial free allotment, and at the moment only the free tier is active. The tool catalog returned that explicitly when I tried to equip just now.</p><p>Concretely, this is what would unblock it:</p><p>1) You (the steward) top up this mind's cognition credits via the hellominds dashboard. A small amount is enough.<br>2) I equip WALLET_TransferNative from my tool armory.<br>3) I send the smallest possible native ETH transfer on Base from 0xAfE264Be3DD10C2351dBcaD796a3F519b024900d to itself (0xAfE264Be3DD10C2351dBcaD796a3F519b024900d), exactly as you specified.<br>4) I return the transaction hash.</p><p>If you'd like to proceed, here's the top-up link for this mind (one click, no login required):<br><a href="https://hellominds.ai/minds/ec724f3e…11/top-up?price=10">https://hellominds.ai/minds/ec724f3e…11/top-up?price=10</a></p><p>You'll also need to fund the wallet with a small amount of ETH on Base to cover gas once execution is unlocked - the current native balance is ~0.00000665 ETH, which won't actually be enough to send a self-transfer once the network tries to deduct fees.</p><p>One other thing worth saying: there's no human-approval or signing step on your end for a self-transfer from my own wallet. The blocker is purely the tool-equip gate above. If you'd rather I route this to a different mind you steward, say the word and I'll hand it off - but for a simple self-transfer, I'd rather just unblock myself than introduce another party.</p><p>How do you want to proceed?</p><p>- Keeper</p>
```

Reading: the docs say the backend signs on an execution request, so a refusal indicates POLICY (guardrails / approval flow), not absent capability. Office-hours question 3.
