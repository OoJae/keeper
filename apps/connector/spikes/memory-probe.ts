/**
 * memory-probe — the existential spike.
 *
 * Cross-session recall is the Minds platform's core claim AND the foundation of Keeper's
 * architecture (relationship memory lives in the Mind, never in SQLite). If this fails,
 * escalate at office hours immediately — it is not a feature question, it is the plan.
 *
 * Two phases, deliberately run as SEPARATE PROCESSES with a real gap between them:
 *   pnpm spike:memory -- --phase=teach     (send 3 nonce-bearing facts, ack each)
 *   … wait >= 10 minutes …
 *   pnpm spike:memory -- --phase=ask       (ask them back, grade by substring)
 *
 * Add --fresh-conversation to the ask phase to test recall ACROSS conversations, which
 * decides whether Keeper must pin one long-lived conversation per community.
 *
 * Grading is case-insensitive substring matching. No LLM judge: a memory verdict has to
 * be reproducible by a human reading the transcript.
 */
import { randomBytes } from 'node:crypto';

import { createMindClient } from '@keeper/minds-client';
import { z } from 'zod';

import { argFlag, argValue, loadSpikeEnv } from './_shared/env.js';
import { appendToApiNotes } from './_shared/notes.js';
import { fenced, reporter, shortId, type SpikeReporter } from './_shared/report.js';
import { readSpikeState, STATE_PATH, writeSpikeState } from './_shared/state.js';
import {
  exchange,
  failSpike,
  healthGate,
  runSteps,
  type MindTransport,
  type Step,
} from './_shared/steps.js';

const r: SpikeReporter = reporter('memory-probe');
const STATE_KEY = 'memory-probe';
const MIN_GAP_MS = 10 * 60 * 1000;
const REPLY_TIMEOUT_MS = 120_000;

const TAUGHT_FACTS = [
  {
    fact: 'My locker code is 4831.',
    question: 'What is my locker code? Answer with the number only.',
    expectedSubstrings: ['4831'],
    looseSubstrings: [] as string[],
  },
  {
    fact: 'Our community mascot is a pangolin named Zorro.',
    question: 'What is our community mascot called, and what animal is it?',
    expectedSubstrings: ['zorro'],
    looseSubstrings: [] as string[],
  },
  {
    fact: 'Keeper launch date is 14 October.',
    question: 'What is the Keeper launch date?',
    expectedSubstrings: ['14 october', 'october 14'],
    looseSubstrings: ['14 oct', 'oct 14', '14th october', 'october 14th', '2026-10-14', '14/10', '10/14'],
  },
] as const;

