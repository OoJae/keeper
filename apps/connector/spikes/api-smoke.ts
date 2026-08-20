/**
 * api-smoke — GO/NO-GO for the entire Messaging API bet.
 *
 * Step 1 uses RAW fetch on purpose: if our adapter has a bug, it must not be able to
 * masquerade as a platform failure. Only once raw fetch proves the platform is up do we
 * exercise @keeper/minds-client. (This is why the health check is step 2 here and step 1
 * in every other spike: the raw probe is a strictly better fail-fast for this one.)
 *
 * PASS  = every endpoint 2xx + parsed + the Mind replied at all (content is NOT graded).
 * FAIL MIND_SILENT = the API is fine and the agent said nothing. That is NOT a NO-GO on
 *                    the transport.
 *
 * Mutable run facts live on `ctx` rather than in `let` bindings: TypeScript keeps
 * narrowing local `let`s that are only assigned inside callbacks, which would make the
 * summary code below unreachable-by-type. Object properties re-widen after each call.
 */
import { randomBytes } from 'node:crypto';

import { createMindClient } from '@keeper/minds-client';
import { z } from 'zod';

import { loadSpikeEnv } from './_shared/env.js';
import {
  apiErrorMessage,
  authHeaderOrder,
  describe,
  isAuthRejection,
  rawRequest,
  summarizeResponse,
  truncate,
  type AuthHeaderName,
} from './_shared/http.js';
import { appendToApiNotes } from './_shared/notes.js';
import { fenced, reporter, shortId, type SpikeReporter } from './_shared/report.js';
import {
  classifyError,
  classifyHealthFailure,
  failSpike,
  requireMessagingApiTransport,
  runSteps,
  type MindReply,
  type MindTransport,
  type Step,
} from './_shared/steps.js';

const r: SpikeReporter = reporter('api-smoke');

const CONVERSATIONS_PATH = '/v1/messaging/conversations';
const CreditsSchema = z.object({ cognition: z.number() }).passthrough();

interface Ctx {
  transport: MindTransport | null;
  workingHeader: AuthHeaderName | null;
  headersTried: string[];
  creditsA: number | null;
  creditsB: number | null;
  creditsC: number | null;
  conversationOk: boolean;
  sendOk: boolean;
  sendRawKeys: string[];
  cursor: string | null;
  /** Server-clock floor from the send receipt; without it an old message reads as a reply. */
  notBefore: Date | null;
  reply: MindReply | null;
  replyLatencyMs: number;
  pongMatched: boolean;
}

const ctx: Ctx = {
  transport: null,
  workingHeader: null,
  headersTried: [],
  creditsA: null,
  creditsB: null,
  creditsC: null,
  conversationOk: false,
  sendOk: false,
  sendRawKeys: [],
  cursor: null,
  notBefore: null,
  reply: null,
  replyLatencyMs: 0,
  pongMatched: false,
};

