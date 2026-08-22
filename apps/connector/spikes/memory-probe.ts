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
 * The gap is ENFORCED, not merely suggested: asking in the same conversation minutes after
 * teaching cannot separate long-term memory from the context window, so that combination
 * refuses to produce a verdict at all (--allow-short-gap runs it as a plumbing check, and
 * says so in docs/API-NOTES.md).
 *
 * Grading is case-insensitive substring matching. No LLM judge: a memory verdict has to
 * be reproducible by a human reading the transcript.
 */
import { createHash, randomBytes } from 'node:crypto';

import { createMindClient } from '@keeper/minds-client';
import { z } from 'zod';

import { argFlag, argValue, loadSpikeEnv } from './_shared/env.js';
import { appendToApiNotes } from './_shared/notes.js';
import { reporter, shortId, type SpikeReporter } from './_shared/report.js';
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
  /**
   * Which Mind, on which deployment, was actually taught. Stored as a HASH, not the id:
   * _shared/state.ts redacts identifiers on the way to disk, so a stored raw id would
   * come back masked and never compare equal to the live one. Optional so state written
   * before this field existed still loads; when present the ask phase refuses to grade
   * a different Mind's memory against facts it was never told.
   */
  mindFingerprint: z.string().optional(),
  baseUrl: z.string().optional(),
  /**
   * The Mind's acknowledgements of the taught facts. They quote the facts back, so a
   * history read that re-serves one of them would satisfy the ask-phase grading without
   * the Mind recalling anything. Kept so the ask phase can refuse to grade them.
   * Optional: state files written before this field existed must still load.
   */
  acks: z.array(z.string()).default([]),
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
  /** `stale` = history handed back a message that already existed before we asked. */
  match: 'strict' | 'loose' | 'miss' | 'silent' | 'stale' | 'disowned';
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

  const identity = { mindId: env.get('MINDS_MIND_ID'), baseUrl: env.baseUrl };
  if (phase === 'teach') await teachPhase(transport, identity);
  else await askPhase(transport, identity);
}

// --- teach ------------------------------------------------------------------

interface MindIdentity {
  readonly mindId: string;
  readonly baseUrl: string;
}

/** Survives the identifier redaction that _shared/state.ts applies on write. */
function fingerprintOf(mindId: string): string {
  return createHash('sha256').update(mindId).digest('hex').slice(0, 16);
}

