'use client';

/**
 * The moderation log (BUILD_PLAN Phase 6 + §3.2).
 *
 * Every row shows the Mind's own `reasoning` string. There is no classifier in this project to
 * attribute it to, which is the point: the judgment is the Mind's and the log proves it.
 *
 * Three columns a normal bot log does not have:
 *   - `gated`     — low confidence, so Keeper flagged the creator instead of acting
 *   - `converted` — what the connector REFUSED to do, and the rule that refused it
 *   - `overridden`— what the human reversed, and when
 *
 * Undo is a real write. It is the only one, and it needs the creator's token: a public URL that
 * can moderate a live Telegram group would not be acceptable. Without a token the buttons are
 * visibly disabled rather than hidden, so a judge can see the control exists and see that it is
 * not theirs to press.
 */
import { useState } from 'react';

import { ago, hkt, type ActionRow } from '@/lib/api';

const BADGE: Record<string, string> = {
  executed: 'bg-emerald-950 text-emerald-400 border-emerald-900',
  failed: 'bg-rose-950 text-rose-400 border-rose-900',
  skipped: 'bg-neutral-900 text-neutral-500 border-neutral-800',
};

export function ModerationLog({
  actions,
  nowMs,
  token,
  readOnlyReason = null,
  onUndone,
}: {
  actions: ActionRow[];
  nowMs: number;
  token: string;
  /** Set when undo is impossible here regardless of token — explained rather than just greyed. */
  readOnlyReason?: string | null;
  onUndone: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<{ id: number; text: string; ok: boolean } | null>(null);
  // The log is the evidence, so none of it is thrown away — but twenty rows of full reasoning
  // buries every other panel, and the page has 30 seconds to explain itself.
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? actions : actions.slice(0, 6);

  const undo = async (id: number): Promise<void> => {
    setBusy(id);
    setNote(null);
    try {
      const res = await fetch(`/api/undo/${id}`, {
        method: 'POST',
        headers: { 'X-Keeper-Admin-Token': token },
      });
      const body = await res.json().catch(() => ({}));
      setNote({
        id,
        ok: res.ok,
        text: res.ok ? (body.detail ?? 'reversed') : (body.detail ?? body.error ?? `HTTP ${res.status}`),
      });
      if (res.ok) onUndone();
    } catch (e) {
      setNote({ id, ok: false, text: e instanceof Error ? e.message : 'request failed' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
          Moderation log
        </h2>
        <p className="text-xs text-neutral-500">
          every row carries the Mind&rsquo;s own reasoning
        </p>
      </div>
      {readOnlyReason !== null && (
        <div className="mb-3 rounded border border-sky-900/60 bg-sky-950/20 p-2 text-xs text-sky-300">
          {readOnlyReason}
        </div>
      )}

      <ol className="space-y-3">
        {actions.length === 0 && <li className="text-sm text-neutral-600">Nothing logged yet.</li>}
        {visible.map((a) => {
          const reversible = a.undo !== null && a.undo !== undefined && a.status === 'executed' && !a.overridden;
          return (
            <li key={a.id} className="rounded border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-neutral-600">#{a.id}</span>
                <span className="font-semibold text-neutral-100">{a.action}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[11px] ${BADGE[a.status] ?? BADGE.skipped}`}>
                  {a.status}
                </span>
                <span className="text-[11px] text-neutral-500">confidence: {a.confidence}</span>
                {a.eventId === null && (
                  <span
                    className="rounded border border-amber-900 bg-amber-950 px-1.5 py-0.5 text-[11px] text-amber-400"
                    title="No message triggered this — Keeper acted on its own"
                  >
                    unprompted
                  </span>
                )}
                {a.gated && (
                  <span className="rounded border border-sky-900 bg-sky-950 px-1.5 py-0.5 text-[11px] text-sky-400">
                    gated: low confidence
                  </span>
                )}
                {a.overridden && (
                  <span className="rounded border border-fuchsia-900 bg-fuchsia-950 px-1.5 py-0.5 text-[11px] text-fuchsia-400">
                    reversed by creator
                  </span>
                )}
                <span className="ml-auto text-[11px] text-neutral-600">
                  {hkt(a.tsMs)} · {ago(a.tsMs, nowMs)}
                </span>
              </div>

              {a.reasoning !== '' && (
                <blockquote className="reasoning mt-2 border-l-2 border-neutral-700 pl-3 text-sm text-neutral-300">
                  {a.reasoning}
                </blockquote>
              )}

              {a.converted !== null && (
                <p className="mt-2 text-xs text-amber-500">
                  Keeper would not do this as asked: the Mind requested{' '}
                  <span className="font-semibold">{a.originalAction}</span>, rewritten by rule{' '}
                  <code>{a.converted}</code>.
                </p>
              )}

              {a.overridden && (
                <p className="mt-2 text-xs text-fuchsia-400">
                  {a.overrideNote} — {hkt(a.overriddenAtMs)}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-xs text-neutral-500">{a.detail}</p>
                {reversible && (
                  <button
                    type="button"
                    disabled={token === '' || busy === a.id}
                    onClick={() => void undo(a.id)}
                    title={
                      readOnlyReason ??
                      (token === ''
                        ? 'Undo needs the creator token — moderation control is not public'
                        : 'Reverse this action in Telegram')
                    }
                    className="ml-auto rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition hover:border-neutral-500 hover:text-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:text-neutral-600"
                  >
                    {busy === a.id
                      ? 'undoing…'
                      : readOnlyReason !== null
                        ? 'undo (not here)'
                        : token === ''
                          ? 'undo (creator only)'
                          : 'undo'}
                  </button>
                )}
              </div>

              {note !== null && note.id === a.id && (
                <p className={`mt-2 text-xs ${note.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{note.text}</p>
              )}
            </li>
          );
        })}
      </ol>

      {actions.length > 6 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full rounded border border-neutral-800 py-2 text-xs text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200"
        >
          {showAll ? 'Show fewer' : `Show all ${actions.length} logged actions`}
        </button>
      )}
    </div>
  );
}
