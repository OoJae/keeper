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

/** Candidates in priority order, deduped, first valid one wins. */
function collectCandidates(text: string, bounded: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string): void => {
    const c = raw.trim();
    if (c.length === 0 || seen.has(c)) return;
    seen.add(c);
    out.push(c);
  };

  // 1. Fast path: the whole reply is the JSON block.
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) push(trimmed);

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
  for (const body of jsonFences) push(body);
  for (const body of otherFences) {
    if (body.trim().startsWith('{')) push(body);
    else for (const span of scanBalancedSpans(body, MAX_CANDIDATES)) push(span);
  }

  // 4. Balanced-brace scan of the whole (bounded) reply.
  for (const span of scanBalancedSpans(bounded, MAX_CANDIDATES)) push(span);

  return out.slice(0, MAX_CANDIDATES);
}

function repair(raw: string): string {
  return raw
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
 */
export function gateDirective(d: KeeperDirective): { directive: KeeperDirective; gated: boolean } {
  if (d.confidence !== 'low' || !ACTING_ACTIONS.has(d.action)) return { directive: d, gated: false };

  const target = 'target_member' in d ? d.target_member : undefined;
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

  const valid: Array<{ directive: KeeperDirective; raw: string }> = [];
  let firstSchemaError: { detail: string; raw: string } | undefined;
  let firstJsonError: { detail: string; raw: string } | undefined;

  for (const candidate of candidates) {
    const parsed = tolerantParse(candidate);
    if (!parsed.ok) {
      firstJsonError ??= { detail: parsed.error, raw: candidate };
      continue;
    }
    const result = DirectiveSchema.safeParse(normalizeShape(parsed.value));
    if (!result.success) {
      firstSchemaError ??= { detail: formatZodError(result.error), raw: candidate };
      continue;
    }
    valid.push({ directive: result.data, raw: candidate });
  }

  const first = valid[0];
  if (first !== undefined) {
    const warnings: string[] = [];
    if (valid.length > 1) warnings.push(`multiple_directive_blocks:${valid.length}`);
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
