'use client';

/**
 * THE CORRIDOR OF DAYS — the signature.
 *
 * Scroll is time. Every card hangs in Z-space at its real timestamp (`depthOf`), so the 52.3-hour
 * silence between "Yoo" and Lena's return really is ~76% of the corridor. You traverse it.
 *
 * Then the payoff: once the return card is reached, the three older cards fly FORWARD out of the
 * dark and assemble beside Keeper's reply. That is the product's claim rendered literally —
 * memory retrieved across a gap — and it is the page's one choreographed moment. Everything else
 * on this site is deliberately quiet.
 *
 * Performance: one rAF loop, one scroll read, and per-card writes to `transform` and `opacity`
 * only — both compositor properties. Five cards means five style writes a frame, which is
 * nothing, and it buys real per-card fog that a pure-CSS version could not express.
 */
import { useEffect, useRef, useState } from 'react';
import {
  GAP_FROM_DEPTH,
  GAP_HOURS,
  GAP_TO_DEPTH,
  LAST_DEPTH,
  SILENCE_MARKS,
  THREAD,
  depthOf,
  depthOfCard,
} from '../lib/thread';

/** Where along the scroll the recall fires. Just after the return card lands. */
const RECALL_AT = 0.84;

/**
 * The final tableau. Every card gets a pinned position relative to the reading plane, so once the
 * recall fires the whole arrangement HOLDS while the camera keeps travelling — otherwise the
 * reply drifts past the lens and fades out exactly as you start reading it.
 *
 * Left: the three older messages, fanned and receding. Right: the return and what it produced.
 */
interface Seat {
  x: number;
  y: number;
  z: number;
  /** Dropped from the portrait tableau — see TABLEAU_NARROW. */
  hide?: true;
}

const TABLEAU: Record<string, Seat> = {
  c1: { x: -27, y: -19, z: 560 },
  c2: { x: -25, y: -3, z: 430 },
  c3: { x: -23, y: 12, z: 320 },
  c4: { x: 13, y: -19, z: 200 },
  c5: { x: 11, y: 5, z: 40 },
};

/**
 * Portrait is a different composition, not the same one scaled.
 *
 * A phone has no horizontal room to put the retrieved messages BESIDE the reply, so the tableau
 * becomes vertical: the three older messages recede upward as a tight stack, and the return and
 * the reply sit beneath them. Reusing the desktop lanes here collapsed every card onto the same
 * 100px of screen and the whole scene read as a smear.
 */
const TABLEAU_NARROW: Record<string, Seat> = {
  // Two of the three retrieved messages are dropped on a phone. Three stacked cards collided at
  // 375px, and more importantly the point of the tableau is "it remembered the thread" — the
  // open-loop card alone makes that point. Chanel's rule: take one thing off before leaving.
  c1: { x: 0, y: -34, z: 900, hide: true },
  c2: { x: 0, y: -25, z: 620 },
  c3: { x: 0, y: -16, z: 520, hide: true },
  c4: { x: 0, y: -4, z: 230 },
  c5: { x: 0, y: 17, z: 40 },
};

/** Travelling lanes for portrait: barely off-axis, because there is no width to spend. */
const LANE_NARROW: Record<string, { x: number; y: number }> = {
  c1: { x: 0, y: -7 },
  c2: { x: 0, y: 6 },
  c3: { x: 0, y: -4 },
  c4: { x: 0, y: -6 },
  c5: { x: 0, y: 7 },
};
/** Past this the card is behind the lens and gone. Kept shallow so nothing balloons on exit. */
const NEAR = -120;
/** The plane a card is comfortable to read on. Not 0 — at 0 a 30rem card fills the screen. */
const READ = 260;

