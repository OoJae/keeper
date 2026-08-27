'use client';

/**
 * The member timeline (BUILD_PLAN Phase 6): "their whole relationship history AS KEEPER
 * REMEMBERS IT — pull the Mind's own summary of that member and display it."
 *
 * So the Mind's words come first and are quoted, not paraphrased, with the moment they were
 * captured. The mirror's event list sits underneath as corroboration. If the two ever disagree,
 * the Mind is the source of truth and the mirror is the copy — that is the whole architecture,
 * and this panel is where a judge can see it.
 */
import { useEffect, useState } from 'react';

import { API_BASE, WARMTH_COLOR, ago, hkt, type EventRow, type Member, type Recall } from '@/lib/api';

export function MemberPanel({ member, nowMs }: { member: Member | null; nowMs: number }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [recall, setRecall] = useState<Recall | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (member === null) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${API_BASE}/api/members/${member.telegramId}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || d === null) return;
        setEvents(d.events ?? []);
        setRecall(d.recall ?? null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [member]);

  if (member === null) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/40 p-8 text-center text-sm text-neutral-500">
        Pick someone in the graph to see what Keeper remembers about them.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-100">
          {member.handle === null ? member.display : `@${member.handle}`}
        </h2>
        {recall !== null && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-medium text-neutral-950"
            style={{ background: WARMTH_COLOR[recall.warmth] }}
          >
            {recall.warmth.replace('_', ' ')}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-neutral-500">
        first seen {hkt(member.firstSeenMs)} · last spoke {ago(member.lastSeenMs, nowMs)} ·{' '}
        {member.messageCount} messages
      </p>

      {recall === null ? (
        <p className="mt-4 rounded border border-neutral-800 bg-neutral-950/60 p-3 text-sm text-neutral-500">
          No cached recollection yet. Run <code className="text-neutral-300">pnpm dashboard:recall</code> — it
          asks the Mind directly, and takes 25&ndash;200s per member.
        </p>
      ) : (
        <>
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              What the Mind remembers
            </h3>
            <blockquote className="reasoning mt-2 border-l-2 border-neutral-700 pl-3 text-sm leading-relaxed text-neutral-200">
              {recall.summary}
            </blockquote>
            <p className="mt-2 text-xs text-neutral-500">
              In the Mind&rsquo;s own words, captured {hkt(Date.parse(recall.capturedAt))} HKT. Not stored in
              this dashboard, and not in the connector&rsquo;s database.
            </p>
          </section>

          {recall.openLoops.length > 0 && (
            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Still open ({recall.openLoops.length})
              </h3>
              <ul className="mt-2 space-y-1.5">
                {recall.openLoops.map((loop, i) => (
                  <li key={i} className="reasoning flex gap-2 text-sm text-neutral-300">
                    <span className="text-amber-500">&#9679;</span>
                    <span>{loop}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-neutral-500">
                Nothing computes these. There is no open-loops table &mdash; the Mind tracks them.
              </p>
            </section>
          )}

          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Warmth</h3>
            <p className="reasoning mt-1 text-sm text-neutral-300">{recall.warmthReason}</p>
          </section>
        </>
      )}

      <section className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Mirrored activity {loading && <span className="text-neutral-600">loading…</span>}
        </h3>
        <ol className="mt-2 space-y-2">
          {events.length === 0 && !loading && (
            <li className="text-sm text-neutral-600">No mirrored events.</li>
          )}
          {events.slice(-12).reverse().map((e) => (
            <li key={e.id} className="border-l border-neutral-800 pl-3">
              <p className="text-xs text-neutral-500">
                {hkt(e.tsMs)} · {e.type}
                {e.routed && (
                  <span className="ml-1 text-sky-500" title={`routed to the Mind: ${e.routeReason}`}>
                    → Mind ({e.routeReason})
                  </span>
                )}
              </p>
              <p className="reasoning text-sm text-neutral-300">{e.content.slice(0, 240)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
