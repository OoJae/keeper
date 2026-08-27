/**
 * The dashboard API (BUILD_PLAN §5 Phase 6).
 *
 * `node:http` and a hand-written route table rather than a framework: there are seven routes,
 * and this repository has no HTTP dependency today. Adding one to serve seven routes would be
 * the largest dependency in the connector.
 *
 * Read routes are PUBLIC on purpose — a judge has to be able to look at the moderation log and
 * the unprompted feed without a credential. Exactly one route mutates (undo), and it is the
 * only one behind a shared secret.
 *
 * Nothing here re-implements behaviour. The mirror is the only data source, and the undo path
 * is `undoActionById`, shared with `/keeper undo` so the override bookkeeping cannot drift
 * between the two surfaces.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';

import type { ConnectorConfig } from '../config.js';
import type { Mirror } from '../db/mirror.js';
import { log } from '../log.js';
import { undoActionById } from '../pipeline/executor.js';
import { dayWindow } from '../pipeline/prefilter.js';
import type { TelegramSurface } from '../telegram/surface.js';

export interface ApiDeps {
  readonly config: ConnectorConfig;
  readonly mirror: Mirror;
  readonly surface: TelegramSurface;
  /** Absolute path to var/minds-calls.jsonl, for the Cognition widget. */
  readonly callLogPath: string;
  readonly now?: () => number;
}

interface Json {
  status: number;
  body: unknown;
}

const NOT_FOUND: Json = { status: 404, body: { error: 'not_found' } };

/**
 * The Cognition widget's numbers.
 *
 * Counts `sendAndAwaitReply` lines for today only. Per docs/API-NOTES.md the per-exchange cost
 * is ~0.8-0.9 credits and the credits endpoint's shape is undocumented, so this reports what we
 * can actually count — exchanges — and leaves the pricing to the note beside it rather than
 * inventing a total.
 */
function cognitionToday(callLogPath: string, nowMs: number): {
  exchangesToday: number;
  callsToday: number;
  estimatedCreditsToday: number | null;
  note: string;
} {
  try {
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const lines = readFileSync(callLogPath, 'utf8').split('\n');
    let exchanges = 0;
    let calls = 0;
    for (const line of lines) {
      if (!line.startsWith(`{"ts":"${today}`)) continue;
      calls += 1;
      if (line.includes('"op":"sendAndAwaitReply"')) exchanges += 1;
    }
    return {
      exchangesToday: exchanges,
      callsToday: calls,
      estimatedCreditsToday: Number((exchanges * 0.85).toFixed(2)),
      note: '~0.85 credits per exchange (measured, docs/API-NOTES.md). An estimate, not billing.',
    };
  } catch {
    return {
      exchangesToday: 0,
      callsToday: 0,
      estimatedCreditsToday: null,
      note: 'var/minds-calls.jsonl not readable',
    };
  }
}

