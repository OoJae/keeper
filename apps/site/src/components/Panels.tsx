'use client';

/**
 * The three smaller panels. Grouped in one file because each is a handful of presentational
 * lines over data the connector already shaped — splitting them would be four files of imports.
 */
import { ago, hkt, type ActionRow, type Cognition, type Health, type Member } from '../lib/dashboard-api';

/**
 * The autonomy claim, made visually.
 *
 * `event_id IS NULL` means no message in the group triggered this — Keeper decided on its own
 * that something was worth doing. That is a property of the data, not a label we attach, which
 * is why the filter lives in the API and not in a hand-maintained list.
 */
export function UnpromptedFeed({ actions, nowMs }: { actions: ActionRow[]; nowMs: number }) {
  return (
    <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 p-4">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-500">
          Acted without being asked
        </h2>
        <span className="text-xs text-neutral-500">{actions.length} times</span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        Nothing in the group triggered these. Keeper decided they were worth doing.
      </p>
      <ol className="space-y-2">
        {actions.length === 0 && <li className="text-sm text-neutral-600">Nothing yet.</li>}
        {actions.slice(0, 10).map((a) => (
          <li key={a.id} className="border-l-2 border-amber-800/60 pl-3">
            <p className="text-xs text-neutral-500">
              {hkt(a.tsMs)} · {ago(a.tsMs, nowMs)} · <span className="text-amber-500">{a.action}</span>
            </p>
            <p className="reasoning text-sm text-neutral-300">{a.reasoning.slice(0, 220)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Leaderboard and rewards.
 *
 * Rewards are NOMINATIONS, and this panel says so without hedging. Every value-moving tool on
 * the platform is behind a billing gate two purchases did not lift (docs/API-NOTES.md), so no
 * transaction exists — and a dashboard that implied one would be the dishonest part of an
 * otherwise honest project.
 */
export function Leaderboard({ members, nominations }: { members: Member[]; nominations: ActionRow[] }) {
  const ranked = [...members].sort((a, b) => b.messageCount - a.messageCount).slice(0, 6);
  const top = ranked[0]?.messageCount ?? 1;

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
        Contributors
      </h2>
      <ol className="space-y-2">
        {ranked.map((m) => (
          <li key={m.telegramId} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-neutral-300">
              {m.handle === null ? m.display : `@${m.handle}`}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded bg-neutral-800">
              <span
                className="block h-full rounded bg-sky-600"
                style={{ width: `${Math.max(4, (m.messageCount / Math.max(1, top)) * 100)}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-xs text-neutral-500">{m.messageCount}</span>
          </li>
        ))}
      </ol>

      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Reward nominations
      </h3>
      {nominations.length === 0 ? (
        <p className="text-sm text-neutral-600">
          None yet. When the Mind nominates someone, it picks them from its own relationship
          memory and says why &mdash; the creator approves before anything is sent.
        </p>
      ) : (
        <ul className="space-y-2">
          {nominations.map((n) => (
            <li key={n.id} className="rounded border border-neutral-800 bg-neutral-950/50 p-2">
              <p className="reasoning text-sm text-neutral-300">{n.message ?? n.reasoning}</p>
              <p className="mt-1 text-xs text-neutral-500">{hkt(n.tsMs)} · awaiting the creator</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-neutral-800 pt-2 text-xs text-neutral-500">
        Rewards are recommendations. The on-chain payout is blocked by a platform billing gate we
        cannot open from the API, so no transaction is claimed here or anywhere else.
      </p>
    </div>
  );
}

/**
 * Cognition spend — BUILD_PLAN §7 asks the dashboard to show we engineered for the platform's
 * economics.
 *
 * Two numbers that are NOT the same thing, and an earlier draft of this panel stacked them as
 * if they were: the call log counts every exchange this machine had with the Mind (including
 * build tooling like `dashboard:recall`), while the budget counts only community events the
 * pre-filter chose to route. Showing "9 exchanges" above "1 of 40" reads as a contradiction
 * unless each says what it measures.
 */
export function CognitionWidget({
  cognition,
  health,
}: {
  cognition: Cognition | null;
  health: Health | null;
}) {
  const routed = health?.budget.spentToday ?? 0;
  const cap = health?.budget.dailyBudget ?? 40;
  const pct = Math.min(100, (routed / Math.max(1, cap)) * 100);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400">
        Cognition today
      </h2>

      <p className="text-3xl font-semibold text-neutral-100">
        {routed}
        <span className="text-lg font-normal text-neutral-500">/{cap}</span>
        <span className="ml-2 text-base font-normal text-neutral-500">community exchanges</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded bg-neutral-800">
        <div className="h-full rounded bg-emerald-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Events the pre-filter judged worth the Mind&rsquo;s attention. Everything else was mirrored
        locally and cost nothing.
      </p>

      {/*
        The per-call log is written by whichever machine talks to the Mind, so a deployment that
        only serves the mirror genuinely has no total to report. Saying nothing is better than
        printing "0 exchanges" beside a note explaining the 0 is not real — the routed count
        above is measured either way.
      */}
      {cognition !== null && cognition.estimatedCreditsToday !== null && (
        <div className="mt-3 border-t border-neutral-800 pt-2 text-xs text-neutral-500">
          <p>
            <span className="text-neutral-300">{cognition.exchangesToday}</span> total exchanges with
            the Mind today, including build tooling &mdash; ≈ {cognition.estimatedCreditsToday}{' '}
            credits.
          </p>
          <p className="mt-1">{cognition.note}</p>
        </div>
      )}
    </div>
  );
}
