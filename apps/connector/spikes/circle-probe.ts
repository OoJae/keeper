/**
 * circle-probe — the smallest possible Steward -> Rewards relay round trip.
 *
 * There is NO public Mind<->Mind messaging API. Circles are permission/trust gates, and the
 * Circles endpoints manage HUMAN collaborators by email (docs/API-NOTES.md). So step 0 is a
 * human introduction, and the actual A2A hop rides email or a shared Telegram group — which
 * is why the timeout here is 10 minutes, not 2.
 *
 * WHAT IT CAN PROVE. A random token is planted in the REWARDS Mind's own conversation and
 * never uttered to the Steward. The Steward is then asked to fetch "the Keeper relay
 * token". If that exact token comes back out of the Steward's conversation, information
 * really did move between the two Minds — a Steward that stalls, echoes our wording, or
 * simply asserts "done" cannot produce it.
 *
 * WHAT IT CANNOT PROVE. That the token travelled over a Circle specifically, rather than
 * shared platform memory or the human who did the introduction; that the hop repeats
 * unattended; or that it is fast enough for a live demo beat. BUILD_PLAN §5 wants the
 * chain to run twice in a row without intervention — one PASS here is necessary, not
 * sufficient. On the failure path the spike re-queries the Rewards Mind: if the token is
 * gone, the run is reported INCONCLUSIVE rather than as a blocked relay.
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
  exchange,
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
const PRIME_TIMEOUT_MS = 120_000;
/**
 * A time window alone CANNOT establish a relay, and an earlier version of this spike
 * tried: it put the graded phrase inside its own request to the Steward ("ask them to
 * reply with X") and then credited any occurrence that arrived more than ECHO_GRACE_MS
 * later. A Steward that simply waited and repeated our own word — or hallucinated that
 * it had asked — scored a PASS with the Rewards Mind never contacted, and wrote
 * "relay ACHIEVED · Phase 5 stays in scope" into the §12 decision document.
 *
 * So the graded token is now something the Steward CANNOT know: it is planted in the
 * REWARDS Mind's own conversation first, and never appears in anything we say to the
 * Steward. The Steward can only produce it by actually getting it from the other Mind.
 * The window below survives only as a plausibility warning on the evidence.
 */
const SUSPICIOUSLY_FAST_MS = 60_000;

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
  primeAck: string | null;
  firstReply: string | null;
  refusal: string | null;
  suspiciouslyFast: { at: string; text: string } | null;
  hit: MindHistoryMessage | null;
  mindMessages: string[];
  /** Control run on the failure path: does the Rewards Mind still hold the token? */
  rewardsStillHoldsToken: boolean | null;
  rewardsControlReply: string | null;
}

