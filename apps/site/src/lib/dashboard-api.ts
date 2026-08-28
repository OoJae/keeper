/**
 * The connector is the only source of truth this dashboard has.
 *
 * Every panel reads from the connector's API, which reads the SQLite mirror and the Mind's
 * cached recollections. Nothing is computed here — if a number or a judgment appears on screen,
 * it came from the mirror or from the Mind, and this file is the seam that makes that checkable.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export type Warmth = 'warm' | 'steady' | 'cooling' | 'at_risk';

export interface Recall {
  handle: string | null;
  display: string;
  summary: string;
  openLoops: string[];
  warmth: Warmth;
  warmthReason: string;
  capturedAt: string;
  raw: string;
}

export interface Member {
  telegramId: number;
  /** True when this row stands in for a real person. The dashboard says so out loud. */
  pseudonymous?: boolean;
  handle: string | null;
  display: string;
  firstSeenMs: number;
  lastSeenMs: number | null;
  messageCount: number;
  recall: Recall | null;
}

export interface EventRow {
  id: number;
  memberTelegramId: number;
  type: string;
  content: string;
  tsMs: number;
  routed: boolean;
  routeReason: string;
}

export interface ActionRow {
  id: number;
  eventId: number | null;
  action: string;
  originalAction: string;
  targetHandle: string | null;
  message: string | null;
  reasoning: string;
  confidence: string;
  gated: boolean;
  converted: string | null;
  status: string;
  detail: string;
  overridden: boolean;
  overrideNote: string | null;
  overriddenAtMs: number | null;
  /**
   * Whether an undo APPLIES — deliberately not the plan itself. The API withholds undo plans,
   * posted message ids and chat ids: they are operational coordinates of a live group and the
   * dashboard never needed them to draw a button.
   */
  reversible: boolean;
  tsMs: number;
}

export interface Health {
  ok: boolean;
  group: string;
  paused: boolean;
  budget: { spentToday: number; dailyBudget: number };
  /** 'api-only' means the Telegram bot is not running here, so undo is unavailable. */
  mode?: 'full' | 'api-only';
  /** Timestamp of the newest logged action. In api-only this is when the snapshot stops. */
  dataAsOfMs?: number | null;
  writesEnabled: boolean;
  serverTime: string;
}

export interface Cognition {
  exchangesToday: number;
  callsToday: number;
  estimatedCreditsToday: number | null;
  note: string;
}

/**
 * `no-store` throughout: this renders a live moderation log, and a cached one would show a
 * creator an action they had already reversed.
 */
async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // The connector being down is an expected state, not a crash: the dashboard says so.
    return null;
  }
}

export const getHealth = (): Promise<Health | null> => get<Health>('/api/health');
export const getMembers = (): Promise<{ members: Member[] } | null> => get('/api/members');
export const getMember = (id: number): Promise<{ member: Member; events: EventRow[]; recall: Recall | null } | null> =>
  get(`/api/members/${id}`);
export const getActions = (): Promise<{ actions: ActionRow[] } | null> => get('/api/actions');
export const getUnprompted = (): Promise<{ actions: ActionRow[] } | null> => get('/api/unprompted');
export const getCognition = (): Promise<Cognition | null> => get<Cognition>('/api/cognition');

export const WARMTH_COLOR: Record<Warmth, string> = {
  warm: '#f59e0b',
  steady: '#38bdf8',
  cooling: '#a78bfa',
  at_risk: '#f43f5e',
};

export function hkt(ms: number | null): string {
  if (ms === null) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(ms));
}

export function ago(ms: number | null, nowMs: number): string {
  if (ms === null) return 'never';
  const h = (nowMs - ms) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
