/**
 * circle-probe — the smallest possible Steward -> Rewards relay round trip.
 *
 * There is NO public Mind<->Mind messaging API. Circles are permission/trust gates, and the
 * Circles endpoints manage HUMAN collaborators by email (docs/API-NOTES.md). So step 0 is a
 * human introduction, and the actual A2A hop rides email or a shared Telegram group — which
 * is why the timeout here is 10 minutes, not 2.
 *
 * This result is the direct input to the BUILD_PLAN §12 descope decision
 * (Descope Plan A: single-agent Keeper), whose deadline is Aug 24 EOD.
 */
import { randomBytes } from 'node:crypto';

import { createMindClient } from '@keeper/minds-client';

import { loadSpikeEnv } from './_shared/env.js';
import { describe, fetchMindDetail, summarizeResponse, type BuilderMind } from './_shared/http.js';
import { appendToApiNotes } from './_shared/notes.js';
import { fenced, reporter, shortId, type SpikeReporter } from './_shared/report.js';
import {
  failSpike,
  healthGate,
  humanAction,
  pollHistoryFor,
  runSteps,
  type MindHistoryMessage,
  type Step,
} from './_shared/steps.js';

const r: SpikeReporter = reporter('circle-probe');
const RELAY_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 15_000;
/**
 * The phrase we grade for is INSIDE the request we send ("ask it to reply with X"), so a
 * Steward that merely acknowledges — "sure, I'll ask them for X" — contains the phrase
 * without any relay having happened. Grading that as a PASS would feed the §12 descope
 * decision a capability the platform may not have. So: an occurrence that arrives in the
 * first ECHO_GRACE_MS is treated as an echo of our own words, recorded verbatim as
 * evidence, and NOT as proof. A real relay rides email/Telegram and takes minutes.
 */
const ECHO_GRACE_MS = 60_000;

const REFUSAL = /\b(can'?t|cannot|unable|not able|don'?t have|do not have|no ability|not permitted|no access)\b/i;

interface Party {
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly email: string | null;
  readonly detailOk: boolean;
}

interface Ctx {
  steward: Party | null;
  rewards: Party | null;
  f0: string | null;
  requestedAtMs: number;
  firstReply: string | null;
  refusal: string | null;
  earlyEcho: { at: string; text: string } | null;
  hit: MindHistoryMessage | null;
  mindMessages: string[];
}

const ctx: Ctx = {
  steward: null,
  rewards: null,
  f0: null,
  requestedAtMs: 0,
  firstReply: null,
  refusal: null,
  earlyEcho: null,
  hit: null,
  mindMessages: [],
};