const TeachStateSchema = z.object({
  runId: z.string().min(1),
  alias: z.string().min(1),
  taughtAt: z.string().min(1),
  facts: z
    .array(
      z.object({
        fact: z.string(),
        question: z.string(),
        expectedSubstrings: z.array(z.string()),
        looseSubstrings: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});
type TeachState = z.infer<typeof TeachStateSchema>;

interface FactResult {
  question: string;
  expected: string[];
  reply: string | null;
  match: 'strict' | 'loose' | 'miss' | 'silent';
  latencyMs: number;
}

async function main(): Promise<void> {
  const phase = (argValue('phase') ?? '').toLowerCase();
  if (phase !== 'teach' && phase !== 'ask') {
    usage(phase);
    r.fail(
      'MISSING_ARG',
      'PRECONDITION',
      phase === ''
        ? 'no --phase given. This spike needs two runs separated by a real time gap.'
        : `unknown --phase=${phase}. Valid phases: teach, ask.`,
    );
    r.finishAndExit();
  }

  const env = loadSpikeEnv(['MINDS_BUILDER_API_KEY', 'MINDS_MIND_ID'], r);
  r.info(`base url: ${env.baseUrl} · mind ${shortId(env.get('MINDS_MIND_ID'))}`);
  const transport = createMindClient().transport;

  if (phase === 'teach') await teachPhase(transport);
  else await askPhase(transport);
}

// --- teach ------------------------------------------------------------------

async function teachPhase(transport: MindTransport): Promise<void> {
  const runId = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(2).toString('hex')}`;
  const alias = `keeper-memory-${runId}`;
  const acks: Array<string | null> = [];

  const steps: Step[] = [
    { name: 'health check', run: () => healthGate(r, transport) },
    {
      name: `ensureConversation('${alias}')`,
      run: async () => {
        const conversation = await transport.ensureConversation(alias);
        r.raw('ensure-conversation', conversation.raw);
        r.pass(`conversation ready: ${shortId(conversation.conversationId)}`);
      },
    },
    ...TAUGHT_FACTS.map((entry, index) => ({
      name: `teach fact ${index + 1}/3 and wait for an acknowledgement (proves ingestion)`,
      run: async () => {
        const result = await exchange(r, transport, alias, entry.fact, {
          label: `teach-${index + 1}`,
          timeoutMs: REPLY_TIMEOUT_MS,
        });
        acks.push(result.reply?.text ?? null);
        r.pass(
          `fact ${index + 1} acknowledged in ${(result.latencyMs / 1000).toFixed(1)}s: ` +
            `"${(result.reply?.text ?? '').slice(0, 120)}"`,
        );
      },
    })),
    {
      name: 'persist teach state for the ask phase',
      run: async () => {
        const state: TeachState = {
          runId,
          alias,
          taughtAt: new Date().toISOString(),
          facts: TAUGHT_FACTS.map((f) => ({
            fact: f.fact,
            question: f.question,
            expectedSubstrings: [...f.expectedSubstrings],
            looseSubstrings: [...f.looseSubstrings],
          })),
        };
        const path = writeSpikeState(STATE_KEY, state);
        r.pass(`teach state saved to ${path} (key "${STATE_KEY}")`);
      },
    },
  ];

  const ok = await runSteps(r, steps);

  r.plain('');
  if (ok) {
    r.plain('  Teach phase done. Now WAIT AT LEAST 10 MINUTES (longer is better evidence —');
    r.plain('  an overnight gap is the strongest possible demo), then run:');
    r.plain('');
    r.plain('      pnpm spike:memory -- --phase=ask');
    r.plain('');
    r.plain('  …and, to test recall ACROSS conversations (the architecture question):');
    r.plain('');
    r.plain('      pnpm spike:memory -- --phase=ask --fresh-conversation');
    r.plain('');
  }

  const path = appendToApiNotes(
    [
      `**Teach phase.** Sent 3 nonce-bearing facts to alias \`${alias}\`, each awaited an ack.`,
      TAUGHT_FACTS.map((f, i) => `${i + 1}. \`${f.fact}\` -> ack: ${short(acks[i])}`).join('\n'),
      'No verdict yet: the ask phase (a separate process, >= 10 minutes later) decides it.',
    ].join('\n\n'),
    {
      spike: 'memory-probe',
      verdict: r.verdict(),
      code: r.code(),
      cls: r.classOf(),
      durationMs: r.elapsedMs(),
      context: { phase: 'teach', alias, runId },
    },
  );
  r.info(`appended to ${path}`);
  r.finishAndExit();
}

// --- ask --------------------------------------------------------------------

