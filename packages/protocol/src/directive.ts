import type { ZodError } from 'zod';
import { DirectiveSchema } from './schemas.js';
import {
  ACTING_ACTIONS,
  NONE_FALLBACK,
  type DirectiveParseResult,
  type FallbackReason,
  type KeeperDirective,
} from './types.js';

/** Bounded work on pathological replies: caps, not correctness knobs. */
const MAX_CANDIDATES = 10;
const MAX_SCAN_CHARS = 100_000;
const SNIPPET_CHARS = 200;

const FENCE_RE = /```([^\n`]*)\r?\n([\s\S]*?)```/g;

/**
 * The live platform answers in HTML (LIVE-VERIFIED 2026-08-22, docs/API-NOTES.md), so the
 * Mind's markdown fence reaches us as `<pre><code>…</code></pre>` with the JSON
 * entity-escaped and not one backtick in sight. Treating that as unfenced would mark every
 * real directive `unfenced_directive`, and the connector refuses destructive work from
 * unfenced blocks — i.e. the Steward could never delete, warn, mute or reward again.
 */
const HTML_CODE_RE = /<(pre|code)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
const HTML_TAG_RE = /<[^>]*>/g;

function truncate(s: string): string {
  return s.length > SNIPPET_CHARS ? s.slice(0, SNIPPET_CHARS) : s;
}

/**
 * Top-level `{...}` spans. String tracking only applies inside a span, so an
 * unbalanced quote in surrounding prose cannot swallow the JSON block.
 */
function scanBalancedSpans(text: string, limit: number): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (depth > 0 && inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      if (depth > 0) inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const span = text.slice(start, i + 1);
        start = -1;
        // Pre-filter: a directive always names its action.
        if (span.includes('action')) {
          spans.push(span);
          if (spans.length >= limit) break;
        }
      }
    }
  }
  return spans;
}

interface Candidate {
  json: string;
  /**
   * True when the block was recovered from bare prose rather than a fence or a
   * whole-reply payload. Spec §3.2 says the Mind replies with a *fenced* block, so an
   * unfenced match may be the Mind quoting a member's message rather than issuing an
   * order. We still parse it (Minds drop fences often enough that refusing would lose
   * real directives), but the caller is told, and destructive actions should demand a fence.
   */
  unfenced: boolean;
}

/** Candidates in priority order, deduped, first valid one wins. */
function collectCandidates(text: string, bounded: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();

  const push = (raw: string, unfenced: boolean): void => {
    const c = raw.trim();
    if (c.length === 0 || seen.has(c)) return;
    seen.add(c);
    out.push({ json: c, unfenced });
  };

  // 1. Fast path: the whole reply is the JSON block.
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) push(trimmed, false);

  // 2/3. Fenced blocks: ```json first, then any other fence.
  const jsonFences: string[] = [];
  const otherFences: string[] = [];
  FENCE_RE.lastIndex = 0;
  for (let m = FENCE_RE.exec(bounded); m !== null; m = FENCE_RE.exec(bounded)) {
    const info = (m[1] ?? '').trim().toLowerCase();
    const body = m[2] ?? '';
    if (info.startsWith('json')) jsonFences.push(body);
    else otherFences.push(body);
  }
  const pushFenceBody = (body: string): void => {
    if (body.trim().startsWith('{')) push(body, false);
    else for (const span of scanBalancedSpans(body, MAX_CANDIDATES)) push(span, false);
  };

  for (const body of jsonFences) push(body, false);
  for (const body of otherFences) pushFenceBody(body);

  // 3b. HTML code blocks: the same signal as a fence, because that is what the platform
  //     renders a fence into. Inner markup is stripped so `<pre><code>` reads as one block.
  HTML_CODE_RE.lastIndex = 0;
  for (let m = HTML_CODE_RE.exec(bounded); m !== null; m = HTML_CODE_RE.exec(bounded)) {
    pushFenceBody((m[2] ?? '').replace(HTML_TAG_RE, ''));
  }

  // 4. Balanced-brace scan of the whole (bounded) reply: bare prose, no fence.
  for (const span of scanBalancedSpans(bounded, MAX_CANDIDATES)) push(span, true);

  return out.slice(0, MAX_CANDIDATES);
}

/**
 * The live Minds platform returns replies as HTML (LIVE-VERIFIED 2026-08-22, see
 * docs/API-NOTES.md), so a directive can arrive with its quotes entity-escaped. Decoded
 * only on the repair path, i.e. after a plain JSON.parse has already failed — a valid
 * payload is never rewritten. `&amp;` is decoded last so `&amp;quot;` cannot become a quote.
 */