export function Corridor() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const markRefs = useRef<Map<number, HTMLElement>>(new Map());
  const [reduced, setReduced] = useState(false);
  const [hours, setHours] = useState(0);
  const [recalled, setRecalled] = useState(false);
  const narrow = useRef(false);
  /** Per-card 0→1 blend from travelling position to recalled position. Eased in the loop, not
   *  by CSS: a transition on `transform` cannot coexist with a per-frame transform write — the
   *  value changes before the tween ever lands, and the card simply never moves. */
  const pull = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    if (mq.matches) return;

    const measure = (): void => {
      narrow.current = window.innerWidth < 768;
    };
    measure();
    window.addEventListener('resize', measure);

    let frame = 0;
    const run = (): void => {
      const wrap = wrapRef.current;
      if (wrap !== null) {
        const rect = wrap.getBoundingClientRect();
        const total = wrap.offsetHeight - window.innerHeight;
        const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;

        // The opening frame is deliberate: the camera starts with the FIRST card already at the
        // reading plane, so you land on one real message from one real person and nothing else —
        // no headline, no hero copy. Landing further back reads as a page that failed to load
        // rather than as a page holding its nerve.
        const camera = -READ + p * (LAST_DEPTH + READ + 700);
        const isRecall = p >= RECALL_AT;
        setRecalled(isRecall);

        for (const card of THREAD) {
          const el = cardRefs.current.get(card.id);
          if (el === undefined) continue;

          // On recall the three older cards abandon their true depth and fan out beside the
          // reply — memory arriving from the back of the corridor, which is the whole point.
          const isNarrow = narrow.current;
          const seat = (isNarrow ? TABLEAU_NARROW : TABLEAU)[card.id];
          const k = pull.current.get(card.id) ?? 0;
          // ~0.055/frame ≈ a 1.1s ease at 60fps, and it reverses correctly on scroll-back.
          const blend = k + ((isRecall ? 1 : 0) - k) * 0.055;
          pull.current.set(card.id, Math.abs(blend - (isRecall ? 1 : 0)) < 0.001 ? (isRecall ? 1 : 0) : blend);

          const travelZ = depthOfCard(card.id) - camera;
          const z = travelZ + ((READ + (seat?.z ?? 0)) - travelZ) * blend;

          // Fog, tuned so only ONE card is fully lit at a time. A corridor where four messages
          // are legible at once is a list with perspective on it, not a journey through time.
          let o = 1;
          if (z > 2600) o = 0;
          else if (z > 900) o = 1 - (z - 900) / 1700;
          else if (z < NEAR) o = 0;
          else if (z < READ) o = (z - NEAR) / (READ - NEAR);

          // In the tableau nothing is allowed to fade: it is the one arrangement the page exists
          // to show, and it has to survive the camera continuing past it.
          o = o + (1 - o) * blend;
          // A card dropped from the portrait tableau fades out as the recall takes hold.
          if (isNarrow && seat?.hide === true) o *= 1 - blend;

          const lane = isNarrow ? (LANE_NARROW[card.id] ?? card.lane) : card.lane;
          const travelX = lane.x;
          const travelY = lane.y;
          const x = travelX + ((seat?.x ?? travelX) - travelX) * blend;
          const y = travelY + ((seat?.y ?? travelY) - travelY) * blend;

          // Two things this line has to get right, both of which cost a rebuild to learn:
          //   1. the -50% pair lives INSIDE the transform, because a `transform` written here
          //      replaces the element's Tailwind centring classes rather than composing with them;
          //   2. Z is NEGATED. `z` above is distance-from-camera, but CSS translateZ counts
          //      toward the viewer — positive z is nearer, not further. Unnegated, a card 1220
          //      away rendered 11x oversized and off-screen.
          el.style.transform =
            `translate3d(calc(-50% + ${x}vw), calc(-50% + ${y}vh), ${(-z).toFixed(1)}px)`;
          el.style.opacity = o.toFixed(3);
          el.style.pointerEvents = o > 0.6 ? 'auto' : 'none';
        }

        for (const mark of SILENCE_MARKS) {
          const el = markRefs.current.get(mark.hours);
          if (el === undefined) continue;
          const z = depthOf(mark.ts) - camera;
          let o = 0;
          if (z < 2600 && z > NEAR) o = 0.5 - Math.abs(z - 700) / 4200;
          const mx = narrow.current ? 0 : mark.lane.x;
          const my = narrow.current ? mark.lane.y * 0.5 : mark.lane.y;
          el.style.transform =
            `translate3d(calc(-50% + ${mx}vw), calc(-50% + ${my}vh), ${(-z).toFixed(1)}px)`;
          el.style.opacity = Math.max(0, o).toFixed(3);
        }

        // The counter is DERIVED from where the camera actually is between the last message and
        // the return — not eyeballed against scroll percentage. It reads the real elapsed hours,
        // which is the only reason putting a number that large on screen is defensible.
        const through = (camera - GAP_FROM_DEPTH) / (GAP_TO_DEPTH - GAP_FROM_DEPTH);
        setHours(Math.max(0, Math.min(1, through)) * GAP_HOURS);
      }
      frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Reduced motion: the corridor becomes an ordinary, readable transcript. Same content, no scene.
  if (reduced) {
    return (
      <section className="mx-auto max-w-2xl px-6 py-32" aria-label="The thread">
        <p className="voice-record t-label mb-10 text-mute">
          Lena&rsquo;s thread · 52 hours of silence · nothing lost
        </p>
        <ol className="space-y-8">
          {THREAD.map((c) => (
            <li key={c.id}>
              <p className="voice-record t-label mb-2 text-mute">
                {c.stamp} · {c.who}
              </p>
              <p className={`t-body ${c.kind === 'keeper' ? 'voice-mind text-warm' : 'text-paper'}`}>
                {c.text}
              </p>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <div ref={wrapRef} className="relative h-[620vh]">
      <div className="sticky top-0 h-screen overflow-hidden" style={{ perspective: '1700px' }}>
        {/* The floor wash. A single soft gradient so the far plane reads as distance, not as a
            cut-off. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 70% at 50% 118%, rgba(245,158,11,0.10), transparent 62%)',
          }}
        />

        <div
          className="absolute inset-0"
          style={{ transformStyle: 'preserve-3d' }}
          aria-hidden="true"
        >
          {SILENCE_MARKS.map((m) => (
            <div
              key={m.hours}
              ref={(el) => {
                if (el !== null) markRefs.current.set(m.hours, el);
              }}
              className="absolute left-1/2 top-1/2 opacity-0"
              style={{ transformStyle: 'preserve-3d' }}
            >
              <span className="voice-record whitespace-nowrap text-[0.65rem] tracking-[0.35em] text-mute">
                {m.hours} HOURS
              </span>
            </div>
          ))}

          {THREAD.map((c) => (
            <article
              key={c.id}
              ref={(el) => {
                if (el !== null) cardRefs.current.set(c.id, el);
              }}
              className="absolute left-1/2 top-1/2 w-[min(86vw,30rem)] opacity-0"
              style={{ transformStyle: 'preserve-3d', willChange: 'transform, opacity' }}
            >
              <p className="voice-record t-label mb-3 whitespace-nowrap text-mute">
                {c.stamp}
                <span className="mx-2 text-mute/40">/</span>
                {c.who}
                {c.loop === true && <span className="ml-3 text-warm">open loop</span>}
              </p>
              <p
                className={
                  c.kind === 'keeper'
                    ? 'voice-mind text-warm'
                    : 't-body border-l border-paper/15 pl-5 text-paper/90'
                }
                style={
                  c.kind === 'keeper'
                    ? { fontSize: 'clamp(1.15rem, 1.9vw, 1.8rem)', lineHeight: 1.32 }
                    : undefined
                }
              >
                {c.text}
              </p>
            </article>
          ))}
        </div>

        {/* The silence counter. It is the only thing on screen for most of the traverse, which is
            the point — you are meant to feel the emptiness before you are told it mattered. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6 pb-10 md:px-10">
          <div className="mx-auto flex max-w-[1600px] items-end justify-between">
            <p className="voice-record t-label text-mute">
              {recalled ? 'nothing was lost' : 'silence'}
            </p>
            <p
              className={`voice-mind tabular-nums transition-colors duration-700 ${
                recalled ? 'text-warm' : 'text-paper/45'
              }`}
              style={{ fontSize: 'clamp(2rem, 7vw, 5.5rem)', lineHeight: 0.9 }}
            >
              {hours.toFixed(1)}
              <span className="voice-record t-label ml-3 align-super text-mute">HRS</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