async function main(): Promise<void> {
  const env = loadSpikeEnv(['MINDS_BUILDER_API_KEY', 'MINDS_MIND_ID'], r);
  const apiKey = env.get('MINDS_BUILDER_API_KEY');
  const mindId = env.get('MINDS_MIND_ID');
  const baseUrl = env.baseUrl;
  const nonce = randomBytes(4).toString('hex').toUpperCase();
  const alias = `keeper-smoke-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const prompt = `Connectivity check ${nonce}. Reply with exactly: PONG ${nonce}`;

  r.info(`base url: ${baseUrl}`);
  r.info(`mind id: ${shortId(mindId)} · alias: ${alias} · nonce: ${nonce}`);
  r.info(`MINDS_AUTH_HEADER preference: ${env.authHeaderPreference}`);

  const steps: Step[] = [
    {
      name: 'RAW fetch (no adapter): GET /v1/messaging/conversations, and learn which auth header the platform honors',
      run: async () => {
        for (const header of authHeaderOrder(env.authHeaderPreference)) {
          ctx.headersTried.push(header);
          r.info(`trying header ${header} …`);
          const response = await rawRequest({ baseUrl, path: CONVERSATIONS_PATH, apiKey, header });
          r.raw(`raw-conversations-${header}`, summarizeResponse(response));

          if (response.networkError) {
            failSpike(
              'ENDPOINT_UNREACHABLE',
              'INFRA',
              `${describe(response)}. No HTTP response at all — DNS, TLS, connection refused, or ` +
                'timeout. Check the network and MINDS_API_BASE_URL before blaming anything else.',
            );
          }
          if (response.status === 404) {
            failSpike(
              'ENDPOINT_NOT_FOUND',
              'INFRA',
              `endpoint not found — GET ${baseUrl}${CONVERSATIONS_PATH} returned 404 ` +
                `${truncate(response.bodyText, 400)}.`,
            );
          }
          if (response.status === 429) {
            failSpike(
              'RATE_LIMITED',
              'INFRA',
              `rate limited on the very first call — ${describe(response)}`,
            );
          }
          // isAuthRejection, not a bare 401/403 check: the platform answers 400 with
          // "Authentication required …" for a request it considers unauthenticated
          // (LIVE-VERIFIED, see _shared/http.ts). Treating that as a plain HTTP_ERROR
          // prints "NO-GO on MessagingApiTransport" for what is really a key/header
          // problem — the one INFRA code the DECISION RULE below says is NOT yet a NO-GO.
          if (isAuthRejection(response)) {
            r.warn(
              `${header} rejected with ${String(response.status)}` +
                `${apiErrorMessage(response) === null ? '' : ` ("${apiErrorMessage(response) ?? ''}")`}` +
                ' — trying the next header',
            );
            continue;
          }
          if (!response.ok) failSpike('HTTP_ERROR', 'INFRA', describe(response));

          ctx.workingHeader = header;
          const count = Array.isArray(response.json) ? response.json.length : null;
          r.pass(
            `${header} accepted (${String(response.status)}, ${response.durationMs}ms)` +
              (count === null
                ? ' — body was NOT a JSON array; see the raw dump above'
                : ` — ${count} conversation(s)`),
          );
          if (count === null) {
            r.warn(
              'GET /v1/messaging/conversations did not return a JSON array; API-NOTES says it ' +
                'returns Conversation[]. Record the real shape.',
            );
          }
          return;
        }
        failSpike(
          'AUTH_REJECTED',
          'INFRA',
          `every auth header was refused as unauthenticated. Tried, in order: ${ctx.headersTried.join(', ')}. ` +
            'Either the key is wrong/expired, or this deployment wants a header we have not tried. ' +
            'Mint a fresh key at https://build.hellominds.ai/console and re-run.',
        );
      },
    },

    {
      name: 'adapter health check (cross-checked against the raw probe above)',
      run: async () => {
        const transport = createMindClient().transport;
        ctx.transport = transport;
        // Before any health verdict: a spike pointed at the telegram-relay STUB would
        // otherwise translate our own MINDS_TRANSPORT line into a platform NO-GO — and
        // step 1 has just proved this platform answers.
        requireMessagingApiTransport(transport);
        const health = await transport.healthCheck();
        r.raw('health-check', health);
        if (health.ok) {
          r.pass(`transport "${transport.kind}" healthy (${health.class}) — ${health.detail}`);
          return;
        }
        // Step 1 has ALREADY proved the platform answers 2xx with this key. An auth failure
        // here is therefore ours (the adapter is sending the wrong header), never the
        // platform's — and calling it INFRA would print "NO-GO on MessagingApiTransport"
        // over a one-line .env fix that this spike has just discovered for the operator.
        if (health.class === 'AUTH') {
          const honored = String(ctx.workingHeader);
          const configured = env.authHeaderPreference;
          const wanted = honored.toLowerCase();
          failSpike(
            'AUTH_HEADER_MISMATCH',
            'PRECONDITION',
            `the platform is UP: step 1 got 2xx from ${baseUrl}${CONVERSATIONS_PATH} using ` +
              `${honored}. The adapter then got ${health.class} because MINDS_AUTH_HEADER is ` +
              `"${configured}". This is our .env, not the platform. FIX: set ` +
              `MINDS_AUTH_HEADER=${wanted} (or =auto) in ${'.env'} and re-run this spike. ` +
              `Adapter detail: ${health.detail}`,
          );
        }
        // Shared with healthGate() so the two paths cannot drift: HealthClass flattens
        // 429/500/503 into UNREACHABLE, and "unreachable" is the wrong day-1 word for a
        // platform that answered — with a status — and merely wants us to back off.
        const failure = classifyHealthFailure(health);
        const answered = failure.status !== null;
        failSpike(
          failure.code,
          failure.cls,
          `raw fetch succeeded with ${String(ctx.workingHeader)} but the adapter's health check ` +
            `failed (${health.class}${answered ? `, HTTP ${String(failure.status)}` : ''}: ${health.detail}). ` +
            (answered
              ? 'The platform ANSWERED, so this is its status, not our adapter and not the ' +
                'network — back off and re-run before reading anything into it.'
              : 'Step 1 already proved the platform is reachable and our key is good, so suspect ' +
                '@keeper/minds-client (base url, header choice, or schema) BEFORE concluding ' +
                'anything about the platform.'),
        );
      },
    },

    {
      name: 'cognition baseline: two consecutive credits reads (does reading credits itself cost credits?)',
      run: async () => {
        ctx.creditsA = await readCredits(baseUrl, mindId, apiKey, ctx.workingHeader, 'credits-1');
        ctx.creditsB = await readCredits(baseUrl, mindId, apiKey, ctx.workingHeader, 'credits-2');
        const a = ctx.creditsA;
        const b = ctx.creditsB;
        if (a === null || b === null) {
          r.warn(
            'credits endpoint unavailable — cognition accounting stays unverified. Non-fatal: it ' +
              'does not affect the transport decision.',
          );
          return;
        }
        const delta = a - b;
        r.pass(
          `cognition ${a} -> ${b} across two back-to-back reads (delta ${delta}). ` +
            (delta === 0
              ? 'Reading credits appears to be FREE.'
              : 'A read-only credits call changed the balance — either the read itself costs credits ' +
                'or the Mind burns credits on background activity. Treat every delta as an estimate.'),
        );
      },
    },

    {
      name: `ensureConversation('${alias}') — exercises the GET-404 -> POST create path`,
      run: async () => {
        const conversation = await transportOrThrow().ensureConversation(alias);
        r.raw('ensure-conversation', conversation.raw);
        ctx.conversationOk = true;
        r.pass(
          `alias ${conversation.alias} -> conversationId ${shortId(conversation.conversationId)}`,
        );
      },
    },

    {
      name: 'send a message and capture the UNDOCUMENTED send response shape',
      run: async () => {
        r.info(`-> ${prompt}`);
        const sent = await transportOrThrow().send(alias, prompt);
        ctx.cursor = sent.cursor;
        ctx.notBefore = sent.notBefore;
        ctx.sendOk = true;
        r.raw('send-response', sent.raw);
        ctx.sendRawKeys =
          sent.raw !== null && typeof sent.raw === 'object' && !Array.isArray(sent.raw)
            ? Object.keys(sent.raw as Record<string, unknown>)
            : [];
        r.info(
          `send response top-level keys: ${ctx.sendRawKeys.length > 0 ? ctx.sendRawKeys.join(', ') : '(not a JSON object)'}`,
        );
        if (sent.cursor === null) {
          r.warn(
            'POST /v1/messaging/message yielded no history cursor (fingerprint). awaitReply must ' +
              'then scan history from the tail instead of using after=<cursor> — slower and racier. ' +
              'Record this: it shapes the connector poll loop.',
          );
        }
        r.pass(
          `message accepted at ${sent.sentAt.toISOString()} · cursor=${sent.cursor ?? 'null'} · ` +
            `reply floor (server clock)=${sent.notBefore?.toISOString() ?? 'none'}`,
        );
      },
    },

    {
      name: 'poll history for a Mind reply (<= 120s) — content is NOT graded',
      run: async () => {
        const started = Date.now();
        let reply: MindReply;
        try {
          reply = await transportOrThrow().awaitReply(alias, {
            cursor: ctx.cursor,
            // Without this floor a Mind that says NOTHING can still make this step pass:
            // the cursor comes from one page of history whose ordering is unverified, so
            // on a newest-first (or `after`-ignoring) server awaitReply happily returns a
            // reply the Mind sent days ago — and this spike would print "Mind replied in
            // 0.0s" and record GO on the transport. notBefore is the server-clock guard.
            notBefore: ctx.notBefore,
            timeoutMs: 120_000,
            pollIntervalMs: 3_000,
            skipEchoOfText: prompt,
          });
        } catch (error) {
          const failure = classifyError(error);
          if (failure.code !== 'MIND_SILENT') throw failure;
          failSpike(
            'MIND_SILENT',
            'MIND',
            'the Mind did not reply within 120s. Every HTTP call in this run was 2xx and parsed, ' +
              'so the Messaging API transport is NOT the problem. Check that the Mind is enabled, ' +
              'has Cognition left, and is not mid-onboarding in the Minds app.',
          );
        }
        ctx.reply = reply;
        ctx.replyLatencyMs = Date.now() - started;
        r.raw('reply', reply.raw);
        ctx.pongMatched = (reply.text ?? '').toUpperCase().includes(`PONG ${nonce}`);
        r.info(`<- [${reply.sender}] ${reply.text ?? '<no text>'}`);
        r.info(
          `content check (informational only): ${ctx.pongMatched ? `saw "PONG ${nonce}"` : `did NOT see "PONG ${nonce}"`}`,
        );
        r.info(
          `senderType mapping: the adapter classified this as sender="${reply.sender}" — confirm ` +
            'against the raw payload above (API-NOTES claims 0|2 = Mind, 1 = human).',
        );
        r.pass(`Mind replied in ${(ctx.replyLatencyMs / 1000).toFixed(1)}s`);
      },
    },

    {
      name: 'cognition after the exchange (per-exchange cost estimate)',
      run: async () => {
        ctx.creditsC = await readCredits(baseUrl, mindId, apiKey, ctx.workingHeader, 'credits-3');
        const b = ctx.creditsB;
        const c = ctx.creditsC;
        if (b === null || c === null) {
          r.warn('cannot compute a per-exchange cognition delta — credits endpoint unavailable.');
          return;
        }
        r.pass(
          `cognition ${b} -> ${c}: one send + one reply cost ~${b - c} credit(s). Estimate only — ` +
            'the Mind may burn credits on background activity at the same time.',
        );
      },
    },
  ];

  await runSteps(r, steps);
  epilogue();

  const path = appendToApiNotes(buildNotes(nonce), {
    spike: 'api-smoke',
    verdict: r.verdict(),
    code: r.code(),
    cls: r.classOf(),
    durationMs: r.elapsedMs(),
    context: {
      baseUrl,
      authHeaderHonored: ctx.workingHeader ?? 'none',
      authHeadersTried: ctx.headersTried.join(' -> ') || 'none',
      alias,
      mindId: shortId(mindId),
      replyLatencyMs: ctx.replyLatencyMs === 0 ? null : ctx.replyLatencyMs,
      cognitionBefore: ctx.creditsB,
      cognitionAfter: ctx.creditsC,
    },
  });
  r.info(`appended verdict + evidence to ${path}`);
  r.finishAndExit();
}

