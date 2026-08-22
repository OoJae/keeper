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