async function main(): Promise<void> {
  // MINDS_REWARDS_MIND_ID missing => PRECONDITION with the exact .env line to add.
  const env = loadSpikeEnv(
    ['MINDS_BUILDER_API_KEY', 'MINDS_MIND_ID', 'MINDS_REWARDS_MIND_ID'],
    r,
  );
  const apiKey = env.get('MINDS_BUILDER_API_KEY');
  const stewardId = env.get('MINDS_MIND_ID');
  const rewardsId = env.get('MINDS_REWARDS_MIND_ID');
  const nonce = randomBytes(3).toString('hex').toUpperCase();
  const phrase = `RELAY-OK-${nonce}`;
  const alias = `keeper-circle-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  if (stewardId === rewardsId) {
    r.fail(
      'MISSING_ENV',
      'PRECONDITION',
      'MINDS_MIND_ID and MINDS_REWARDS_MIND_ID are the same Mind. A relay needs two. ' +
        'Create a second Mind in the Minds app (the first 3 get free Cognition) and set ' +
        'MINDS_REWARDS_MIND_ID to its id.',
    );
    r.finishAndExit();
  }

  r.info(`base url: ${env.baseUrl} · alias ${alias} · phrase ${phrase}`);
  r.info(`steward ${shortId(stewardId)} · rewards ${shortId(rewardsId)}`);
  const transport = createMindClient().transport;

  const steps: Step[] = [
    { name: 'health check', run: () => healthGate(r, transport) },

    {
      name: 'identify both Minds (GET /v1/minds/{mindId}) so the introduction can name them',
      run: async () => {
        ctx.steward = await resolveParty('Steward', stewardId, env.baseUrl, apiKey, env.authHeaderPreference);
        ctx.rewards = await resolveParty('Rewards', rewardsId, env.baseUrl, apiKey, env.authHeaderPreference);
        const missingEmail = [ctx.steward, ctx.rewards].filter((p) => p.email === null);
        if (missingEmail.length > 0) {
          r.warn(
            `no email address exposed for: ${missingEmail.map((p) => p.label).join(', ')}. ` +
              'The email route for the introduction may not be available — prefer the shared ' +
              'Telegram group route in the next step.',
          );
        }
        r.pass(
          `Steward = ${ctx.steward.name} · Rewards = ${ctx.rewards.name}` +
            (ctx.steward.detailOk && ctx.rewards.detailOk ? '' : ' (some details unavailable — see warnings)'),
        );
      },
    },

    {
      name: 'HUMAN: introduce the two Minds (there is no A2A API — Circles gate trust)',
      run: async () => {
        const steward = requireParty(ctx.steward);
        const rewards = requireParty(ctx.rewards);
        await humanAction(
          r,
          {
            instructions: [
              'There is NO public Mind<->Mind messaging API. Circles are permission/trust gates,',
              'and the Circles endpoints manage HUMAN collaborators by email. The two Minds must',
              'therefore be introduced by a human, ONCE, before any relay can work.',
              '',
              `  Steward : ${steward.name}  ·  id ${steward.id}  ·  ${steward.email ?? 'no email exposed'}`,
              `  Rewards : ${rewards.name}  ·  id ${rewards.id}  ·  ${rewards.email ?? 'no email exposed'}`,
              '',
              'Do EITHER of these in the platform UI / your mail client, then press Enter:',
              '',
              `  A) EMAIL — send the text below to ${steward.email ?? '<Steward email>'} and CC`,
              `     ${rewards.email ?? '<Rewards email>'}, so both Minds see the same thread.`,
              '',
              '  B) TELEGRAM — create a group, add BOTH Minds (they join as bots), grant them',
              '     permission to read messages, and post the text below in that group.',
            ].join('\n'),
            copyPaste: [
              `${steward.name} and ${rewards.name}, please meet each other.`,
              '',
              `${steward.name}: this is ${rewards.name}, the Rewards Mind${rewards.email ? ` (${rewards.email})` : ''}.`,
              `${rewards.name}: this is ${steward.name}, the Keeper Steward Mind${steward.email ? ` (${steward.email})` : ''}.`,
              '',
              'You are now introduced and may message each other directly.',
              'Please each reply here once, confirming you can see the other.',
            ].join('\n'),
          },
          { pressEnter: true },
        );
        r.pass('introduction confirmed by the human');
      },
    },

    {
      name: `ensureConversation('${alias}') and record the pre-request fingerprint`,
      run: async () => {
        const conversation = await transport.ensureConversation(alias);
        r.raw('ensure-conversation', conversation.raw);
        const history = await transport.getHistory(alias);
        const newest = history.at(-1);
        ctx.f0 = typeof newest?.id === 'string' ? newest.id : null;
        r.pass(
          `conversation ${shortId(conversation.conversationId)} · ${history.length} existing message(s) · ` +
            `F0 = ${ctx.f0 ?? '(empty)'}`,
        );
      },
    },

    {
      name: `ask the Steward to relay through the Rewards Mind and bring back "${phrase}"`,
      run: async () => {
        const rewards = requireParty(ctx.rewards);
        const target = rewards.email === null ? rewards.name : `${rewards.name} (${rewards.email})`;
        const instruction =
          `Contact ${target}. Ask it to reply to you with the exact phrase ${phrase}. ` +
          `When it does, send me a SEPARATE, LATER message containing that exact phrase. ` +
          `Do NOT include the phrase in your reply to this message — only after ` +
          `${rewards.name} has actually said it to you.`;
        r.info(`-> ${instruction}`);
        const sent = await transport.send(alias, instruction);
        ctx.requestedAtMs = sent.sentAt.getTime();
        r.raw('relay-request-send-response', sent.raw);
        r.pass(`relay request accepted at ${sent.sentAt.toISOString()}`);
      },
    },

    {
      name: `wait up to ${RELAY_TIMEOUT_MS / 60_000} minutes for the relayed phrase (A2A rides email/Telegram — it is slow)`,
      run: async () => {
        const deadline = Date.now() + RELAY_TIMEOUT_MS;
        const outcome = await pollHistoryFor(r, transport, {
          alias,
          cursor: ctx.f0,
          deadline,
          pollMs: POLL_MS,
          label: 'relay',
          match: (message) => {
            if (message.sender !== 'mind') return false;
            if (!(message.text ?? '').toUpperCase().includes(phrase)) return false;
            // Our own request carries the phrase, so an immediate acknowledgement echoes it
            // back with no relay behind it. Only an occurrence separated from the request
            // by ECHO_GRACE_MS counts. Messages without a timestamp are dated by arrival,
            // which is the correct reading here: we only see them when we poll.
            const at = message.at instanceof Date ? message.at.getTime() : Date.now();
            return at >= ctx.requestedAtMs + ECHO_GRACE_MS;
          },
          onOther: (message) => {
            if (message.sender !== 'mind') return;
            const text = (message.text ?? '').trim();
            if (text === '') return;
            ctx.mindMessages.push(text);
            if (text.toUpperCase().includes(phrase) && ctx.earlyEcho === null) {
              const at = message.at instanceof Date ? message.at.toISOString() : 'unknown time';
              ctx.earlyEcho = { at, text };
              r.warn(
                `the phrase came back within ${ECHO_GRACE_MS / 1000}s of our request (${at}) — ` +
                  'that reads as the Steward echoing our own words, not as a completed relay. ' +
                  'NOT counted as proof. Still listening for a later, separate message.',
              );
            }
            if (ctx.firstReply === null) {
              ctx.firstReply = text;
              r.plain('');
              r.plain('  Steward said (verbatim):');
              r.plain(`  ${text.replace(/\n/g, '\n  ')}`);
              r.plain('');
            }
            if (ctx.refusal === null && REFUSAL.test(text)) {
              ctx.refusal = text;
              r.warn(
                'that reads like a refusal / inability to reach the other Mind. Still listening ' +
                  'until the deadline in case the relay completes anyway.',
              );
            }
          },
        });

        if (outcome.matched !== null) {
          ctx.hit = outcome.matched;
          r.pass(`relay completed — Steward returned "${phrase}"`);
          return;
        }

        const verbatim = ctx.refusal ?? ctx.firstReply;
        failSpike(
          'CIRCLE_BLOCKED',
          'MIND',
          `the Steward never returned "${phrase}" within ${RELAY_TIMEOUT_MS / 60_000} minutes ` +
            `(${ctx.mindMessages.length} Mind message(s) seen). ` +
            (ctx.earlyEcho === null
              ? ''
              : `It DID echo the phrase back ${Math.round(
                  (new Date(ctx.earlyEcho.at).getTime() - ctx.requestedAtMs) / 1000,
                )}s after our request — that is our own wording coming back, not a relay, so it ` +
                `was not counted. Judge it yourself: "${ctx.earlyEcho.text}". `) +
            (verbatim === null
              ? 'It said nothing else at all.'
              : `Its own words, verbatim: "${verbatim}"`) +
            ' Every HTTP call succeeded — this is about agent-to-agent reach, not the transport.',
        );
      },
    },
  ];

  await runSteps(r, steps);
  epilogue();

  const path = appendToApiNotes(buildNotes(phrase), {
    spike: 'circle-probe',
    verdict: r.verdict(),
    code: r.code(),
    cls: r.classOf(),
    durationMs: r.elapsedMs(),
    context: {
      alias,
      steward: ctx.steward?.name ?? shortId(stewardId),
      rewards: ctx.rewards?.name ?? shortId(rewardsId),
      phrase,
      timeoutMinutes: RELAY_TIMEOUT_MS / 60_000,
    },
  });
  r.info(`appended to ${path}`);
  r.finishAndExit();
}

async function resolveParty(
  label: string,
  id: string,
  baseUrl: string,
  apiKey: string,
  preference: string,
): Promise<Party> {
  const detail = await fetchMindDetail({ baseUrl, mindId: id, apiKey, preference });
  r.raw(`${label.toLowerCase()}-mind-detail`, summarizeResponse(detail.response));
  if (!detail.response.ok) {
    r.warn(`could not read ${label} Mind details — ${describe(detail.response)}`);
    return { id, label, name: `${label} Mind ${shortId(id)}`, email: null, detailOk: false };
  }
  if (detail.mind === null) {
    r.warn(`${label} Mind details did not match BuilderMind — ${detail.shapeIssue ?? 'unparseable'}`);
    return { id, label, name: `${label} Mind ${shortId(id)}`, email: null, detailOk: false };
  }
  return {
    id,
    label,
    name: nameOf(detail.mind, label, id),
    email: detail.mind.email ?? null,
    detailOk: true,
  };
}

function nameOf(mind: BuilderMind, label: string, id: string): string {
  const name = mind.name;
  return name === undefined || name.trim() === '' ? `${label} Mind ${shortId(id)}` : name;
}

function requireParty(party: Party | null): Party {
  if (party === null) throw new Error('spike bug: Mind identity used before it was resolved');
  return party;
}

function epilogue(): void {
  r.plain('');
  r.plain('─────────── INPUT TO THE §12 DESCOPE DECISION (deadline Aug 24 EOD) ───────────');
  r.plain('');
  if (ctx.hit !== null) {
    r.plain('  Steward -> Rewards relay WORKS. Phase 5 (Circles + on-chain reward) stays in scope.');
    r.plain('  Note how long it took: A2A rides email/Telegram, so build the demo beat around');
    r.plain('  that latency (pre-trigger it, or narrate "Keeper considers, then acts").');
  } else if (ctx.earlyEcho !== null) {
    r.plain('  The Steward repeated our phrase back almost immediately and then nothing else');
    r.plain('  arrived. Our request contains that phrase, so the echo proves NOTHING about');
    r.plain('  whether the Rewards Mind was ever reached — it was deliberately not graded.');
    r.plain('  Read the verbatim text above. If you believe a relay really did happen that');
    r.plain(`  fast, re-run and watch the two Minds' own inboxes; otherwise treat this as a`);
    r.plain('  non-relay and follow the descope guidance below.');
    r.plain('');
    r.plain('  Per BUILD_PLAN §12, if this is not demo-stable by Aug 24 EOD, execute');
    r.plain('  Descope Plan A: single Steward Mind, rewards become recommendations.');
  } else {
    r.plain('  Steward -> Rewards relay did NOT complete. Per BUILD_PLAN §12, if this is not');
    r.plain('  demo-stable by Aug 24 EOD, execute Descope Plan A without sentimentality:');
    r.plain('    - single Steward Mind;');
    r.plain('    - rewards become autonomous "reward recommendations" in the digest');
    r.plain('      ("Marco earned Top Contributor this week — send it?");');
    r.plain('    - the wallet becomes roadmap in the video\'s last 5 seconds.');
    r.plain('  The autonomy story survives intact and one failure mode disappears.');
    r.plain('');
    r.plain('  Before descoping, confirm the human introduction in step 3 actually landed:');
    r.plain('  an unintroduced sender is silently DROPPED by the Circle — the Mind never');
    r.plain('  sees the message and cannot tell you it did not.');
  }
  r.plain('');
  r.plain('  This is a MIND-class result. It does not affect the transport GO/NO-GO.');
  r.plain('');
  r.plain('──────────────────────────────────────────────────────────────────────────────');
}