function buildNotes(nonce: string): string {
  const notes: string[] = [];
  const header = ctx.workingHeader;

  notes.push(
    header === null
      ? '**Auth header: UNRESOLVED** — no header was accepted; see the failure above.'
      : `**Auth header: this deployment honors \`${header}\`.** Set \`MINDS_AUTH_HEADER=${header.toLowerCase()}\` in \`.env\`.` +
          (header === 'X-Access-Key'
            ? ' NOTE: this contradicts the hand-written baseline (which calls `X-Api-Key` canonical) ' +
              '— the deprecation has evidently not landed on this deployment.'
            : ''),
  );

  notes.push(
    [
      '| Call | Verified |',
      '|---|---|',
      `| \`GET ${CONVERSATIONS_PATH}\` (raw fetch, no adapter) | ${header ? 'yes' : 'NO'} |`,
      `| adapter \`healthCheck()\` | ${ctx.transport === null ? 'not reached' : 'yes'} |`,
      `| \`ensureConversation(alias)\` | ${ctx.conversationOk ? 'yes' : 'NO / not reached'} |`,
      `| \`POST /v1/messaging/message\` | ${ctx.sendOk ? 'yes' : 'NO / not reached'} |`,
      `| Mind reply within 120s | ${ctx.reply === null ? 'NO' : `yes (${(ctx.replyLatencyMs / 1000).toFixed(1)}s)`} |`,
      `| \`GET /v1/minds/{mindId}/credits\` | ${ctx.creditsA === null ? 'NO' : 'yes'} |`,
    ].join('\n'),
  );

  if (ctx.sendRawKeys.length > 0) {
    notes.push(
      '**Send response shape** (was undocumented). Top-level keys: ' +
        `\`${ctx.sendRawKeys.join('`, `')}\`. History cursor extracted by the adapter: ` +
        `\`${ctx.cursor ?? 'null'}\`.`,
    );
  }

  const a = ctx.creditsA;
  const b = ctx.creditsB;
  const c = ctx.creditsC;
  if (a !== null && b !== null) {
    notes.push(
      `**Cognition.** Two back-to-back credits reads: ${a} -> ${b} (delta ${a - b}` +
        `${a - b === 0 ? ', so the read itself looks free' : ', so a read is NOT provably free'}). ` +
        (c === null
          ? 'Post-exchange read unavailable.'
          : `After one send + one reply: ${b} -> ${c} (~${b - c} credit(s) per exchange).`),
    );
  }

  const reply = ctx.reply;
  if (reply !== null) {
    notes.push(
      `**Mind reply** (${(ctx.replyLatencyMs / 1000).toFixed(1)}s, sender=\`${reply.sender}\`, ` +
        `echoed \`PONG ${nonce}\`: ${ctx.pongMatched ? 'yes' : 'no'}):\n\n${fenced(reply.text ?? '', 'text')}`,
    );
  }

  if (r.warnings().length > 0) {
    notes.push(`**Warnings**\n${r.warnings().map((w) => `- ${w}`).join('\n')}`);
  }

  const failure = r.failure();
  notes.push(
    '**Transport decision:** ' +
      (failure === null
        ? '**GO** on `MessagingApiTransport`.'
        : failure.code === 'AUTH_REJECTED'
          ? '**NO-GO PENDING** — every auth header was refused. A wrong/expired key and a platform ' +
            'that changed its auth are indistinguishable from here, and the first is far likelier. ' +
            'Re-mint the Builder key and re-run BEFORE recording a transport NO-GO.'
          : failure.cls === 'INFRA'
          ? `**NO-GO** on \`MessagingApiTransport\` (INFRA \`${failure.code}\`) — activate the Telegram-relay plan (BUILD_PLAN §5 Phase 0 gate).`
          : failure.cls === 'MIND'
            ? `Transport is **GO** (every HTTP call succeeded); the agent misbehaved (\`${failure.code}\`). This does not block the transport decision.`
            : `No platform verdict — the run stopped on our own setup (\`${failure.code}\`).`),
  );
  return notes.join('\n\n');
}

