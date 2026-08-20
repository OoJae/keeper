/**
 * proactive-probe — can the Mind message FIRST, unprompted, at a time it chose?
 *
 * This is the spike behind BUILD_PLAN Phase 3's "autonomous follow-up" behaviours
 * (nightly digest, day-2 check-in). If the Mind can schedule its own message, autonomy is
 * native. If it cannot, the connector has to fake it with a cron — which is a weaker story
 * for the "Minds Integration Depth" criterion, not a blocker.
 *
 *   pnpm spike:proactive                    arm + wait (~10 min total)
 *   pnpm spike:proactive -- --phase=check   re-check after a crash, WITHOUT re-arming
 *
 * The immediate acknowledgement to the arming message is expected and ignored: what counts
 * is a NEW message carrying the codeword at or after the deadline.
 */
import { randomBytes } from 'node:crypto';

import { createMindClient } from '@keeper/minds-client';
import { z } from 'zod';

import { argValue, loadSpikeEnv } from './_shared/env.js';
import { appendToApiNotes } from './_shared/notes.js';
import { fenced, reporter, shortId, type SpikeReporter } from './_shared/report.js';
import { readSpikeState, STATE_PATH, writeSpikeState } from './_shared/state.js';
import {
  failSpike,
  healthGate,
  pollHistoryFor,
  runSteps,
  type MindHistoryMessage,
  type MindTransport,
  type Step,
} from './_shared/steps.js';

const r: SpikeReporter = reporter('proactive-probe');
const STATE_KEY = 'proactive-probe';
const LEAD_MS = 3 * 60 * 1000; // the Mind is asked to fire at armedAt + 3 min
const GRACE_MS = 7 * 60 * 1000; // …and we keep listening until deadline + 7 min
const POLL_MS = 10_000;

const ArmedStateSchema = z.object({
  alias: z.string().min(1),
  f0: z.string().nullable(),
  nonce: z.string().min(1),
  codeword: z.string().min(1),
  armedAt: z.string().min(1),
  deadline: z.string().min(1),
  giveUpAt: z.string().min(1),
});
type ArmedState = z.infer<typeof ArmedStateSchema>;

interface Ctx {
  state: ArmedState | null;
  ackText: string | null;
  earlyLeak: { at: string; text: string } | null;
  hit: MindHistoryMessage | null;
  messagesSeen: number;
  mindMessagesSeen: number;
}

const ctx: Ctx = {
  state: null,
  ackText: null,
  earlyLeak: null,
  hit: null,
  messagesSeen: 0,
  mindMessagesSeen: 0,
};

async function main(): Promise<void> {
  const phase = (argValue('phase') ?? 'arm').toLowerCase();
  if (phase !== 'arm' && phase !== 'check') {
    r.plain('');
    r.plain('  proactive-probe phases:');
    r.plain('      pnpm spike:proactive                    # arm the Mind and wait (~10 min)');
    r.plain('      pnpm spike:proactive -- --phase=check   # re-check a previous arming');
    r.plain('  (env fallback if pnpm eats the flag: SPIKE_PHASE=check pnpm spike:proactive)');
    r.plain('');
    r.fail('MISSING_ARG', 'PRECONDITION', `unknown --phase=${phase}. Valid phases: arm, check.`);
    r.finishAndExit();
  }

  const env = loadSpikeEnv(['MINDS_BUILDER_API_KEY', 'MINDS_MIND_ID'], r);
  r.info(`base url: ${env.baseUrl} · mind ${shortId(env.get('MINDS_MIND_ID'))} · phase ${phase}`);
  const transport = createMindClient().transport;

  const steps = phase === 'arm' ? armSteps(transport) : checkSteps(transport);
  await runSteps(r, steps);
  epilogue();

  const state = ctx.state;
  const path = appendToApiNotes(buildNotes(), {
    spike: 'proactive-probe',
    verdict: r.verdict(),
    code: r.code(),
    cls: r.classOf(),
    durationMs: r.elapsedMs(),
    context: {
      phase,
      alias: state?.alias ?? null,
      codeword: state?.codeword ?? null,
      deadline: state?.deadline ?? null,
      messagesObserved: ctx.messagesSeen,
    },
  });
  r.info(`appended to ${path}`);
  r.finishAndExit();
}