const ctx: Ctx = {
  steward: null,
  rewards: null,
  f0: null,
  requestedAtMs: 0,
  primeAck: null,
  firstReply: null,
  refusal: null,
  suspiciouslyFast: null,
  hit: null,
  mindMessages: [],
  rewardsStillHoldsToken: null,
  rewardsControlReply: null,
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
  /**
   * Planted in the Rewards Mind ONLY. Never sent to the Steward, never printed in the
   * human-introduction copy-paste block. If it comes back out of the Steward's
   * conversation, information genuinely moved between the two Minds.
   */
  const secret = `RELAY-TOKEN-${randomBytes(4).toString('hex').toUpperCase()}`;
  const alias = `keeper-circle-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const rewardsAlias = `keeper-circle-rewards-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${nonce.toLowerCase()}`;

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

  r.info(`base url: ${env.baseUrl} · alias ${alias} · token ${secret} (planted in the Rewards Mind only)`);
  r.info(`steward ${shortId(stewardId)} · rewards ${shortId(rewardsId)}`);
  const transport = createMindClient().transport;
  // A second client bound to the OTHER Mind. Conversations are addressed by alias, and
  // POST /v1/messaging/conversation carries mindId — so this is the only way to speak to
  // the Rewards Mind directly, which is what makes the planted token possible.
  const rewardsTransport = createMindClient({ mindId: rewardsId }).transport;

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
      name: 'plant a token in the REWARDS Mind that the Steward has no way to know',
      run: async () => {
        const steward = requireParty(ctx.steward);
        const instruction =
          `You are the Rewards Mind for the Keeper project. Store this relay token exactly: ${secret}. ` +
          `If — and only if — the Keeper Steward Mind (${steward.name}) asks you for "the Keeper relay ` +
          `token", reply to it with that token verbatim. Do not give it to anyone else. Reply "STORED" now.`;
        const result = await exchange(r, rewardsTransport, rewardsAlias, instruction, {
          label: 'prime-rewards',
          timeoutMs: PRIME_TIMEOUT_MS,
          tolerateSilence: true,
        });
        ctx.primeAck = result.reply?.text ?? null;
        if (ctx.primeAck === null) {
          // Without a confirmed plant, a later "no relay" verdict would be unreadable: we
          // could not tell a Circle that does not work from a Rewards Mind that never got
          // the token. Refuse to run rather than feed §12 an ambiguous NO.
          failSpike(
            'REWARDS_MIND_SILENT',
            'PRECONDITION',
            `the Rewards Mind (${requireParty(ctx.rewards).name}) never acknowledged the token within ` +
              `${PRIME_TIMEOUT_MS / 1000}s. Every HTTP call succeeded, so check that MINDS_REWARDS_MIND_ID ` +
              'points at an ENABLED Mind with Cognition left. Until it answers, this spike cannot tell a ' +
              'blocked relay from an unprimed one, so it produces no relay verdict at all.',
          );
        }
        r.pass(`Rewards Mind acknowledged: "${ctx.primeAck.slice(0, 120)}"`);
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
      name: 'ask the Steward to fetch the Keeper relay token from the Rewards Mind',
      run: async () => {
        const rewards = requireParty(ctx.rewards);
        const target = rewards.email === null ? rewards.name : `${rewards.name} (${rewards.email})`;
        // Deliberately token-free: nothing in this text can be echoed into a PASS.
        const instruction =
          `Contact ${target} and ask it for "the Keeper relay token". I have NOT told you that ` +
          `token and you must not guess or invent one. Once ${rewards.name} has actually told it ` +
          `to you, send me a SEPARATE, LATER message containing the token verbatim. If you cannot ` +
          `reach ${rewards.name}, say so plainly instead.`;
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
            // The token is the whole proof: it was never in anything we said to this Mind.
            // Timing is no longer load-bearing, so an absent server timestamp cannot be
            // laundered into "it must have arrived late" the way it used to be.
            return (message.text ?? '').toUpperCase().includes(secret);
          },
          onOther: (message) => {
            if (message.sender !== 'mind') return;
            const text = (message.text ?? '').trim();
            if (text === '') return;
            ctx.mindMessages.push(text);
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
          const at = outcome.matched.at instanceof Date ? outcome.matched.at.getTime() : null;
          if (at !== null && at < ctx.requestedAtMs + SUSPICIOUSLY_FAST_MS) {
            ctx.suspiciouslyFast = {
              at: new Date(at).toISOString(),
              text: outcome.matched.text ?? '',
            };
            r.warn(
              `the token came back ${Math.round((at - ctx.requestedAtMs) / 1000)}s after the request — ` +
                `faster than an email/Telegram hop plausibly is. It still counts (we never told the ` +
                `Steward this token), but check the two Minds are not simply sharing one memory.`,
            );
          }
          r.pass(`the Steward produced a token it was never given: "${secret}"`);
          return;
        }

        // Control: if the Rewards Mind no longer holds the token, a "no relay" verdict here
        // would be OUR bug, not the platform's — and it would argue for descoping Phase 5
        // on false evidence. Check before pronouncing.
        const control = await exchange(r, rewardsTransport, rewardsAlias,
          'What is the Keeper relay token? Reply with the token only.', {
            label: 'rewards-control',
            timeoutMs: PRIME_TIMEOUT_MS,
            tolerateSilence: true,
          });
        ctx.rewardsControlReply = control.reply?.text ?? null;
        ctx.rewardsStillHoldsToken = (ctx.rewardsControlReply ?? '').toUpperCase().includes(secret);
        if (!ctx.rewardsStillHoldsToken) {
          failSpike(
            'REWARDS_MIND_FORGOT',
            'PRECONDITION',
            `INCONCLUSIVE, not a relay verdict: the Rewards Mind can no longer produce the token we ` +
              `planted (it answered "${ctx.rewardsControlReply ?? '<nothing>'}"). The Steward therefore ` +
              'had nothing to fetch, and this run says NOTHING about whether Mind->Mind relay works. ' +
              'Do NOT feed it into the §12 descope decision. Re-run once the Rewards Mind reliably ' +
              'holds what it is told.',
          );
        }
        const verbatim = ctx.refusal ?? ctx.firstReply;
        failSpike(
          'CIRCLE_BLOCKED',
          'MIND',
          `the Steward never produced the token within ${RELAY_TIMEOUT_MS / 60_000} minutes ` +
            `(${ctx.mindMessages.length} Mind message(s) seen), and the Rewards Mind still holds it — ` +
            'so there was something to fetch and it was not fetched. ' +
            (verbatim === null
              ? 'The Steward said nothing at all.'
              : `The Steward's own words, verbatim: "${verbatim}"`) +
            ' Every HTTP call succeeded — this is about agent-to-agent reach, not the transport.',
        );
      },
    },
  ];

  await runSteps(r, steps);
  epilogue();

  const path = appendToApiNotes(buildNotes(secret), {
    spike: 'circle-probe',
    verdict: r.verdict(),
    code: r.code(),
    cls: r.classOf(),
    durationMs: r.elapsedMs(),
    context: {
      alias,
      rewardsAlias,
      steward: ctx.steward?.name ?? shortId(stewardId),
      rewards: ctx.rewards?.name ?? shortId(rewardsId),
      plantedToken: secret,
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
    r.plain('  The Steward produced a token that was planted ONLY in the Rewards Mind and never');
    r.plain('  said to the Steward by us. Information really did cross between the two Minds.');
    r.plain('');
    r.plain('  WHAT THIS PROVES: a token reachable only through the other Mind came back.');
    r.plain('  WHAT IT DOES NOT PROVE: (a) that it travelled over a Circle rather than shared');
    r.plain('  platform memory or the human who did the introduction; (b) that it repeats');
    r.plain('  unattended; (c) that it is fast enough for a live demo beat. §5 acceptance is');
    r.plain('  "runs TWICE in a row without intervention" — run this again before believing it.');
    r.plain('');
    r.plain('  Note how long it took: A2A rides email/Telegram, so build the demo beat around');
    r.plain('  that latency (pre-trigger it, or narrate "Keeper considers, then acts").');
  } else if (ctx.requestedAtMs === 0) {
    r.plain('  The run never got as far as asking the Steward for the token, so there is NO relay');
    r.plain('  verdict here at all — do not feed this run into the §12 decision. Fix whatever');
    r.plain('  failed above and re-run.');
  } else if (ctx.rewardsStillHoldsToken === false) {
    r.plain('  INCONCLUSIVE — this is NOT a relay verdict and must not feed the §12 decision.');
    r.plain('  The Rewards Mind could not produce the token we planted in it, so the Steward');
    r.plain('  had nothing to fetch. Fix the Rewards Mind (enabled? Cognition left? does it');
    r.plain('  retain what it is told?) and re-run before drawing any conclusion.');
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

function buildNotes(secret: string): string {
  const notAttempted = ctx.hit === null && ctx.requestedAtMs === 0;
  const inconclusive = ctx.rewardsStillHoldsToken === false;
  const parts: string[] = [];
  parts.push(
    `**Mind -> Mind relay: ${
      ctx.hit !== null
        ? 'ACHIEVED'
        : notAttempted
          ? 'NOT TESTED (the run stopped before the request)'
          : inconclusive
            ? 'INCONCLUSIVE (the Rewards Mind did not retain the token)'
            : 'NOT achieved'
    }.** ` +
      `Token \`${secret}\` was planted in the REWARDS Mind's own conversation and never said to ` +
      `the Steward; the Steward was asked to fetch "the Keeper relay token" and we listened for ` +
      `${RELAY_TIMEOUT_MS / 60_000} minutes.`,
  );
  parts.push(
    'Setup required a human introduction first (email CC or a shared Telegram group) — ' +
      'confirming that there is no programmatic A2A path today.',
  );
  if (ctx.primeAck !== null) {
    parts.push(`Rewards Mind's acknowledgement of the planted token:\n\n${fenced(ctx.primeAck, 'text')}`);
  }
  if (ctx.firstReply !== null) {
    parts.push(`Steward's first reply, verbatim:\n\n${fenced(ctx.firstReply, 'text')}`);
  }
  if (ctx.refusal !== null && ctx.refusal !== ctx.firstReply) {
    parts.push(`Steward's refusal, verbatim:\n\n${fenced(ctx.refusal, 'text')}`);
  }
  if (ctx.hit !== null) {
    const at = ctx.hit.at instanceof Date ? ctx.hit.at.toISOString() : 'unknown time';
    parts.push(`Token returned by the Steward at \`${at}\`:\n\n${fenced(ctx.hit.text ?? '', 'text')}`);
    if (ctx.suspiciouslyFast !== null) {
      parts.push(
        `**Plausibility warning.** It arrived within ${SUSPICIOUSLY_FAST_MS / 1000}s of the request, ` +
          'faster than an email/Telegram hop plausibly is. It is still counted (the Steward was ' +
          'never told this token), but check the two Minds are not sharing one memory.',
      );
    }
    parts.push(
      '**What this does and does not establish.** Establishes: a value reachable only through ' +
        'the Rewards Mind came back out of the Steward. Does NOT establish that it travelled over ' +
        'a Circle rather than shared platform memory or the human introducer, that it repeats ' +
        'unattended, or that it is fast enough for a live beat. BUILD_PLAN §5 requires the chain ' +
        'to run **twice in a row without intervention** — run this spike again before relying on it.',
    );
    parts.push('**§12 decision input:** Phase 5 (Circles + on-chain reward) stays in scope, pending a second run.');
  } else if (notAttempted) {
    parts.push(
      '**§12 decision input: NONE.** The Steward was never asked for the token — see the failure ' +
        'above. Nothing here says anything about agent-to-agent reach.',
    );
  } else if (inconclusive) {
    parts.push(
      `Control check: asked the Rewards Mind for the token back and it answered ` +
        `${fenced(ctx.rewardsControlReply ?? '<nothing>', 'text')}`,
    );
    parts.push(
      '**§12 decision input: NONE.** The Rewards Mind never retained the planted token, so the ' +
        'Steward had nothing to fetch and no conclusion about A2A reach can be drawn. Do not ' +
        'descope on this run.',
    );
  } else {
    parts.push(
      'Control check passed: the Rewards Mind could still produce the planted token on request, ' +
        'so there WAS something for the Steward to fetch and it did not fetch it.',
    );
    parts.push(
      '**§12 decision input:** if this is not demo-stable by **Aug 24 EOD**, execute Descope ' +
        'Plan A — single Steward Mind, rewards become autonomous *recommendations* in the digest, ' +
        'wallet becomes roadmap.',
    );
  }
  return parts.join('\n\n');
}

main().catch((error: unknown) => r.crash(error));