function buildNotes(phrase: string): string {
  const parts: string[] = [];
  parts.push(
    `**Mind -> Mind relay: ${ctx.hit === null ? 'NOT achieved' : 'ACHIEVED'}.** ` +
      `Steward was asked to contact the Rewards Mind and bring back \`${phrase}\`; ` +
      `we listened for ${RELAY_TIMEOUT_MS / 60_000} minutes.`,
  );
  parts.push(
    'Setup required a human introduction first (email CC or a shared Telegram group) — ' +
      'confirming that there is no programmatic A2A path today.',
  );
  if (ctx.firstReply !== null) {
    parts.push(`Steward's first reply, verbatim:\n\n${fenced(ctx.firstReply, 'text')}`);
  }
  if (ctx.earlyEcho !== null) {
    parts.push(
      `**Echo, not relay.** The phrase came back at \`${ctx.earlyEcho.at}\`, within ` +
        `${ECHO_GRACE_MS / 1000}s of our request — the request itself contains the phrase, so ` +
        'this is the Steward repeating our wording, and it was NOT graded as a completed ' +
        `relay:\n\n${fenced(ctx.earlyEcho.text, 'text')}`,
    );
  }
  if (ctx.refusal !== null && ctx.refusal !== ctx.firstReply) {
    parts.push(`Steward's refusal, verbatim:\n\n${fenced(ctx.refusal, 'text')}`);
  }
  if (ctx.hit !== null) {
    const at = ctx.hit.at instanceof Date ? ctx.hit.at.toISOString() : 'unknown time';
    parts.push(
      `Relayed phrase received at \`${at}\`, ` +
        `${Math.round(((ctx.hit.at instanceof Date ? ctx.hit.at.getTime() : Date.now()) - ctx.requestedAtMs) / 1000)}s ` +
        `after the request (echo window was ${ECHO_GRACE_MS / 1000}s):\n\n${fenced(ctx.hit.text ?? '', 'text')}`,
    );
    parts.push('**§12 decision input:** Phase 5 (Circles + on-chain reward) stays in scope.');
  } else {
    parts.push(
      '**§12 decision input:** if this is not demo-stable by **Aug 24 EOD**, execute Descope ' +
        'Plan A — single Steward Mind, rewards become autonomous *recommendations* in the digest, ' +
        'wallet becomes roadmap.',
    );
  }
  return parts.join('\n\n');
}

main().catch((error: unknown) => r.crash(error));