/** The Mind's cached recollections, written by `pnpm dashboard:recall`. Absent is normal. */
function readRecall(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed === null || typeof parsed !== 'object') return {};
    const members = (parsed as { members?: unknown }).members;
    return members !== null && typeof members === 'object' ? (members as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createApi(deps: ApiDeps): {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  listen: () => Server | null;
} {
  const now = deps.now ?? Date.now;
  const recallPath = deps.callLogPath.replace(/minds-calls\.jsonl$/, 'member-recall.json');

  const route = async (method: string, path: string, req: IncomingMessage): Promise<Json> => {
    // --- reads (public) ---
    if (method === 'GET' && path === '/api/health') {
      const { fromMs, toMs } = dayWindow(now(), deps.config.utcOffsetMinutes);
      return {
        status: 200,
        body: {
          ok: true,
          group: deps.config.groupName,
          paused: deps.mirror.isPaused(),
          budget: {
            spentToday: deps.mirror.routedCountBetween(fromMs, toMs),
            dailyBudget: deps.config.dailyMindBudget,
          },
          writesEnabled: deps.config.apiAdminToken !== '',
          serverTime: new Date(now()).toISOString(),
        },
      };
    }

    if (method === 'GET' && path === '/api/members') {
      const recall = readRecall(recallPath);
      const members = deps.mirror.listMembers().map((m) => ({
        ...m,
        recall: recall[String(m.telegramId)] ?? null,
      }));
      return { status: 200, body: { members, aliases: deps.mirror.listAliases() } };
    }

    const memberMatch = /^\/api\/members\/(-?\d+)$/.exec(path);
    if (method === 'GET' && memberMatch !== null) {
      const id = Number(memberMatch[1]);
      const member = deps.mirror.getMember(id);
      if (member === undefined) return NOT_FOUND;
      const recall = readRecall(recallPath);
      return {
        status: 200,
        body: {
          member,
          events: deps.mirror.listEventsForMember(id),
          // The panel BUILD_PLAN cares about most: the Mind's own words about this person.
          recall: recall[String(id)] ?? null,
        },
      };
    }

    if (method === 'GET' && path === '/api/actions') {
      return { status: 200, body: { actions: deps.mirror.listActions(200) } };
    }

    if (method === 'GET' && path === '/api/unprompted') {
      // event_id IS NULL means nothing in the group triggered it. That is the autonomy claim,
      // and it is a property of the data rather than a label we attach.
      const actions = deps.mirror.listActions(200).filter((a) => a.eventId === null);
      return { status: 200, body: { actions } };
    }

    if (method === 'GET' && path === '/api/events') {
      return { status: 200, body: { events: deps.mirror.listEvents(200) } };
    }

    if (method === 'GET' && path === '/api/cognition') {
      return { status: 200, body: cognitionToday(deps.callLogPath, now()) };
    }

    // --- the one write ---
    const undoMatch = /^\/api\/actions\/(\d+)\/undo$/.exec(path);
    if (method === 'POST' && undoMatch !== null) {
      if (deps.config.apiAdminToken === '') {
        return {
          status: 503,
          body: { error: 'writes_disabled', detail: 'KEEPER_ADMIN_TOKEN is not set on the connector' },
        };
      }
      const presented = req.headers['x-keeper-admin-token'];
      if (presented !== deps.config.apiAdminToken) {
        log.warn('api_undo_unauthorized', { path });
        return { status: 401, body: { error: 'unauthorized' } };
      }

      const id = Number(undoMatch[1]);
      const result = await undoActionById(
        { surface: deps.surface, mirror: deps.mirror },
        id,
        now(),
      );
      log.info('api_undo', { actionId: id, ok: result.ok, detail: result.detail });
      return result.ok
        ? { status: 200, body: { ok: true, actionId: id, detail: result.detail } }
        : {
            status: result.reason === 'not_found' ? 404 : 409,
            body: { ok: false, reason: result.reason, detail: result.detail },
          };
    }

    return NOT_FOUND;
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const origin = deps.config.dashboardOrigin;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Keeper-Admin-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const path = (req.url ?? '/').split('?')[0] ?? '/';
    try {
      const { status, body } = await route(req.method ?? 'GET', path, req);
      const payload = JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(payload);
    } catch (error) {
      // A dashboard request must never take the connector down with it — the bot is the
      // product, this is a window onto it.
      log.error('api_request_failed', {
        path,
        detail: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'internal' }));
    }
  };

  const listen = (): Server | null => {
    if (deps.config.apiPort === 0) {
      log.info('api_disabled', { reason: 'KEEPER_API_PORT=0' });
      return null;
    }
    const server = createServer((req, res) => {
      void handle(req, res);
    });
    server.listen(deps.config.apiPort, () => {
      log.info('api_started', {
        port: deps.config.apiPort,
        origin: deps.config.dashboardOrigin,
        writesEnabled: deps.config.apiAdminToken !== '',
      });
    });
    return server;
  };

  return { handle, listen };
}
