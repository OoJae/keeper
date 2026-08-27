'use client';

/**
 * The relationship graph, in 3D — Keeper's own artifact, rendered the way it thinks about people.
 *
 * Node SIZE is contribution: a message count, mechanical, ours to compute. Node COLOUR is warmth,
 * which is the Mind's read on the relationship and is asked for in its own words. Deriving the
 * colour from the count would put a relationship judgment in our code, and it would also be
 * wrong: Marco and Rex have identical message counts, and the Mind called Rex's two-day silence
 * "normal pacing, not drift" while flagging Marco's as a thread it still owes him.
 *
 * This lives HERE and not on the landing page on purpose — one 3D idea per site, and the corridor
 * is that idea. This one is evidence, sized accordingly.
 */
import { useEffect, useRef, useState } from 'react';

const WARMTH = {
  warm: '#F59E0B',
  steady: '#38BDF8',
  cooling: '#A78BFA',
} as const;

/**
 * Angles are spread evenly round the orbit; the `y` values are spread deliberately WIDE, because
 * two nodes at different angles can still project onto adjacent pixels and their labels collide.
 * `member_bidh7` is the pseudonym the product's own public API gives the one real account in the
 * group — their identity is not ours to publish, here or anywhere else.
 */
const NODES = [
  { id: 'marco_cuts', msgs: 9, warmth: 'steady', a: 0.15, r: 1, y: -0.9 },
  { id: 'lena_learns', msgs: 4, warmth: 'warm', a: 1.25, r: 0.95, y: 0.45 },
  { id: 'rex_hotkeys', msgs: 9, warmth: 'steady', a: 2.3, r: 1.02, y: -0.25 },
  { id: 'ada_edits', msgs: 7, warmth: 'steady', a: 3.4, r: 0.88, y: 0.95 },
  { id: 'dr0pshipper_99', msgs: 3, warmth: 'cooling', a: 4.5, r: 1.06, y: -0.6 },
  { id: 'member_bidh7', msgs: 0, warmth: 'steady', a: 5.6, r: 0.82, y: 0.15 },
] as const;

export function Constellation() {
  const ref = useRef<HTMLDivElement>(null);
  const [spin, setSpin] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    if (mq.matches) return;
    let frame = 0;
    const run = (): void => {
      const el = ref.current;
      if (el !== null) {
        const r = el.getBoundingClientRect();
        // Scroll-linked rotation, bounded: the graph turns about a third of a revolution as it
        // crosses the viewport. Enough to read as dimensional, not enough to become a spinner.
        const p = 1 - (r.top + r.height) / (window.innerHeight + r.height);
        setSpin(Math.max(0, Math.min(1, p)) * 2.1);
      }
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  }, []);

  const R = 210;
  return (
    <div ref={ref} className="relative">
      <p className="voice-record t-label mb-6 text-mute">
        relationship graph · size = messages counted · colour ={' '}
        <span className="text-paper">the Mind&rsquo;s judgment</span>
      </p>
      <div
        className="relative mx-auto h-[460px] w-full max-w-3xl md:h-[520px]"
        style={{ perspective: '1000px' }}
      >
        <div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }}>
          {NODES.map((n) => {
            const angle = n.a + (reduced ? 0 : spin);
            const x = Math.cos(angle) * R * n.r;
            const z = Math.sin(angle) * R * n.r;
            const y = n.y * 140;
            const size = 16 + Math.sqrt(n.msgs) * 9;
            // Far side of the orbit sits back and dims, which is what makes it read as a sphere
            // rather than as a ring of dots.
            const depth = (z + R) / (2 * R);
            return (
              <div
                key={n.id}
                className="absolute left-1/2 top-1/2"
                style={{
                  transform: `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), ${z}px)`,
                  opacity: 0.4 + depth * 0.6,
                }}
              >
                <span
                  className="block rounded-full"
                  style={{
                    width: size,
                    height: size,
                    background: WARMTH[n.warmth],
                    boxShadow: `0 0 ${18 + depth * 26}px ${WARMTH[n.warmth]}40`,
                  }}
                />
                <span className="voice-record mt-2 block whitespace-nowrap text-[0.6rem] tracking-[0.12em] text-mute">
                  {n.id}
                </span>
              </div>
            );
          })}
          <div
            className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border border-paper/25"
            aria-hidden="true"
          />
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap justify-center gap-5">
        {(Object.keys(WARMTH) as (keyof typeof WARMTH)[]).map((w) => (
          <li key={w} className="voice-record t-label flex items-center gap-2 text-mute">
            <span className="h-2 w-2 rounded-full" style={{ background: WARMTH[w] }} />
            {w}
          </li>
        ))}
      </ul>
    </div>
  );
}
