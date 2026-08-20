/**
 * wallet-probe — the smallest real on-chain action, and nothing more.
 *
 * SAFETY INVARIANT: the only transfer this spike will ever request is a minimum-value
 * SELF-transfer, to the wallet address the platform itself reports for this Mind. Never an
 * external address, never a user-supplied address. The destination is read from
 * GET /v1/minds/{mindId} and echoed back verbatim.
 *
 * The chain is NOT hardcoded: docs/API-NOTES.md says the chain is unverified, so the
 * explorer link is built from the Mind's actual `chain` field or not at all.
 *
 * Note on which Mind: the Messaging transport is bound to MINDS_MIND_ID, so the
 * conversational half of this spike necessarily talks to that Mind. If the wallet lives on
 * the Rewards Mind, the spike says so and tells you exactly what to change.
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
  pollHistoryFor,
  runSteps,
  type MindTransport,
  type Step,
} from './_shared/steps.js';

const r: SpikeReporter = reporter('wallet-probe');
const TX_HASH = /0x[0-9a-fA-F]{64}/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const APPROVAL = /\b(approv|confirm|authori[sz]|sign it|signature|permission|human)\b/i;
const ACTION_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 15_000;

interface Ctx {
  mind: BuilderMind | null;
  walletAddress: string | null;
  chain: string | null;
  rewardsHasWallet: boolean;
  capabilityAnswer: string | null;
  transferReplies: string[];
  approvalStep: string | null;
  txHash: string | null;
  f0: string | null;
}

const ctx: Ctx = {
  mind: null,
  walletAddress: null,
  chain: null,
  rewardsHasWallet: false,
  capabilityAnswer: null,
  transferReplies: [],
  approvalStep: null,
  txHash: null,
  f0: null,
};

async function main(): Promise<void> {
  const env = loadSpikeEnv(['MINDS_BUILDER_API_KEY', 'MINDS_MIND_ID'], r);
  const apiKey = env.get('MINDS_BUILDER_API_KEY');
  const mindId = env.get('MINDS_MIND_ID');
  const rewardsId = env.optional('MINDS_REWARDS_MIND_ID');
  const alias = `keeper-wallet-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(2).toString('hex')}`;

  r.info(`base url: ${env.baseUrl} · alias ${alias}`);
  r.info(
    `the Messaging transport is bound to MINDS_MIND_ID (${shortId(mindId)}), so that is the Mind ` +
      'this spike can converse with.',
  );
  const transport = createMindClient().transport;

  const steps: Step[] = [
    { name: 'health check', run: () => healthGate(r, transport) },

    {
      name: 'GET /v1/minds/{mindId} — does this Mind have a wallet, and on which chain?',
      run: async () => {
        const detail = await fetchMindDetail({
          baseUrl: env.baseUrl,
          mindId,
          apiKey,
          preference: env.authHeaderPreference,
        });
        r.raw('mind-detail', summarizeResponse(detail.response));
        if (!detail.response.ok) {
          failSpike(
            detail.response.status === 404 ? 'ENDPOINT_NOT_FOUND' : 'HTTP_ERROR',
            'INFRA',
            `could not read the Mind — ${describe(detail.response)}`,
          );
        }
        if (detail.mind === null) {
          failSpike(
            'SHAPE_DRIFT',
            'INFRA',
            `GET /v1/minds/{mindId} returned 2xx but did not match BuilderMind ` +
              `(${detail.shapeIssue ?? 'unparseable body'}). Full body is in the raw dump above.`,
          );
        }
        ctx.mind = detail.mind;
        ctx.walletAddress = detail.mind.walletAddress ?? null;
        ctx.chain = detail.mind.chain ?? null;
        r.info(`wallet fields: walletAddress=${ctx.walletAddress ?? 'absent'} chain=${ctx.chain ?? 'absent'}`);

        if (rewardsId !== undefined && rewardsId !== mindId) {
          const other = await fetchMindDetail({
            baseUrl: env.baseUrl,
            mindId: rewardsId,
            apiKey,
            preference: env.authHeaderPreference,
          });
          r.raw('rewards-mind-detail', summarizeResponse(other.response));
          ctx.rewardsHasWallet = Boolean(other.mind?.walletAddress);
          r.info(
            `Rewards Mind ${shortId(rewardsId)}: walletAddress=${other.mind?.walletAddress ?? 'absent'} ` +
              `chain=${other.mind?.chain ?? 'absent'}`,
          );
        }

        if (ctx.walletAddress === null || ctx.walletAddress.trim() === '') {
          failSpike(
            'NO_WALLET',
            'MIND',
            'this Mind has no walletAddress. HUMAN ACTION REQUIRED: enable the wallet for this ' +
              'Mind in the platform UI, then re-run this spike.' +
              (ctx.rewardsHasWallet
                ? ' NOTE: MINDS_REWARDS_MIND_ID does have a wallet — but the Messaging transport ' +
                  'is bound to MINDS_MIND_ID, so to converse with the Rewards Mind you must ' +
                  'temporarily set MINDS_MIND_ID to the Rewards Mind id and re-run.'
                : ''),
          );
        }
        if (!EVM_ADDRESS.test(ctx.walletAddress)) {
          r.warn(
            `walletAddress "${ctx.walletAddress}" is not a 20-byte EVM address. The self-transfer ` +
              'below still uses this exact string and nothing else, but the tx-hash pattern we ' +
              'grade for (0x + 64 hex) may not apply to this chain.',
          );
        }
        r.pass(
          `wallet ${ctx.walletAddress} on chain "${ctx.chain ?? 'UNREPORTED'}"` +
            (ctx.chain === null ? ' — the API did not name a chain; do not assume Base.' : ''),
        );
      },
    },

    {
      name: `ensureConversation('${alias}')`,
      run: async () => {
        const conversation = await transport.ensureConversation(alias);
        r.raw('ensure-conversation', conversation.raw);
        const history = await transport.getHistory(alias);
        const newest = history.at(-1);
        ctx.f0 = typeof newest?.id === 'string' ? newest.id : null;
        r.pass(`conversation ${shortId(conversation.conversationId)} · F0 = ${ctx.f0 ?? '(empty)'}`);
      },
    },

    {
      name: 'ask the Mind what its wallet can actually do (its own words go into API-NOTES)',
      run: async () => {
        const question =
          'What can your on-chain wallet do? State your address, chain, balance, and what ' +
          'actions you can take.';
        const result = await exchange(r, transport, alias, question, {
          label: 'wallet-capabilities',
          timeoutMs: 120_000,
          tolerateSilence: true,
        });
        ctx.capabilityAnswer = result.reply?.text ?? null;
        if (ctx.capabilityAnswer === null) {
          r.warn('no answer to the capability question — continuing to the action test anyway.');
          return;
        }
        r.plain('');
        r.plain('  The Mind says (verbatim):');
        r.plain(`  ${ctx.capabilityAnswer.replace(/\n/g, '\n  ')}`);
        r.plain('');
        r.pass('captured the Mind\'s own account of its wallet capabilities');
      },
    },

    {
      name: 'request the smallest possible on-chain action: a minimum-value SELF-transfer',
      run: async () => {
        const address = requireAddress();
        const chain = ctx.chain ?? 'your chain';
        r.info(
          `SAFETY: destination is the Mind's OWN address as reported by GET /v1/minds/{mindId} ` +
            `(${address}). This spike never sends to an external or user-supplied address.`,
        );
        const instruction =
          `Please execute the smallest possible on-chain transfer of the native asset on ${chain} ` +
          `from your wallet to your OWN address ${address}. This is a deliberate self-transfer: ` +
          `the destination must be exactly ${address} and no other address. ` +
          'Reply with the transaction hash once it is submitted. If a human has to approve or ' +
          'sign anything first, tell me exactly what to click and where.';

        const sent = await transport.send(alias, instruction);
        r.info(`-> ${instruction}`);
        r.raw('transfer-request-send-response', sent.raw);

        const deadline = Date.now() + ACTION_TIMEOUT_MS;
        r.info(`listening up to ${ACTION_TIMEOUT_MS / 60_000} minutes for a transaction hash…`);
        const outcome = await pollHistoryFor(r, transport, {
          alias,
          cursor: ctx.f0,
          deadline,
          pollMs: POLL_MS,
          label: 'wallet-action',
          match: (message) => message.sender === 'mind' && TX_HASH.test(message.text ?? ''),
          onOther: (message) => {
            if (message.sender !== 'mind') return;
            const text = (message.text ?? '').trim();
            if (text === '') return;
            ctx.transferReplies.push(text);
            if (ctx.approvalStep === null && APPROVAL.test(text)) {
              ctx.approvalStep = text;
              r.plain('');
              r.plain('  HUMAN ACTION REQUIRED (the Mind\'s own stated approval step):');
              r.plain(`  ${text.replace(/\n/g, '\n  ')}`);
              r.plain('');
              r.info('still polling for a transaction hash while you do that…');
            }
          },
        });

        if (outcome.matched === null) {
          const verbatim = ctx.transferReplies.at(-1) ?? ctx.transferReplies[0] ?? null;
          failSpike(
            'WALLET_NO_ACTION',
            'MIND',
            `no transaction hash within ${ACTION_TIMEOUT_MS / 60_000} minutes. ` +
              (verbatim === null
                ? 'The Mind said nothing at all.'
                : `The Mind's own words, verbatim: "${verbatim}"`) +
              ' That refusal is itself the finding: the docs say the backend signs on execution ' +
              'request, so a refusal is POLICY, not missing capability. Every HTTP call succeeded.',
          );
        }
        const hash = TX_HASH.exec(outcome.matched.text ?? '')?.[0] ?? null;
        ctx.txHash = hash;
        r.pass(`transaction hash returned: ${hash ?? '(regex matched but extraction failed)'}`);
      },
    },

    {
      name: 'report the on-chain artifact',
      run: async () => {
        const hash = ctx.txHash;
        const chain = ctx.chain;
        r.plain('');
        r.plain(`  tx hash : ${hash ?? 'none'}`);
        r.plain(`  chain   : ${chain ?? 'UNREPORTED by the API'}`);
        r.plain(`  explorer: ${explorerLine(chain, hash)}`);
        r.plain('');
        r.pass('on-chain action completed and recorded');
      },
    },
  ];

  await runSteps(r, steps);
  epilogue();

  const path = appendToApiNotes(buildNotes(), {
    spike: 'wallet-probe',
    verdict: r.verdict(),
    code: r.code(),
    cls: r.classOf(),
    durationMs: r.elapsedMs(),
    context: {
      mindId: shortId(mindId),
      alias,
      walletAddress: ctx.walletAddress,
      chain: ctx.chain,
      txHash: ctx.txHash,
    },
  });
  r.info(`appended to ${path}`);
  r.finishAndExit();
}

function explorerLine(chain: string | null, hash: string | null): string {
  if (hash === null) return 'n/a';
  if (chain !== null && chain.toLowerCase() === 'base') return `https://basescan.org/tx/${hash}`;
  return (
    `UNKNOWN — the Mind reports chain "${chain ?? 'none'}". docs/API-NOTES.md says the chain is ` +
    'unverified, so no explorer URL is guessed here. Look up the explorer for that chain and ' +
    'paste the link into the evidence folder yourself.'
  );
}

function requireAddress(): string {
  if (ctx.walletAddress === null) throw new Error('spike bug: wallet address used before it was read');
  return ctx.walletAddress;
}

function epilogue(): void {
  r.plain('');
  r.plain('──────────────────────── WALLET: WHAT THIS MEANS ────────────────────────');
  r.plain('');
  if (ctx.txHash !== null) {
    r.plain('  A Mind executed a real on-chain action on request. Phase 5 has a credible');
    r.plain('  "smallest on-chain artifact". Keep the self-transfer pattern for the demo');
    r.plain('  unless a reward transfer to a member address is separately proven safe.');
  } else if (ctx.walletAddress === null) {
    r.plain('  No wallet on this Mind. Enable it in the platform UI and re-run; if only the');
    r.plain('  Rewards Mind has one, point MINDS_MIND_ID at that Mind for this spike.');
  } else {
    r.plain('  The wallet exists but no transaction was produced. Per the docs the backend');
    r.plain('  signs on an execution request, so read the verbatim refusal above as POLICY');
    r.plain('  (guardrails / approval flow), not as missing capability. Raise it at office');
    r.plain('  hours — question 3 on the list — and pre-arm Descope Plan A (§12): rewards');
    r.plain('  become autonomous recommendations, wallet becomes roadmap.');
  }
  r.plain('');
  r.plain('  This is a MIND-class result. It does not affect the transport GO/NO-GO.');
  r.plain('');
  r.plain('─────────────────────────────────────────────────────────────────────────');
}

function buildNotes(): string {
  const parts: string[] = [];
  parts.push(
    `**Wallet.** \`GET /v1/minds/{mindId}\` reports walletAddress \`${ctx.walletAddress ?? 'absent'}\` ` +
      `and chain \`${ctx.chain ?? 'absent'}\`.` +
      (ctx.chain === null
        ? ' The API did not name a chain — do NOT assume Base.'
        : ' Trust this field over the hand-written baseline.'),
  );
  if (ctx.capabilityAnswer !== null) {
    parts.push(
      `The Mind\'s own account of what its wallet can do (verbatim):\n\n${fenced(ctx.capabilityAnswer, 'text')}`,
    );
  }
  if (ctx.approvalStep !== null) {
    parts.push(`Stated human-approval step (verbatim):\n\n${fenced(ctx.approvalStep, 'text')}`);
  }
  if (ctx.txHash !== null) {
    parts.push(
      `**On-chain action: SUCCEEDED.** Minimum-value self-transfer to the Mind\'s own address.\n\n` +
        `- tx: \`${ctx.txHash}\`\n- explorer: ${explorerLine(ctx.chain, ctx.txHash)}`,
    );
  } else {
    const verbatim = ctx.transferReplies.at(-1) ?? null;
    parts.push(
      '**On-chain action: NOT performed.**' +
        (verbatim === null ? '' : ` The Mind\'s reply, verbatim:\n\n${fenced(verbatim, 'text')}`),
    );
    parts.push(
      'Reading: the docs say the backend signs on an execution request, so a refusal indicates ' +
        'POLICY (guardrails / approval flow), not absent capability. Office-hours question 3.',
    );
  }
  return parts.join('\n\n');
}

main().catch((error: unknown) => r.crash(error));