function epilogue(): void {
  const failure = r.failure();
  r.plain('');
  r.plain('──────────────────────────── DECISION RULE ────────────────────────────');
  r.plain('');
  r.plain('  ANY INFRA-class failure (ENDPOINT_UNREACHABLE, ENDPOINT_NOT_FOUND,');
  r.plain('  SHAPE_DRIFT, RATE_LIMITED)');
  r.plain('     => NO-GO on MessagingApiTransport.');
  r.plain('     => Activate the Telegram-relay plan (BUILD_PLAN §5 Phase 0 gate):');
  r.plain('        human-relay mode first, then automate the relay.');
  r.plain('');
  r.plain('  AUTH_REJECTED is the ONE INFRA code that is not yet a NO-GO. A wrong or');
  r.plain('  expired key looks identical to a platform that changed its auth, and the');
  r.plain('  first is far likelier. Mint a fresh key at build.hellominds.ai/console,');
  r.plain('  paste it into .env (no quotes, no trailing space), re-run. Only if a');
  r.plain('  known-good key is still rejected is this a transport NO-GO.');
  r.plain('');
  r.plain('  MIND-class failures (MIND_SILENT, MIND_WRONG, …)');
  r.plain('     => a feature/scope question about the agent.');
  r.plain('     => They NEVER block the transport decision. Do not conflate the two.');
  r.plain('');
  if (failure === null) {
    r.plain('  THIS RUN: no failures. GO on MessagingApiTransport.');
  } else if (failure.code === 'AUTH_REJECTED') {
    r.plain('  THIS RUN: AUTH_REJECTED — every auth header was refused. Do NOT record a');
    r.plain('            NO-GO yet: re-mint the Builder key and re-run first. If a fresh');
    r.plain('            key is refused too, THEN it is a transport NO-GO.');
  } else if (failure.cls === 'INFRA') {
    r.plain(`  THIS RUN: INFRA failure (${failure.code}) => NO-GO on MessagingApiTransport.`);
  } else if (failure.cls === 'MIND') {
    r.plain(`  THIS RUN: MIND failure (${failure.code}). The transport itself is GO —`);
    r.plain('            every HTTP call succeeded. Treat this as an agent-config issue.');
  } else {
    r.plain(
      `  THIS RUN: PRECONDITION failure (${failure.code}) — our own setup. No verdict on the platform.`,
    );
  }
  r.plain('');
  r.plain('───────────────────────────────────────────────────────────────────────');
}

async function readCredits(
  baseUrl: string,
  mindId: string,
  apiKey: string,
  header: AuthHeaderName | null,
  label: string,
): Promise<number | null> {
  if (header === null) return null;
  const path = `/v1/minds/${encodeURIComponent(mindId)}/credits`;
  const response = await rawRequest({ baseUrl, path, apiKey, header });
  r.raw(label, summarizeResponse(response));
  if (!response.ok) {
    r.warn(`credits read failed — ${describe(response)}`);
    return null;
  }
  const parsed = CreditsSchema.safeParse(response.json);
  if (!parsed.success) {
    r.warn(
      'credits body did not match CognitionBalance {mindId, cognition} — ' +
        truncate(response.bodyText, 300),
    );
    return null;
  }
  return parsed.data.cognition;
}

function transportOrThrow(): MindTransport {
  if (ctx.transport === null) {
    throw new Error('spike bug: transport used before the adapter step created it');
  }
  return ctx.transport;
}

main().catch((error: unknown) => r.crash(error));