async function teachPhase(transport: MindTransport, identity: MindIdentity): Promise<void> {
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
          mindFingerprint: fingerprintOf(identity.mindId),
          baseUrl: identity.baseUrl,
          acks: acks.filter((a): a is string => typeof a === 'string' && a.trim() !== ''),
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

async function askPhase(transport: MindTransport, identity: MindIdentity): Promise<void> {
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
  // Grading Mind B's answers against facts taught to Mind A reads as "memory is broken"
  // when nothing is broken — and this repo's own API-NOTES already mixes runs against
  // localhost fakes with runs against the real deployment.
  const taughtElsewhere =
    (state.mindFingerprint !== undefined && state.mindFingerprint !== fingerprintOf(identity.mindId)) ||
    (state.baseUrl !== undefined && state.baseUrl !== identity.baseUrl);
  if (taughtElsewhere) {
    r.fail(
      'STATE_MISMATCH',
      'PRECONDITION',
      `the stored teach state was taught to a DIFFERENT Mind or deployment ` +
        `(taught on ${state.baseUrl ?? '?'}; this run is mind ${shortId(identity.mindId)} on ${identity.baseUrl}). ` +
        'A Mind that was never told the facts cannot recall them; grading it would look like a ' +
        'memory failure. Point MINDS_MIND_ID / MINDS_API_BASE_URL back at the taught Mind, or ' +
        're-run `pnpm spike:memory -- --phase=teach` against this one.',
    );
    r.finishAndExit();
  }
  const fresh = argFlag('fresh-conversation');
  // A per-run nonce, not just HH:MM: two `--fresh-conversation` runs inside the same
  // clock minute used to share an alias, so the second one asked its questions in a
  // conversation the first had already used while still reporting it as "a conversation
  // the facts were never told to". (Two such entries are already in docs/API-NOTES.md.)
  const askAlias = fresh
    ? `${state.alias}-fresh-${new Date().toISOString().slice(11, 16).replace(':', '')}-${randomBytes(2).toString('hex')}`
    : state.alias;
  const elapsedMs = Date.now() - new Date(state.taughtAt).getTime();
  const elapsedMin = Math.round(elapsedMs / 60_000);
  const shortGap = elapsedMs < MIN_GAP_MS;
  const results: FactResult[] = [];
  /** Ids of messages that existed BEFORE we asked. None of them can be an answer. */
  const priorIds = new Set<string>();
  const teachAcks = new Set(state.acks.map((a) => a.trim()));

  r.info(`taught at ${state.taughtAt} (${elapsedMin} min ago)`);
  r.info(
    fresh
      ? `--fresh-conversation: asking in a NEW alias "${askAlias}" (teach alias was "${state.alias}"). ` +
          'This tests memory ACROSS conversations.'
      : `asking in the SAME alias "${askAlias}" as the teach phase.`,
  );
  if (shortGap && !fresh && !argFlag('allow-short-gap')) {
    // Same conversation + no elapsed time = nothing was crossed. Every chat model answers
    // from the conversation it is already in; grading that would mint a LIVE-VERIFIED
    // "cross-session recall" entry in the day-1 decision document for a Mind with no
    // long-term memory at all. Refuse to produce a verdict instead.
    r.plain('');
    r.plain(`  Only ${elapsedMin} min have passed since the teach phase, and you are asking in the`);
    r.plain('  SAME conversation. That combination proves nothing: the facts are still in the');
    r.plain('  conversation itself, so an ordinary context window answers them without any');
    r.plain('  long-term memory. Do one of these instead:');
    r.plain('');
    r.plain(`      wait until ${new Date(new Date(state.taughtAt).getTime() + MIN_GAP_MS).toISOString()}, then:  pnpm spike:memory -- --phase=ask`);
    r.plain('      or test the other axis now:  pnpm spike:memory -- --phase=ask --fresh-conversation');
    r.plain('      or, to see the plumbing only (NO memory verdict is recorded):');
    r.plain('          pnpm spike:memory -- --phase=ask --allow-short-gap');
    r.plain('');
    r.fail(
      'GAP_TOO_SHORT',
      'PRECONDITION',
      `only ${elapsedMin} min since the teach phase (need >= ${MIN_GAP_MS / 60_000}) and the same ` +
        'conversation — this run cannot distinguish long-term memory from the context window. ' +
        'No memory verdict was produced and nothing was written to docs/API-NOTES.md.',
    );
    r.finishAndExit();
  }
  if (shortGap) {
    r.warn(
      `only ${elapsedMin} min since the teach phase (wanted >= ${MIN_GAP_MS / 60_000}). ` +
        (fresh
          ? 'A new conversation still tests conversation-independence, but NOT durability over time.'
          : 'Running with --allow-short-gap: a PASS here is about plumbing, not about memory.'),
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
    {
      name: 'snapshot what is ALREADY in the conversation (nothing here may count as an answer)',
      run: async () => {
        // Idempotent, and it stops a missing conversation from surfacing as a bare 404 on
        // the history endpoint. The fresh path already ensured; this covers the other one.
        await transport.ensureConversation(askAlias);
        const before = await transport.getHistory(askAlias, { limit: 200 });
        for (const message of before) {
          if (typeof message.id === 'string') priorIds.add(message.id);
        }
        r.pass(
          `${before.length} message(s) already in "${askAlias}"; ${priorIds.size} fingerprint(s) ` +
            `and ${teachAcks.size} teach acknowledgement(s) are now disqualified as answers.`,
        );
      },
    },
    ...state.facts.map((fact, index) => ({
      name: `ask fact ${index + 1}/${state.facts.length}: ${fact.question}`,
      run: async () => {
        const result = await exchange(r, transport, askAlias, fact.question, {
          label: `ask-${index + 1}`,
          timeoutMs: REPLY_TIMEOUT_MS,
          tolerateSilence: true,
        });
        const text = result.reply?.text ?? null;
        // A "reply" that already existed before the question, or that is verbatim the
        // acknowledgement the Mind gave when it was TAUGHT the fact, is history being
        // re-served — it quotes the fact, so substring grading would score it as recall.
        const staleId = result.reply !== null && priorIds.has(result.reply.id);
        const staleAck = text !== null && teachAcks.has(text.trim());
        const match: FactResult['match'] =
          staleId || staleAck ? 'stale' : grade(text, fact.expectedSubstrings, fact.looseSubstrings);
        if (result.reply !== null) priorIds.add(result.reply.id);
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
        else if (match === 'stale') {
          r.warn(
            `NOT GRADED: this "reply" ${staleAck ? 'is verbatim the teach-phase acknowledgement' : 'already existed in history before we asked'}. ` +
              'The forward-only `after` cursor handed us an OLD message. Whatever it contains is ' +
              'our own taught text coming back, not recall.',
          );
        } else if (match === 'disowned') {
          r.warn(
            'NOT COUNTED: the reply contains the expected value but explicitly disowns it ' +
              '("I made that up" / "I don\'t have it on record"). Quoting a value in order to ' +
              'reject it is not recall — see the verbatim reply above.',
          );
        } else r.warn(`no expected substring in the reply (wanted "${fact.expectedSubstrings.join('" / "')}")`);
      },
    })),
    {
      name: 'grade cross-session recall',
      run: async () => {
        printTable(results, elapsedMin);
        const recalled = results.filter((x) => x.match === 'strict' || x.match === 'loose').length;
        const silent = results.filter((x) => x.match === 'silent').length;
        const stale = results.filter((x) => x.match === 'stale').length;
        if (stale > 0) {
          // Not a memory verdict at all: the history endpoint violated its own forward-only
          // contract (docs/API-NOTES.md). Every awaitReply in the product would be exposed to
          // the same thing, so this belongs in the transport decision, not the Mind's column.
          failSpike(
            'HISTORY_CURSOR_BROKEN',
            'INFRA',
            `${stale}/${results.length} "replies" were messages that already existed before the ` +
              'question was asked. `GET /v1/messaging/histories/{alias}?after=` is documented as a ' +
              'forward-only cursor; it is re-serving old records. Nothing about the Mind\'s memory ' +
              'can be concluded from this run — a Mind that said nothing at all would score the same. ' +
              'Fix or work around the cursor first, then re-run.',
          );
        }
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

/**
 * A Mind that says "I don't have a locker code on record - a few turns ago I answered
 * 4831 and I'd made it up" contains the expected substring while explicitly DISOWNING it.
 * LIVE-OBSERVED 2026-08-22: this exact reply scored a clean STRICT and inflated a
 * cross-conversation verdict to 3/3. Quoting a value in order to reject it is not recall.
 */
const DISOWN_PATTERNS: readonly RegExp[] = [
  /\bi (?:made|make) (?:that|it|those) up\b/i,
  /\bi\s?(?:'|’)?m not going to (?:fabricate|guess|invent)\b/i,
  /\bfabricat/i,
  /\bi (?:don'?t|do not) (?:have|hold) [^.?!]{0,60}\bon record\b/i,
  /\bi (?:don'?t|do not) actually (?:have|know)\b/i,
  /\bi have to (?:pass|come clean)\b/i,
  /\bwasn'?t based on anything\b/i,
  /\bi shouldn'?t have (?:filled|made)\b/i,
  /\bthat was (?:a )?(?:guess|invention)\b/i,
];

function isDisowned(text: string): boolean {
  return DISOWN_PATTERNS.some((re) => re.test(text));
}

function grade(text: string | null, strict: string[], loose: string[]): FactResult['match'] {
  if (text === null) return 'silent';
  const haystack = text.toLowerCase();
  const hit =
    strict.some((needle) => haystack.includes(needle.toLowerCase())) ||
    loose.some((needle) => haystack.includes(needle.toLowerCase()));
  // Check the disclaimer only when something matched: a denial with no value in it is an
  // ordinary miss, and conflating the two would hide which way the Mind failed.
  if (hit && isDisowned(text)) return 'disowned';
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
  const stale = results.filter((x) => x.match === 'stale').length;
  r.plain('');
  r.plain('────────────────── WHAT THIS MEANS FOR THE ARCHITECTURE ──────────────────');
  r.plain('');
  if (stale > 0) {
    r.plain(`  ${stale}/${results.length} "answers" were messages that already existed before the`);
    r.plain('  question. This is a HISTORY CURSOR bug on the platform, not a memory result:');
    r.plain('  a Mind that stayed completely silent would have scored exactly the same.');
    r.plain('  Nothing about memory is known from this run. Fix the cursor and re-run.');
    r.plain('');
    r.plain('──────────────────────────────────────────────────────────────────────────');
    return;
  }
  if (elapsedMin < MIN_GAP_MS / 60_000 && results.length > 0) {
    r.plain(`  NOTE: only ${elapsedMin} min elapsed since the teach phase — under the ${MIN_GAP_MS / 60_000}-minute`);
    r.plain('  floor. Whatever follows is about plumbing and conversation scope, not durability.');
    r.plain('');
  }
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
  const stale = results.filter((x) => x.match === 'stale').length;
  const shortGap = elapsedMin < MIN_GAP_MS / 60_000;
  const rows = results
    .map(
      (result, index) =>
        `| ${index + 1} | \`${result.expected.join('` / `')}\` | ${result.match} | ` +
        `${(result.latencyMs / 1000).toFixed(1)}s | ${short(result.reply)} |`,
    )
    .join('\n');
  const warnings = r.warnings();
  return [
    // "Cross-session" is only claimed when a session boundary was actually crossed.
    `**${fresh && !shortGap ? 'Cross-session recall' : 'Recall'}: ${recalled}/${results.length} after ` +
      `${elapsedMin} minutes${fresh ? ', asked in a NEW conversation' : ', asked in the same conversation'}.**`,
    `Teach alias \`${state.alias}\` (taught ${state.taughtAt}) · ask alias \`${askAlias}\`. ` +
      'Grading is case-insensitive substring matching, no LLM judge.',
    ['| # | expected | match | latency | reply |', '|---|---|---|---|---|', rows].join('\n'),
    ...(shortGap
      ? [
          `**Weak evidence — the gap was ${elapsedMin} min, under the ${MIN_GAP_MS / 60_000}-minute floor.** ` +
            (fresh
              ? 'A new conversation still tests conversation-independence, but this run says nothing ' +
                'about durability over time. Re-run the ask phase after a long gap (overnight is best).'
              : 'Asked in the same conversation after almost no time, so an ordinary context window ' +
                'answers these without any long-term memory. Do NOT cite this as evidence of memory.'),
        ]
      : []),
    ...(stale > 0
      ? [
          `**${stale}/${results.length} answers were disqualified as stale** — history returned ` +
            'messages that already existed before the question. See the INFRA failure above: the ' +
            '`after` cursor is not forward-only on this deployment.',
        ]
      : []),
    ...(warnings.length > 0
      ? [['**Warnings**', ...warnings.map((w) => `- ${w}`)].join('\n')]
      : []),
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
  r.plain('      pnpm spike:memory -- --phase=ask --allow-short-gap      # plumbing only, no verdict');
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
