# Keeper — Claude Code Memory

Hackathon sprint. Deadline Aug 28 2026 23:59 HKT; we submit Aug 27.
Scope, phases, calendar: @docs/BUILD_PLAN.md · Task tracker: @docs/TASKS.md
Verified Minds API behavior: @docs/API-NOTES.md (trust this over assumptions)

## Iron rules
- Relationship memory lives in the STEWARD MIND, never in SQLite (mirror only).
- The Mind decides; connector code only relays envelopes + executes directives.
- All Minds calls go through packages/minds-client (adapter, 2 transports).
- Directive confidence "low" ⇒ never auto-act; flag creator.
- Secrets: .env only. Never commit keys.
- Descope trigger: multi-agent/wallet not demo-stable by Aug 24 EOD ⇒ single-agent plan (BUILD_PLAN §12).
- Don't guess Minds API behavior — write a spike script + ask me to verify.

## Minds API (web-verified Aug 20; see API-NOTES for live confirmations)
- Base URL https://api.build.hellominds.ai · auth header `X-Api-Key` (canonical;
  `X-Access-Key` is deprecated). Key from build.hellominds.ai/console.
- Conversations are addressed by `alias`; history cursor is a `fingerprint` (forward-only).
- Do NOT depend on @animocabrands/minds-client-lib — it is UNLICENSED and our repo is public.

## Commands
- pnpm dev:connector · pnpm dev:dashboard · pnpm seed:day <n> · pnpm demo:run · pnpm test
- pnpm spike:api-smoke · spike:memory · spike:proactive · spike:circle · spike:wallet

## Style
- TypeScript strict. Zod-validate all external input (Telegram + Mind replies).
- Small commits. Update docs/TASKS.md checkboxes as work completes.