function armSteps(transport: MindTransport): Step[] {
  const nonce = randomBytes(3).toString('hex').toUpperCase();
  const codeword = `ALBATROSS-${nonce}`;
  const alias = `keeper-proactive-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  return [
    { name: 'health check', run: () => healthGate(r, transport) },
    {
      name: `ensureConversation('${alias}')`,
      run: async () => {
        const conversation = await transport.ensureConversation(alias);
        r.raw('ensure-conversation', conversation.raw);
        r.pass(`conversation ready: ${shortId(conversation.conversationId)}`);
      },
    },
    {
      name: 'record F0 — the newest fingerprint BEFORE we arm anything',
      run: async () => {
        const history = await transport.getHistory(alias);
        const newest = history.at(-1);
        const f0 = typeof newest?.id === 'string' ? newest.id : null;
        ctx.state = {
          alias,
          f0,
          nonce,
          codeword,
          armedAt: new Date().toISOString(),
          deadline: new Date(Date.now() + LEAD_MS).toISOString(),
          giveUpAt: new Date(Date.now() + LEAD_MS + GRACE_MS).toISOString(),
        };
        r.info(`history currently holds ${history.length} message(s)`);
        r.pass(
          `F0 = ${f0 ?? '(empty history — polling from the beginning)'}. ` +
            'Everything after this point is new.',
        );
      },
    },
    {
      name: 'arm: ask the Mind to send a NEW message at a future time',
      run: async () => {
        const state = requireState();
        const instruction =
          `At or after ${state.deadline}, send me a NEW message containing exactly the codeword ` +
          `${state.codeword}. Do not include the codeword in your reply to this message.`;
        r.info(`-> ${instruction}`);
        const sent = await transport.send(state.alias, instruction);
        r.raw('arming-send-response', sent.raw);
        // Re-anchor the schedule to the moment the platform accepted the message.
        const armedAt = sent.sentAt.getTime();
        ctx.state = {
          ...state,
          armedAt: new Date(armedAt).toISOString(),
          deadline: new Date(armedAt + LEAD_MS).toISOString(),
          giveUpAt: new Date(armedAt + LEAD_MS + GRACE_MS).toISOString(),
        };
        writeSpikeState(STATE_KEY, ctx.state);
        r.info(`state persisted to ${STATE_PATH} — a crash from here on can resume with --phase=check`);
        r.pass(
          `armed at ${new Date(armedAt).toISOString()} · codeword ${state.codeword} · ` +
            `deadline ${ctx.state.deadline} · give up ${ctx.state.giveUpAt}`,
        );
      },
    },
    pollStep(transport),
  ];
}

function checkSteps(transport: MindTransport): Step[] {
  return [
    { name: 'health check', run: () => healthGate(r, transport) },
    {
      name: 'load the previous arming from state (nothing is re-armed)',
      run: async () => {
        const raw = readSpikeState<unknown>(STATE_KEY);
        if (raw === null) {
          failSpike(
            'MISSING_STATE',
            'PRECONDITION',
            `no armed state in ${STATE_PATH} under key "${STATE_KEY}". ` +
              'Run `pnpm spike:proactive` (no flags) to arm the Mind first.',
          );
        }
        const parsed = ArmedStateSchema.safeParse(raw);
        if (!parsed.success) {
          r.raw('unreadable-state', raw);
          failSpike(
            'MISSING_STATE',
            'PRECONDITION',
            'the stored arming state is unreadable — re-arm with `pnpm spike:proactive`.',
          );
        }
        ctx.state = parsed.data;
        r.pass(
          `resumed: alias ${parsed.data.alias} · codeword ${parsed.data.codeword} · ` +
            `deadline ${parsed.data.deadline} (armed ${parsed.data.armedAt})`,
        );
      },
    },
    pollStep(transport),
  ];
}

function pollStep(transport: MindTransport): Step {
  return {
    name: 'listen for an UNPROMPTED message carrying the codeword',
    run: async () => {
      const state = requireState();
      const deadlineMs = new Date(state.deadline).getTime();
      const giveUpMs = new Date(state.giveUpAt).getTime();
      const waitS = Math.max(0, Math.round((giveUpMs - Date.now()) / 1000));
      r.info(
        waitS > 0
          ? `waiting up to ${waitS}s (until ${state.giveUpAt}). The immediate acknowledgement is ` +
              'expected and will be ignored.'
          : 'the give-up time has already passed — doing a single final sweep of history.',
      );

      const outcome = await pollHistoryFor(r, transport, {
        alias: state.alias,
        cursor: state.f0,
        deadline: giveUpMs,
        pollMs: POLL_MS,
        label: 'proactive',
        match: (message) => {
          if (message.sender !== 'mind') return false;
          if (!containsCodeword(message.text, state.codeword)) return false;
          const at = message.at instanceof Date ? message.at.getTime() : Date.now();
          return at >= deadlineMs;
        },
        onOther: (message) => {
          ctx.messagesSeen += 1;
          if (message.sender === 'mind') {
            ctx.mindMessagesSeen += 1;
            if (ctx.ackText === null) ctx.ackText = message.text ?? '';
            if (containsCodeword(message.text, state.codeword) && ctx.earlyLeak === null) {
              const at = message.at instanceof Date ? message.at.toISOString() : 'unknown time';
              ctx.earlyLeak = { at, text: message.text ?? '' };
              r.warn(
                `the codeword appeared BEFORE the deadline (${at}) — the Mind leaked it in an ` +
                  'immediate reply instead of scheduling. Still waiting for a message at/after ' +
                  `${state.deadline}.`,
              );
            }
          }
        },
      });

      if (outcome.matched !== null) {
        ctx.hit = outcome.matched;
        ctx.messagesSeen += 1;
        const at = outcome.matched.at instanceof Date ? outcome.matched.at.toISOString() : 'unknown time';
        r.pass(
          `UNPROMPTED message received at ${at} carrying ${state.codeword}: ` +
            `"${(outcome.matched.text ?? '').slice(0, 200)}"`,
        );
        return;
      }

      failSpike(
        'NO_PROACTIVE',
        'MIND',
        `no unprompted message carrying ${state.codeword} arrived by ${state.giveUpAt} ` +
          `(${ctx.mindMessagesSeen} Mind message(s) seen after F0` +
          `${ctx.earlyLeak === null ? '' : ', including one that leaked the codeword early'}). ` +
          'The API stayed healthy throughout — this is about the agent, not the transport. ' +
          'Check the Bazaar for a scheduling skill before concluding the platform cannot do this.',
      );
    },
  };
}

function containsCodeword(text: string | null | undefined, codeword: string): boolean {
  return (text ?? '').toUpperCase().includes(codeword.toUpperCase());
}

function requireState(): ArmedState {
  if (ctx.state === null) throw new Error('spike bug: arming state used before it was created');
  return ctx.state;
}

function epilogue(): void {
  const state = ctx.state;
  r.plain('');
  r.plain('──────────────────── PROACTIVITY: WHAT THIS MEANS ────────────────────');
  r.plain('');
  if (ctx.hit !== null) {
    r.plain('  The Mind scheduled and sent its own message. Autonomy is NATIVE:');
    r.plain('  the nightly digest and day-2 check-in (Phase 3) can be the Mind\'s own');
    r.plain('  scheduling, with the connector only relaying. Say so on camera.');
  } else if (ctx.earlyLeak !== null) {
    r.plain('  The Mind produced the codeword, but immediately — not at the requested time.');
    r.plain('  Reading: it can emit, it did not schedule. Look for a scheduling skill in the');
    r.plain('  Bazaar; otherwise use a connector-side trigger and keep the CONTENT from the');
    r.plain('  Mind\'s own memory (BUILD_PLAN Phase 3 explicitly allows this fallback).');
  } else if (state !== null) {
    r.plain('  No unprompted message arrived. Before concluding the platform cannot do this:');
    r.plain('    1. check the Bazaar for a scheduling skill and attach it to the Mind;');
    r.plain('    2. re-check without re-arming:  pnpm spike:proactive -- --phase=check');
    r.plain('       (the Mind may still fire late — the state file keeps the codeword);');
    r.plain('    3. ask at office hours whether Minds can self-schedule at all.');
    r.plain('  Fallback: connector-side scheduled trigger, content still 100% from the Mind.');
  } else {
    r.plain('  The run never got as far as arming the Mind — no proactivity verdict.');
  }
  r.plain('');
  r.plain('  This is a MIND-class question. It does not affect the transport GO/NO-GO.');
  r.plain('');
  r.plain('──────────────────────────────────────────────────────────────────────');
}

function buildNotes(): string {
  const state = ctx.state;
  if (state === null) return '**No arming took place** — see the failure above.';
  const parts: string[] = [];
  parts.push(
    `**Proactive (self-scheduled) message: ${ctx.hit === null ? 'NOT observed' : 'OBSERVED'}.** ` +
      `Alias \`${state.alias}\`, codeword \`${state.codeword}\`, armed \`${state.armedAt}\`, ` +
      `requested at/after \`${state.deadline}\`, listened until \`${state.giveUpAt}\`.`,
  );
  if (ctx.ackText !== null) {
    parts.push(`Immediate acknowledgement (expected, ignored for grading):\n\n${fenced(ctx.ackText, 'text')}`);
  }
  if (ctx.earlyLeak !== null) {
    parts.push(
      `**Early leak.** The codeword appeared at \`${ctx.earlyLeak.at}\`, before the deadline — ` +
        `the Mind emitted rather than scheduled:\n\n${fenced(ctx.earlyLeak.text, 'text')}`,
    );
  }
  if (ctx.hit !== null) {
    const at = ctx.hit.at instanceof Date ? ctx.hit.at.toISOString() : 'unknown';
    parts.push(
      `**Unprompted message** received at \`${at}\`:\n\n${fenced(ctx.hit.text ?? '', 'text')}`,
    );
    parts.push(
      '**Consequence:** the Mind can schedule its own messages. Phase 3 autonomous follow-ups ' +
        'can be native rather than cron-faked.',
    );
  } else {
    parts.push(
      '**Consequence:** no native self-scheduling observed. Check the Bazaar for a scheduling ' +
        'skill before concluding the platform cannot do this; otherwise Phase 3 uses a ' +
        'connector-side trigger with content still generated from the Mind\'s memory. ' +
        'Re-checkable without re-arming: `pnpm spike:proactive -- --phase=check`.',
    );
  }
  return parts.join('\n\n');
}

main().catch((error: unknown) => r.crash(error));