async function askPhase(transport: MindTransport): Promise<void> {
  const rawState = readSpikeState<unknown>(STATE_KEY);
  if (rawState === null) {
    r.fail(
      'MISSING_STATE',
      'PRECONDITION',
      `no teach state found in ${STATE_PATH} under key "${STATE_KEY}". ` +
        'Run `pnpm spike:memory -- --phase=teach` first, wait >= 10 minutes, then ask.',
    );
    r.finishAndExit();
  }
  const parsed = TeachStateSchema.safeParse(rawState);
  if (!parsed.success) {
    r.raw('unreadable-teach-state', rawState);
    r.fail(
      'MISSING_STATE',
      'PRECONDITION',
      `teach state in ${STATE_PATH} does not match the expected shape ` +
        `(${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}). ` +
        'Re-run `pnpm spike:memory -- --phase=teach`.',
    );
    r.finishAndExit();
  }

  const state = parsed.data;
  const fresh = argFlag('fresh-conversation');
  const askAlias = fresh
    ? `${state.alias}-fresh-${new Date().toISOString().slice(11, 16).replace(':', '')}`
    : state.alias;
  const elapsedMs = Date.now() - new Date(state.taughtAt).getTime();
  const elapsedMin = Math.round(elapsedMs / 60_000);
  const results: FactResult[] = [];

  r.info(`taught at ${state.taughtAt} (${elapsedMin} min ago)`);
  r.info(
    fresh
      ? `--fresh-conversation: asking in a NEW alias "${askAlias}" (teach alias was "${state.alias}"). ` +
          'This tests memory ACROSS conversations.'
      : `asking in the SAME alias "${askAlias}" as the teach phase.`,
  );
  if (elapsedMs < MIN_GAP_MS) {
    r.warn(
      `only ${elapsedMin} min since the teach phase (wanted >= 10). A short gap can be served ` +
        'from immediate context rather than long-term memory — a PASS here is weaker evidence.',
    );
  }

  const steps: Step[] = [
    { name: 'health check', run: () => healthGate(r, transport) },
    ...(fresh
      ? [
          {
            name: `ensureConversation('${askAlias}') — a conversation the facts were never told to`,
            run: async () => {
              const conversation = await transport.ensureConversation(askAlias);
              r.raw('ensure-fresh-conversation', conversation.raw);
              r.pass(`fresh conversation ready: ${shortId(conversation.conversationId)}`);
            },
          },
        ]
      : []),
    ...state.facts.map((fact, index) => ({
      name: `ask fact ${index + 1}/${state.facts.length}: ${fact.question}`,
      run: async () => {
        const result = await exchange(r, transport, askAlias, fact.question, {
          label: `ask-${index + 1}`,
          timeoutMs: REPLY_TIMEOUT_MS,
          tolerateSilence: true,
        });
        const text = result.reply?.text ?? null;
        const match = grade(text, fact.expectedSubstrings, fact.looseSubstrings);
        results.push({
          question: fact.question,
          expected: [...fact.expectedSubstrings],
          reply: text,
          match,
          latencyMs: result.latencyMs,
        });
        if (match === 'strict') r.pass(`recalled — matched "${fact.expectedSubstrings.join('" / "')}"`);
        else if (match === 'loose') r.pass(`recalled, non-canonical wording — matched a loose variant`);
        else if (match === 'silent') r.warn('no reply at all to this question');
        else r.warn(`no expected substring in the reply (wanted "${fact.expectedSubstrings.join('" / "')}")`);
      },
    })),
    {
      name: 'grade cross-session recall',
      run: async () => {
        printTable(results, elapsedMin);
        const recalled = results.filter((x) => x.match === 'strict' || x.match === 'loose').length;
        const silent = results.filter((x) => x.match === 'silent').length;
        if (silent === results.length) {
          failSpike(
            'MIND_SILENT',
            'MIND',
            `the Mind answered none of the ${results.length} questions. Every HTTP call succeeded, ` +
              'so this is not a transport problem — check Cognition balance and that the Mind is enabled.',
          );
        }
        if (recalled < results.length) {
          const misses = results
            .filter((x) => x.match !== 'strict' && x.match !== 'loose')
            .map((x) => `expected substring "${x.expected.join('" / "')}", got: "${x.reply ?? '<no reply>'}"`)
            .join(' | ');
          failSpike(
            'MIND_WRONG',
            'MIND',
            `Mind recalled ${recalled}/${results.length} facts after ${elapsedMin} min` +
              `${fresh ? ' across a NEW conversation' : ''} — ${misses}. API itself is healthy (all calls 2xx).`,
          );
        }
        r.pass(
          `${recalled}/${results.length} facts recalled after ${elapsedMin} min` +
            `${fresh ? ' in a conversation they were never told to' : ''}.`,
        );
      },
    },
  ];

  await runSteps(r, steps);
  epilogue(fresh, results, elapsedMin);

  const path = appendToApiNotes(buildAskNotes(state, askAlias, fresh, elapsedMin, results), {
    spike: 'memory-probe',
    verdict: r.verdict(),
    code: r.code(),
    cls: r.classOf(),
    durationMs: r.elapsedMs(),
    context: {
      phase: 'ask',
      teachAlias: state.alias,
      askAlias,
      freshConversation: fresh,
      gapMinutes: elapsedMin,
    },
  });
  r.info(`appended to ${path}`);
  r.finishAndExit();
}

// --- helpers ----------------------------------------------------------------

function grade(text: string | null, strict: string[], loose: string[]): FactResult['match'] {
  if (text === null) return 'silent';
  const haystack = text.toLowerCase();
  if (strict.some((needle) => haystack.includes(needle.toLowerCase()))) return 'strict';
  if (loose.some((needle) => haystack.includes(needle.toLowerCase()))) return 'loose';
  return 'miss';
}

function printTable(results: FactResult[], elapsedMin: number): void {
  r.plain('');
  r.plain(`  RECALL after ${elapsedMin} minutes`);
  r.plain(`  ${'#'.padEnd(3)}${'expected'.padEnd(26)}${'result'.padEnd(9)}${'latency'.padEnd(9)}reply`);
  r.plain(`  ${'-'.repeat(100)}`);
  results.forEach((result, index) => {
    const expected = result.expected.join(' / ');
    const reply = (result.reply ?? '<no reply>').replace(/\s+/g, ' ');
    r.plain(
      `  ${String(index + 1).padEnd(3)}${expected.slice(0, 25).padEnd(26)}` +
        `${result.match.toUpperCase().padEnd(9)}${`${(result.latencyMs / 1000).toFixed(1)}s`.padEnd(9)}` +
        `${reply.slice(0, 60)}`,
    );
  });
  r.plain('');
}

