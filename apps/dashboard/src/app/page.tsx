'use client';

/**
 * The dashboard.
 *
 * BUILD_PLAN's accept bar for Phase 6 is that "a stranger can look at the dashboard for 30
 * seconds and explain what Keeper does". So the page opens with the one sentence that matters —
 * the memory is not in here — and leads with the two panels that prove it: what the Mind
 * remembers about a person, and what it did without being asked.
 *
 * Client-rendered on purpose. The connector is usually on localhost, and a server component
 * would try to reach it from Vercel's servers rather than from the creator's machine.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  getActions,
  getCognition,
  getHealth,
  getMembers,
  getUnprompted,
  type ActionRow,
  type Cognition,
  type Health,
  type Member,
} from '@/lib/api';
import { RelationshipGraph } from '@/components/RelationshipGraph';
import { MemberPanel } from '@/components/MemberPanel';
import { ModerationLog } from '@/components/ModerationLog';
import { CognitionWidget, Leaderboard, UnpromptedFeed } from '@/components/Panels';

const TOKEN_KEY = 'keeper.adminToken';

export default function Page() {
  const [members, setMembers] = useState<Member[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [unprompted, setUnprompted] = useState<ActionRow[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [cognition, setCognition] = useState<Cognition | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [token, setToken] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async (): Promise<void> => {
    const [h, m, a, u, c] = await Promise.all([
      getHealth(),
      getMembers(),
      getActions(),
      getUnprompted(),
      getCognition(),
    ]);
    setHealth(h);
    const list = m?.members ?? [];
    setMembers(list);
    // Open on whoever the Mind has the most unfinished business with, rather than on an empty
    // placeholder. BUILD_PLAN's bar for this page is that a stranger understands Keeper in 30
    // seconds, and the memory panel is the part that explains it — leading with "pick someone"
    // spends those seconds on a prompt to click.
    setSelectedId((current) => {
      if (current !== null) return current;
      const best = [...list].sort(
        (a, b) =>
          (b.recall?.openLoops.length ?? 0) - (a.recall?.openLoops.length ?? 0) ||
          (b.lastSeenMs ?? 0) - (a.lastSeenMs ?? 0),
      )[0];
      return best?.telegramId ?? null;
    });
    setActions(a?.actions ?? []);
    setUnprompted(u?.actions ?? []);
    setCognition(c);
    setNowMs(Date.now());
    setLoaded(true);
  }, []);

  useEffect(() => {
    try {
      setToken(window.localStorage.getItem(TOKEN_KEY) ?? '');
    } catch {
      /* private window — the dashboard still reads fine, undo just stays disabled */
    }
    void refresh();
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const saveToken = (value: string): void => {
    setToken(value);
    try {
      if (value === '') window.localStorage.removeItem(TOKEN_KEY);
      else window.localStorage.setItem(TOKEN_KEY, value);
    } catch {
      /* ignore */
    }
  };

  const selected = members.find((m) => m.telegramId === selectedId) ?? null;
  const nominations = actions.filter((a) => a.converted === 'reward_needs_human');
  const down = loaded && health === null;

  return (
    <main className="mx-auto max-w-7xl px-5 py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Keeper <span className="font-normal text-neutral-500">· {health?.group ?? 'Community Steward'}</span>
          </h1>
          <div className="flex items-center gap-3 text-xs">
            {health?.paused === true && (
              <span className="rounded border border-amber-800 bg-amber-950 px-2 py-1 text-amber-400">
                paused by the creator
              </span>
            )}
            {health?.mode === 'api-only' && (
              <span
                className="rounded border border-sky-900 bg-sky-950 px-2 py-1 text-sky-400"
                title="This connector serves the mirror and the API, but is not running the Telegram bot"
              >
                read-only mirror
              </span>
            )}
            <span className={`rounded border px-2 py-1 ${down ? 'border-rose-900 bg-rose-950 text-rose-400' : 'border-emerald-900 bg-emerald-950 text-emerald-400'}`}>
              {down ? 'connector unreachable' : 'connector live'}
            </span>
          </div>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-400">
          Keeper remembers every member as an ongoing relationship &mdash; and that memory lives in
          a <span className="text-neutral-200">Mind</span>, not in this dashboard and not in the
          connector&rsquo;s database. Everything below is read back out of it. Delete the database and
          Keeper still knows everyone.
        </p>
      </header>

      {down && (
        <div className="mb-6 rounded-lg border border-rose-900 bg-rose-950/30 p-4 text-sm text-rose-300">
          Can&rsquo;t reach the connector. Start it with <code className="text-rose-200">pnpm dev:connector</code>{' '}
          &mdash; the dashboard holds no data of its own, which is rather the point.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RelationshipGraph members={members} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="grid gap-5">
          <CognitionWidget cognition={cognition} health={health} />
          <UnpromptedFeed actions={unprompted} nowMs={nowMs} />
        </div>

        <div className="lg:col-span-2">
          <MemberPanel member={selected} nowMs={nowMs} />
        </div>
        <div>
          <Leaderboard members={members} nominations={nominations} />
        </div>

        <div className="lg:col-span-3">
          <ModerationLog
            actions={actions}
            nowMs={nowMs}
            token={health?.mode === 'api-only' ? '' : token}
            readOnlyReason={health?.mode === 'api-only' ? 'This is a read-only mirror — the Telegram bot runs elsewhere, and reversing an action needs the bot that posted it.' : null}
            onUndone={() => void refresh()}
          />
        </div>
      </div>

      <footer className="mt-8 border-t border-neutral-800 pt-4">
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer text-neutral-400">Creator controls</summary>
          <div className="mt-3 max-w-xl">
            <p className="mb-2">
              Reading this dashboard is public. Reversing an action is not: paste the connector&rsquo;s{' '}
              <code className="text-neutral-300">KEEPER_ADMIN_TOKEN</code> to enable the undo buttons.
              It is kept in this browser only and sent per request &mdash; never stored by the dashboard.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => saveToken(e.target.value)}
                placeholder="admin token"
                className="flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-neutral-200 outline-none focus:border-neutral-500"
              />
              <button
                type="button"
                onClick={() => saveToken('')}
                className="rounded border border-neutral-700 px-2 py-1 text-neutral-400 hover:border-neutral-500"
              >
                clear
              </button>
            </div>
            <p className="mt-2">
              {token === ''
                ? 'Undo is disabled. Moderation control stays with the creator — and in Telegram, where /keeper undo also works.'
                : 'Undo enabled for this browser.'}
            </p>
          </div>
        </details>
      </footer>
    </main>
  );
}