function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&quot;|&#0*34;|&#x0*22;/gi, '"')
    .replace(/&apos;|&#0*39;|&#x0*27;/gi, "'")
    .replace(/&lt;|&#0*60;/gi, '<')
    .replace(/&gt;|&#0*62;/gi, '>')
    .replace(/&nbsp;|&#0*160;/gi, ' ')
    .replace(/&amp;|&#0*38;/gi, '&');
}

function repair(raw: string): string {
  return decodeHtmlEntities(raw)
    .replace(/^\s*json\s*/i, '')
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/,(\s*[}\]])/g, '$1');
}

type TolerantParse = { ok: true; value: unknown } | { ok: false; error: string };

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** JSON.parse as-is; on failure apply repairs and retry exactly once. */
function tolerantParse(raw: string): TolerantParse {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (first) {
    const repaired = repair(raw);
    if (repaired === raw) return { ok: false, error: errorMessage(first) };
    try {
      return { ok: true, value: JSON.parse(repaired) };
    } catch (second) {
      return { ok: false, error: errorMessage(second) };
    }
  }
}

function normalizeShape(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  const action = out['action'];
  if (typeof action === 'string') out['action'] = action.trim().toLowerCase();
  const confidence = out['confidence'];
  if (typeof confidence === 'string') out['confidence'] = confidence.trim().toLowerCase();
  return out;
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}

function fallback(reason: FallbackReason, detail: string, rawSnippet?: string): DirectiveParseResult {
  const base = { kind: 'fallback', directive: NONE_FALLBACK, reason, detail: truncate(detail) } as const;
  return rawSnippet === undefined ? base : { ...base, rawSnippet: truncate(rawSnippet) };
}

/**
 * Iron rule: low confidence never auto-acts. A low-confidence acting directive
 * becomes a creator flag carrying the Mind's original reasoning. A directive
 * with no confidence at all defaults to 'low' and is therefore gated too.
 *
 * The check is an allowlist, not `!== 'low'`: this function is exported and may
 * be handed a directive that never went through `DirectiveSchema` (rehydrated
 * from the mirror DB, built by an override UI, decoded from a log line). Anything
 * that is not explicitly 'high' or 'medium' is treated as low and gated, so an
 * `undefined`/`null`/`'LOW'`/`'unknown'` confidence can never auto-act.
 */
export function gateDirective(d: KeeperDirective): { directive: KeeperDirective; gated: boolean } {
  const trusted = d.confidence === 'high' || d.confidence === 'medium';
  if (trusted || !ACTING_ACTIONS.has(d.action)) return { directive: d, gated: false };

  // An empty/non-string target would make the flag itself fail DirectiveSchema,
  // so drop it rather than emit a directive the connector cannot execute.
  const raw = 'target_member' in d ? d.target_member : undefined;
  const target = typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  const suffix = d.message ? `: ${d.message}` : '';
  const flagged: KeeperDirective = {
    action: 'flag_creator',
    ...(target === undefined ? {} : { target_member: target }),
    message: `Low-confidence "${d.action}" suggested${suffix}`,
    reasoning: d.reasoning,
    confidence: 'low',
  };
  return { directive: flagged, gated: true };
}

/** Pull the KEEPER-ACTION directive out of whatever prose the Mind wrapped it in. */
export function extractDirective(replyText: string): DirectiveParseResult {
  const text = typeof replyText === 'string' ? replyText : '';
  const bounded = text.length > MAX_SCAN_CHARS ? text.slice(0, MAX_SCAN_CHARS) : text;

  const candidates = collectCandidates(text, bounded);
  if (candidates.length === 0) return fallback('no_json_found', text);

  const valid: Array<{ directive: KeeperDirective; raw: string; unfenced: boolean }> = [];
  let firstSchemaError: { detail: string; raw: string } | undefined;
  let firstJsonError: { detail: string; raw: string } | undefined;

  for (const candidate of candidates) {
    const parsed = tolerantParse(candidate.json);
    if (!parsed.ok) {
      firstJsonError ??= { detail: parsed.error, raw: candidate.json };
      continue;
    }
    const result = DirectiveSchema.safeParse(normalizeShape(parsed.value));
    if (!result.success) {
      firstSchemaError ??= { detail: formatZodError(result.error), raw: candidate.json };
      continue;
    }
    valid.push({ directive: result.data, raw: candidate.json, unfenced: candidate.unfenced });
  }

  const first = valid[0];
  if (first !== undefined) {
    const warnings: string[] = [];
    if (valid.length > 1) warnings.push(`multiple_directive_blocks:${valid.length}`);
    // Recovered from bare prose: may be the Mind quoting a member, not ordering us.
    if (first.unfenced) warnings.push('unfenced_directive');
    const { directive, gated } = gateDirective(first.directive);
    return { kind: 'ok', directive, gated, rawBlock: first.raw, warnings };
  }

  if (firstSchemaError !== undefined) {
    return fallback('schema_invalid', firstSchemaError.detail, firstSchemaError.raw);
  }
  if (firstJsonError !== undefined) {
    return fallback('json_invalid', firstJsonError.detail, firstJsonError.raw);
  }
  return fallback('no_json_found', text);
}
