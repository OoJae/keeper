/**
 * The 110-second demo, beat by beat (BUILD_PLAN.md §10).
 *
 * This file is the run sheet, not the video. Its job is to make the recording session
 * boring: every line that must appear in Telegram is written down in advance, every wait
 * is stated in seconds, and every beat says what it is buying on the rubric.
 *
 * THE ONE FACT THAT SHAPES ALL OF THIS: a Mind exchange measured 23-66 SECONDS against
 * our own key (docs/API-NOTES.md, 2026-08-22 — 23.0s, 24.3s, 31.0s, 36.2s, 55.0s, 65.9s).
 * You cannot shoot this as one continuous 110-second take. Every beat where Keeper
 * answers contains up to a minute of dead air that gets cut in the edit. Plan for a
 * recording session of ~10 real minutes to produce 110 finished seconds, and record each
 * segment separately (§10 production notes say the same thing).
 */
import type { CAST } from './cast.js';

/** Measured, not assumed. docs/API-NOTES.md live-verified 2026-08-22. */
export const MIND_LATENCY_SECONDS = { min: 23, max: 66 } as const;

export type BeatPhase = 'pre' | 'take' | 'post-take';

export interface BeatPost {
  /** Which cast account types this. One account per handle — see cast.ts. */
  readonly as: keyof typeof CAST;
  readonly text: string;
  readonly where: 'group' | 'keeper-dm';
}

export interface BeatExpect {
  /** What Keeper should do, in one line. */
  readonly what: string;
  /** Does this involve a Mind round-trip (23-66s) or is it instant/local? */
  readonly latency: 'mind' | 'instant';
  /** What to do on camera if it does not happen. Never improvise this live. */
  readonly ifItDoesNotHappen: string;
}

export interface Beat {
  readonly id: string;
  readonly phase: BeatPhase;
  /** Position in the finished video, from §10. Empty for pre-roll beats. */
  readonly window: string;
  readonly title: string;
  /** The bold caption on screen (§10). */
  readonly caption: string;
  /** What the human does, in order. */
  readonly cue: string[];
  readonly post?: BeatPost;
  readonly expect?: BeatExpect;
  /** What to have on screen / cut to. */
  readonly screen?: string[];
  readonly notes?: string[];
  readonly optional?: boolean;
}

