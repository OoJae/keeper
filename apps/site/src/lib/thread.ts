/**
 * Lena's thread, verbatim from the mirror (`var/keeper.db`, events + actions).
 *
 * The timestamps are Telegram's own and every string is exactly what was sent. This matters
 * structurally, not just editorially: the corridor maps `ts` straight onto depth, so the silence
 * you scroll through is 52.3 real hours to scale. Rounding it prettier would make the one thing
 * the page is arguing about into a decoration.
 */
export interface Card {
  id: string;
  who: string;
  /** Display name as it appears in the group. */
  name: string;
  ts: number;
  /** Rendered in the machine voice beside the card. */
  stamp: string;
  text: string;
  /** Keeper's own messages are set in the Mind's voice and carry the accent. */
  kind: 'member' | 'keeper';
  /** Marks the message that opened the loop everything else hangs off. */
  loop?: boolean;
  /** The untruncated message, where one exists. */
  full?: string;
  /** Lane, in vw/vh from centre. Cards alternate sides so a card and the one behind it never
   *  stack on the same axis — without this the corridor reads as one smudged column. */
  lane: { x: number; y: number };
}

export const THREAD: Card[] = [
  {
    id: 'c1',
    lane: { x: -9, y: -5 },
    who: '@lena_learns',
    name: 'Lena',
    ts: 1787600135347,
    stamp: '25 AUG · 03:35',
    kind: 'member',
    text: "hi! total beginner here, just switched from CapCut to Premiere and I'm a bit lost tbh",
  },
  {
    id: 'c2',
    lane: { x: 9, y: 5 },
    who: '@lena_learns',
    name: 'Lena',
    ts: 1787600284989,
    stamp: '25 AUG · 03:38',
    kind: 'member',
    loop: true,
    text: 'ok so my exports are coming out choppy?? like the timeline plays fine but the mp4 stutters. 1080p60, h264. any ideas',
  },
  {
    id: 'c3',
    lane: { x: -11, y: 3 },
    who: '@lena_learns',
    name: 'Lena',
    ts: 1787659624000,
    stamp: '25 AUG · 20:07',
    kind: 'member',
    text: 'Yoo',
  },
  {
    id: 'c4',
    lane: { x: -7, y: -4 },
    who: '@lena_learns',
    name: 'Lena',
    ts: 1787847977000,
    stamp: '28 AUG · 00:26',
    kind: 'member',
    text: 'hey sorry i vanished, school got mad 😅 anyway im back — still getting that stutter',
  },
  {
    id: 'c5',
    lane: { x: 8, y: 6 },
    who: 'Keeper',
    name: 'Keeper',
    ts: 1787848060194,
    stamp: '28 AUG · 00:27',
    kind: 'keeper',
    // Truncated, not paraphrased. The corridor needs the beat; the full reply lives on /proof,
    // and an ellipsis is the honest way to say "there is more of this".
    text: "hey Lena — welcome back. school eats weeks, that's normal, no apology needed. last place we left the stutter thread: I had walked you through setting up proxies in Premiere…",
    full: "hey Lena — welcome back. school eats weeks, that's normal, no apology needed. last place we left the stutter thread: I had walked you through setting up proxies in Premiere (Project Settings → Ingest Settings → Create Proxies on Import), which gives the timeline lightweight copies to scrub through instead of the full 1080p60 originals. that alone usually kills the export stutter. two open questions that never got closed: did you ever get a chance to try the proxy setup, and what's the machine look like — specifically how much RAM, and whether it has a discrete graphics card or just integrated graphics.",
  },
];

/** "Yoo" → the return. The number the whole page is about. */
export const GAP_MS = 1787847977000 - 1787659624000;
export const GAP_HOURS = GAP_MS / 3_600_000; // 52.32

export const SPAN_START = THREAD[0]!.ts;
export const SPAN_END = THREAD[THREAD.length - 1]!.ts;

/** Depth in px. Time maps onto Z, so the gap really does dominate the corridor. */
export const CORRIDOR_DEPTH = 11000;

/** No two cards closer than this, or a message read at speed lands on top of its neighbour. */
const MIN_SEPARATION = 1250;

/**
 * Time → depth, with one honest compromise.
 *
 * A pure linear map is truthful about the 52-hour gap and useless about everything else: Lena's
 * first two messages are 149 seconds apart, which puts them on the same plane, overlapping and
 * unreadable. So consecutive cards are pushed apart to a legibility floor, and the remaining
 * depth is distributed by real elapsed time.
 *
 * The gap keeps ~70% of the corridor either way, so the thing the page is arguing about is still
 * to scale. What is lost is the visual claim that 149 seconds is nothing — which the timestamps
 * printed on every card already tell you far more precisely than distance could.
 */
const LAYOUT: number[] = (() => {
  const span = SPAN_END - SPAN_START;
  const raw = THREAD.map((c) => ((c.ts - SPAN_START) / span) * CORRIDOR_DEPTH);
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const want = raw[i] ?? 0;
    const floor = i === 0 ? 0 : (out[i - 1] ?? 0) + MIN_SEPARATION;
    out.push(Math.max(want, floor));
  }
  return out;
})();

const INDEX = new Map(THREAD.map((c, i) => [c.id, i]));

export function depthOfCard(id: string): number {
  return LAYOUT[INDEX.get(id) ?? 0] ?? 0;
}

/** Markers keep the pure time map — they hang in the void, with nothing to collide with. */
export function depthOf(ts: number): number {
  return ((ts - SPAN_START) / (SPAN_END - SPAN_START)) * CORRIDOR_DEPTH;
}

/** The two depths the silence spans. The counter is derived from these, not guessed, so the
 *  number on screen is the real elapsed time at the camera's position. */
export const GAP_FROM_DEPTH = depthOfCard('c3');
export const GAP_TO_DEPTH = depthOfCard('c4');

/** The far plane the camera must travel past. */
export const LAST_DEPTH = LAYOUT[LAYOUT.length - 1] ?? CORRIDOR_DEPTH;

/**
 * Markers hung in the empty stretch so the traverse has rhythm rather than reading as a bug.
 * Each is a real elapsed count from the moment Lena went quiet.
 */
export const SILENCE_MARKS = [6, 12, 24, 36, 48].map((h, i) => ({
  hours: h,
  ts: 1787659624000 + h * 3_600_000,
  // Staggered off-axis, or consecutive markers land on the same pixel and read as one smeared
  // label rather than as distance passing.
  lane: { x: i % 2 === 0 ? -13 : 14, y: -8 + ((i * 7) % 19) },
}));
