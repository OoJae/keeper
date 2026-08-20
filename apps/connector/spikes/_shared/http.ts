/**
 * Dependency-free raw HTTP against the Minds API.
 *
 * Deliberately does NOT go through @keeper/minds-client: api-smoke step 1 must be able
 * to prove the platform is up even if our adapter is broken, and two endpoints we need
 * (credits, GET /v1/minds/{id}) are outside the transport's messaging contract.
 */
import { z } from 'zod';

export const DEFAULT_BASE_URL = 'https://api.build.hellominds.ai';

export const AUTH_HEADERS = {
  canonical: 'X-Api-Key',
  legacy: 'X-Access-Key',
} as const;

export type AuthHeaderName = (typeof AUTH_HEADERS)[keyof typeof AUTH_HEADERS];

export interface RawRequest {
  readonly baseUrl: string;
  readonly path: string;
  readonly apiKey: string;
  readonly header: AuthHeaderName;
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  readonly body?: unknown;
  readonly timeoutMs?: number;
}

export interface RawResponse {
  readonly method: string;
  readonly url: string;
  readonly header: AuthHeaderName;
  readonly durationMs: number;
  /** null when the request never produced an HTTP response (DNS/refused/timeout). */
  readonly status: number | null;
  readonly ok: boolean;
  readonly bodyText: string;
  readonly json: unknown;
  readonly jsonParseError: string | null;
  readonly networkError: { name: string; message: string; code: string | null } | null;
}

export async function rawRequest(req: RawRequest): Promise<RawResponse> {
  const method = req.method ?? 'GET';
  const url = `${req.baseUrl.replace(/\/+$/, '')}${req.path}`;
  const headers: Record<string, string> = {
    [req.header]: req.apiKey,
    Accept: 'application/json',
  };
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';

  const started = Date.now();
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(req.timeoutMs ?? 20_000),
    });
    const bodyText = await response.text();
    let json: unknown = null;
    let jsonParseError: string | null = null;
    if (bodyText.trim() !== '') {
      try {
        json = JSON.parse(bodyText);
      } catch (error) {
        jsonParseError = (error as Error).message;
      }
    }
    return {
      method,
      url,
      header: req.header,
      durationMs: Date.now() - started,
      status: response.status,
      ok: response.ok,
      bodyText,
      json,
      jsonParseError,
      networkError: null,
    };
  } catch (error) {
    const err = error as Error & { cause?: { code?: string } };
    return {
      method,
      url,
      header: req.header,
      durationMs: Date.now() - started,
      status: null,
      ok: false,
      bodyText: '',
      json: null,
      jsonParseError: null,
      networkError: {
        name: err.name,
        message: err.message,
        code: err.cause?.code ?? null,
      },
    };
  }
}

/** A one-line summary suitable for a FAIL message. */
export function describe(response: RawResponse): string {
  if (response.networkError) {
    const code = response.networkError.code ?? response.networkError.name;
    return `${response.method} ${response.url} produced no HTTP response (${code}: ${response.networkError.message})`;
  }
  const body = response.bodyText.trim() === '' ? '<empty body>' : truncate(response.bodyText, 500);
  return `${response.method} ${response.url} returned ${String(response.status)} ${body}`;
}

/** Dump-friendly view of a response, WITHOUT the request headers (which carry the key). */
export function summarizeResponse(response: RawResponse): Record<string, unknown> {
  return {
    method: response.method,
    url: response.url,
    authHeaderUsed: response.header,
    status: response.status,
    durationMs: response.durationMs,
    networkError: response.networkError,
    jsonParseError: response.jsonParseError,
    body: response.json ?? response.bodyText,
  };
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [+${text.length - max} chars]`;
}

/** Order in which to try auth headers, given MINDS_AUTH_HEADER. */
export function authHeaderOrder(preference: string): AuthHeaderName[] {
  const pref = preference.toLowerCase();
  if (pref === 'x-access-key') return [AUTH_HEADERS.legacy, AUTH_HEADERS.canonical];
  if (pref === 'auto') return [AUTH_HEADERS.canonical, AUTH_HEADERS.legacy];
  return [AUTH_HEADERS.canonical, AUTH_HEADERS.legacy];
}

/** Tries the preferred auth header, then the other one on 401/403. */
export async function rawRequestAuto(
  req: Omit<RawRequest, 'header'> & { preference: string },
): Promise<RawResponse> {
  let last: RawResponse | null = null;
  for (const header of authHeaderOrder(req.preference)) {
    const response = await rawRequest({ ...req, header });
    last = response;
    if (response.status !== 401 && response.status !== 403) return response;
  }
  // Both headers were rejected; return the last attempt so the caller can report it.
  return last as RawResponse;
}

/** `BuilderMind` per docs/API-NOTES.md. Everything is optional: this is a beta API. */
export const BuilderMindSchema = z
  .object({
    mindId: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    model: z.string().optional(),
    species: z.string().optional(),
    isEnabled: z.boolean().optional(),
    hasTelegram: z.boolean().optional(),
    telegramBotId: z.string().optional(),
    walletAddress: z.string().nullable().optional(),
    chain: z.string().nullable().optional(),
  })
  .passthrough();

export type BuilderMind = z.infer<typeof BuilderMindSchema>;

export interface MindDetail {
  readonly response: RawResponse;
  readonly mind: BuilderMind | null;
  readonly shapeIssue: string | null;
}

export async function fetchMindDetail(opts: {
  baseUrl: string;
  mindId: string;
  apiKey: string;
  preference: string;
}): Promise<MindDetail> {
  const response = await rawRequestAuto({
    baseUrl: opts.baseUrl,
    path: `/v1/minds/${encodeURIComponent(opts.mindId)}`,
    apiKey: opts.apiKey,
    preference: opts.preference,
  });
  if (!response.ok) return { response, mind: null, shapeIssue: null };
  const parsed = BuilderMindSchema.safeParse(response.json);
  if (!parsed.success) {
    return {
      response,
      mind: null,
      shapeIssue: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  return { response, mind: parsed.data, shapeIssue: null };
}