export const BEATS: readonly Beat[] = [
  // --- before you hit record -------------------------------------------------
  {
    id: 'preflight',
    phase: 'pre',
    window: '',
    title: 'Preflight — check the room before the camera is on',
    caption: '',
    cue: [
      'Connector running (`pnpm dev:connector`) and answering in the group.',
      'Dashboard open in a second window, already scrolled to the relationship graph.',
      "@lena_learns's last message in the group is still her day-2 export question.",
      '@new_kid_kai is NOT in the group yet — the live join is a beat.',
      'Phones/laptops for the cast accounts unlocked and on the group.',
      'Notifications silenced everywhere except the group and Ada\'s DMs.',
    ],
    notes: [
      'The seeder checks the bot side of this for you (admin rights, group reachable).',
      'The rest is physical: it is faster to check now than to reshoot.',
    ],
  },
  {
    id: 'arm-autonomy',
    phase: 'pre',
    window: '',
    title: 'Arm the unprompted beat (do this ~20 minutes before the take)',
    caption: '',
    cue: [
      "In the Steward Mind's own chat, ask it to send the nightly digest at a specific",
      'clock time that falls inside your recording window.',
      'Then close that window and do not touch it again.',
    ],
    notes: [
      'The proactive spike proved the Mind can schedule its own messages: an unprompted',
      'message arrived at the requested time (API-NOTES, 2026-08-22, codeword ALBATROSS).',
      'That is why the 75-95s beat can honestly be captioned "nobody touches anything" —',
      'the scheduling really is the Mind\'s, not a cron job of ours.',
      '',
      'Ask for the time explicitly ("send it at 14:40") rather than a delay ("in 20',
      'minutes"), and give yourself a 10-minute cushion before it fires.',
    ],
  },

  // --- the take --------------------------------------------------------------
  {
    id: 'cold-open',
    phase: 'take',
    window: '0-12s',
    title: 'The problem, on camera',
    caption: 'THE PROBLEM',
    cue: [
      'You, to camera: "My community is my business — and I run it alone, with bots',
      'that don\'t know anyone."',
      'Cut to the stat card: 78% of creators report burnout.',
    ],
    screen: ['Webcam, then the stat card.'],
    notes: ['No Telegram, no Mind. Shoot this last if you are warming up.'],
  },
  {
    id: 'charter',
    phase: 'take',
    window: '12-30s',
    title: 'You talk to Keeper in plain English',
    caption: 'MEET KEEPER — A MIND',
    cue: [
      'Scroll to the charter you really sent on Aug 22 and let the timestamp show.',
      'Voiceover: "It\'s an agent you talk to, and it remembers."',
    ],
    post: {
      as: 'ada_edits',
      where: 'keeper-dm',
      text: "One more thing for the Lab: if someone's been around a while and they're being rude to me specifically, that's usually just how we talk. Read the relationship before you act — and if you're not sure, ask me instead of deleting.",
    },
    expect: {
      what: 'Keeper acknowledges and restates the rule in its own words.',
      latency: 'mind',
      ifItDoesNotHappen: 'Use the scroll-back shot of the real Aug 22 charter instead and cut the live send.',
    },
    notes: [
      'HONESTY: the charter was really taught on Aug 22 (Phase 2). Do not shoot this so it',
      'looks like the Mind is learning its whole job for the first time on camera. Either',
      'scroll to the real one, or — as scripted here — send a genuine amendment live. Both',
      'are true. A re-enactment pretending to be the original is not, and BUILD_PLAN §8',
      'rules it out.',
    ],
  },
  {
    id: 'lena-returns',
    phase: 'take',
    window: '30-55s',
    title: 'The returning member — MEMORY + CONTINUITY',
    caption: 'MEMORY + CONTINUITY',
    cue: [
      'From @lena_learns\'s phone, post her return line into the group.',
      'Do not prompt Keeper. Do not @ it. It has to notice her by itself.',
    ],
    post: {
      as: 'lena_learns',
      where: 'group',
      text: "ok I'm back — sorry, life happened. did anyone ever crack the stuttery export thing? I even reinstalled premiere and it's still doing it",
    },
    expect: {
      what:
        'Keeper greets Lena by name, unprompted, and picks her choppy-export thread back up ' +
        'from where it died on Aug 21 — without her repeating the details.',
      latency: 'mind',
      ifItDoesNotHappen:
        'Do not re-ask in-group on camera. Cut, check the connector log, and re-shoot the ' +
        'beat — a prompted "welcome back" is worthless to the rubric.',
    },
    screen: [
      'Then cut to the dashboard member timeline for @lena_learns:',
      'her join date, her day-2 question, the days of silence, today.',
      'Let the real dates be readable. They are the evidence.',
    ],
    notes: [
      'This is the highest-scoring 25 seconds of the video: it is the only beat that shows',
      'memory ACROSS REAL DAYS. Lena has genuinely not spoken since Aug 21.',
      'Keeper takes up to ~66s to answer. That gap gets cut — but keep rolling through it,',
      'because the unbroken shot of nobody typing is what proves it was unprompted.',
    ],
  },
  {
    id: 'rex-jab',
    phase: 'take',
    window: '55-75s',
    title: 'The borderline jab — CONTEXT, NOT KEYWORDS',
    caption: 'CONTEXT, NOT KEYWORDS',
    cue: [
      'From @rex_hotkeys\'s phone, post the jab about the video Ada posted on Aug 25.',
      'Then, from Ada\'s account, run /keeper why to surface the reasoning.',
    ],
    post: {
      as: 'rex_hotkeys',
      where: 'group',
      text: 'watched the new one. the jump cut at 2:14 is garbage lol what were you thinking',
    },
    expect: {
      what:
        'Keeper does NOT delete or warn. It answers proportionately, and the moderation log ' +
        'shows its reasoning: Rex has been here since day 1, this register is the norm here, ' +
        'and Ada endorsed it on Aug 23.',
      latency: 'mind',
      ifItDoesNotHappen:
        'If Keeper over-reacts, KEEP IT and shoot /keeper undo instead — an honest override ' +
        'shot beats a re-take, and §12 says the override IS the answer to false positives.',
    },
    screen: [
      'Split screen: "what a keyword bot does" (delete + ban on the word "garbage")',
      'versus Keeper\'s call, with the reasoning line from the moderation log enlarged.',
    ],
    notes: [
      'The reason this reads as judgment rather than luck: the Mind watched Rex be rude and',
      'correct on Aug 23 and rude and grateful on Aug 24. Seed days 4 and 5 are what make',
      'this beat land.',
    ],
  },
  {
    id: 'spam-delete',
    phase: 'take',
    window: 'b-roll',
    title: 'Spam, deleted with a reason',
    caption: '',
    optional: true,
    cue: [
      'From @dr0pshipper_99, drop the link. Then leave it alone.',
      'Screen-record the message disappearing and the log entry appearing.',
    ],
    post: {
      as: 'dr0pshipper_99',
      where: 'group',
      text: 'FREE 30-DAY EDITING BOOTCAMP - first 10 people only, DM me or click faceless-cash-pro.top/vip',
    },
    expect: {
      what: 'Keeper deletes it and logs the reasoning + confidence.',
      latency: 'mind',
      ifItDoesNotHappen: 'Delete it by hand after the take. This beat is b-roll; it is not worth a reshoot.',
    },
    notes: [
      'Not in the 110 seconds. It is insurance: if the Rex beat misbehaves, this is the',
      'moderation shot you fall back to, and it is already evidenced from Aug 25.',
    ],
  },
  {
    id: 'hands-off',
    phase: 'take',
    window: '75-95s',
    title: 'Nobody touches anything — ACTS 24/7, UNPROMPTED',
    caption: 'ACTS 24/7, UNPROMPTED',
    cue: [
      'Hands off the keyboard. Literally — show them, palms up, if the shot allows.',
      'What should land, on its own:',
      '  1. Steward nominates @marco_cuts through the Circle,',
      '  2. Rewards Mind issues the reward, receipt posted in-group,',
      '  3. the nightly digest arrives in Ada\'s DMs.',
    ],
    expect: {
      what: 'Three unprompted arrivals, none of them triggered on camera.',
      latency: 'mind',
      ifItDoesNotHappen:
        'Fall back to the digest alone — it is the beat that matters. Then say the reward ' +
        'line over the roadmap card at 95-110s.',
    },
    notes: [
      'DESCOPE PLAN A (BUILD_PLAN §12): if the Circle/wallet chain is not demo-stable, this',
      'beat becomes the digest containing an autonomous reward RECOMMENDATION ("Marco earned',
      'Top Contributor this week — send it?"). The autonomy story is unchanged and there is',
      'one less thing to fail live. As of the Aug 22 wallet spike the Mind reports no wallet',
      'address and no chain, so assume Plan A until a spike says otherwise.',
      '',
      'Marco is nominated from the Mind\'s own relationship memory — four real days of him',
      'answering people. Do not tell it who to pick on camera.',
    ],
  },
  {
    id: 'close',
    phase: 'take',
    window: '95-110s',
    title: 'The close',
    caption: 'KEEPER',
    cue: [
      'Dashboard relationship graph, slow pan.',
      '"Every creator community, run like a relationship — not a rulebook."',
      'Flash card: Bazaar distribution · built solo by a student in 8 days.',
    ],
    screen: ['Relationship graph fills the frame. Do not narrate over the last two seconds.'],
  },

  // --- after ------------------------------------------------------------------
  {
    id: 'evidence',
    phase: 'post-take',
    window: '',
    title: 'Bank the evidence while it is fresh',
    caption: '',
    cue: [
      'Screenshot into docs/EVIDENCE/, with timestamps visible:',
      '  - Lena\'s day-2 question and today\'s resumption, in one scroll if possible',
      '  - the moderation log entry for Rex (reasoning + confidence)',
      '  - the unprompted digest DM, showing its arrival time',
      '  - the relationship graph',
      'Keep the raw uncut take. §10 asks for it, and it has saved every demo ever made.',
    ],
  },
];

export function beatById(id: string): Beat | undefined {
  return BEATS.find((b) => b.id === id);
}

/**
 * Rough wall-clock cost of a live run: operator time per beat plus the measured worst
 * case for every Mind round-trip. Printed by --dry-run so nobody starts a take twelve
 * minutes before they have to leave.
 */
export function estimateRunSeconds(beats: readonly Beat[]): number {
  return beats.reduce((total, beat) => {
    const operator = 20;
    const mind = beat.expect?.latency === 'mind' ? MIND_LATENCY_SECONDS.max : 0;
    return total + operator + mind;
  }, 0);
}