function epilogue(fresh: boolean, results: FactResult[], elapsedMin: number): void {
  const recalled = results.filter((x) => x.match === 'strict' || x.match === 'loose').length;
  r.plain('');
  r.plain('────────────────── WHAT THIS MEANS FOR THE ARCHITECTURE ──────────────────');
  r.plain('');
  if (results.length === 0) {
    r.plain('  No answers were collected — nothing can be concluded about memory.');
  } else if (recalled === results.length && fresh) {
    r.plain('  Memory survives ACROSS conversations. Keeper may open conversations freely;');
    r.plain('  a single long-lived conversation per community is not required.');
  } else if (recalled === results.length) {
    r.plain(`  Memory survives within one conversation across ${elapsedMin} min and a process restart.`);
    r.plain('  NOT yet proven across conversations — run:');
    r.plain('      pnpm spike:memory -- --phase=ask --fresh-conversation');
    r.plain('  before assuming Keeper can use per-topic conversations.');
  } else if (fresh) {
    r.plain(`  Recall was ${recalled}/${results.length} in a NEW conversation. If the same questions`);
    r.plain('  pass in the original alias, memory is CONVERSATION-SCOPED: Keeper must pin one');
    r.plain('  long-lived conversation per community and never rotate the alias.');
  } else {
    r.plain(`  Recall was ${recalled}/${results.length} in the SAME conversation. This is the existential`);
    r.plain('  case in BUILD_PLAN §5: escalate at office hours immediately. Before doing so,');
    r.plain('  confirm the Mind has Cognition left and that the teach acks above look like');
    r.plain('  genuine acknowledgements rather than generic filler.');
  }
  r.plain('');
  r.plain('──────────────────────────────────────────────────────────────────────────');
}

function buildAskNotes(
  state: TeachState,
  askAlias: string,
  fresh: boolean,
  elapsedMin: number,
  results: FactResult[],
): string {
  const recalled = results.filter((x) => x.match === 'strict' || x.match === 'loose').length;
  const rows = results
    .map(
      (result, index) =>
        `| ${index + 1} | \`${result.expected.join('` / `')}\` | ${result.match} | ` +
        `${(result.latencyMs / 1000).toFixed(1)}s | ${short(result.reply)} |`,
    )
    .join('\n');
  return [
    `**Cross-session recall: ${recalled}/${results.length} after ${elapsedMin} minutes` +
      `${fresh ? ', asked in a NEW conversation' : ', asked in the same conversation'}.**`,
    `Teach alias \`${state.alias}\` (taught ${state.taughtAt}) · ask alias \`${askAlias}\`. ` +
      'Grading is case-insensitive substring matching, no LLM judge.',
    ['| # | expected | match | latency | reply |', '|---|---|---|---|---|', rows].join('\n'),
    fresh
      ? recalled === results.length
        ? '**Architecture consequence:** memory is NOT conversation-scoped — Keeper may open ' +
          'conversations freely.'
        : '**Architecture consequence:** recall failed across conversations. If the same questions ' +
          'pass in the original alias, memory is conversation-scoped and Keeper MUST pin one ' +
          'long-lived conversation per community.'
      : '**Architecture consequence:** still unverified across conversations — re-run with ' +
        '`--fresh-conversation` before assuming per-topic conversations are safe.',
  ].join('\n\n');
}

function short(text: string | null | undefined): string {
  if (text === null || text === undefined) return '_(no reply)_';
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return `"${oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine}"`;
}

function usage(phase: string): void {
  const existing = readSpikeState<unknown>(STATE_KEY);
  r.plain('');
  r.plain('  memory-probe needs a phase. It is deliberately TWO runs in TWO processes:');
  r.plain('');
  r.plain('      pnpm spike:memory -- --phase=teach     # sends 3 facts, waits for acks');
  r.plain('      … wait at least 10 minutes …');
  r.plain('      pnpm spike:memory -- --phase=ask       # asks them back, grades by substring');
  r.plain('      pnpm spike:memory -- --phase=ask --fresh-conversation   # across conversations');
  r.plain('');
  r.plain('  (If argument forwarding through pnpm eats the flag, use the env fallback:');
  r.plain('      SPIKE_PHASE=ask pnpm spike:memory');
  r.plain('   and SPIKE_FRESH_CONVERSATION=1 for the fresh-conversation variant.)');
  r.plain('');
  if (existing === null) {
    r.plain(`  Teach state: NONE found in ${STATE_PATH}. You must run --phase=teach first.`);
  } else {
    const parsed = TeachStateSchema.safeParse(existing);
    r.plain(
      parsed.success
        ? `  Teach state: FOUND (alias ${parsed.data.alias}, taught ${parsed.data.taughtAt}). ` +
            'You can run --phase=ask.'
        : `  Teach state: found in ${STATE_PATH} but unreadable — re-run --phase=teach.`,
    );
  }
  if (phase !== '') r.plain(`  (You passed --phase=${phase}, which is not a valid phase.)`);
  r.plain('');
}

main().catch((error: unknown) => r.crash(error));
