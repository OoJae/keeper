/**
 * The demo community: "Ada's Editing Lab" — a video-editing creator's community.
 *
 * The cast is fictional and the group is private; this is stated in the README and
 * the submission. What is NOT fictional is the persistence: these messages are posted
 * on the real day listed, so by demo day the Mind has genuinely remembered them across
 * real elapsed days. Never backdate a message — we do not need to.
 *
 * Cast roles map to the demo beats in docs/BUILD_PLAN.md §9-§10.
 */

/**
 * ONE TELEGRAM ACCOUNT PER HANDLE. This is not negotiable and it is the main
 * logistical cost of the demo: a Telegram account has exactly one user id and one
 * handle, and Keeper's memory is keyed on that id. Two cast members sharing an account
 * would be one person to the Mind, which breaks the very thing we are demonstrating.
 *
 * Each account needs its own phone number. If you cannot get six, cut cast members
 * rather than double up — see MINIMUM_CAST below.
 */
export interface CastMember {
  /** Telegram handle, without the @. Needs its own Telegram account. */
  handle: string;
  display: string;
  /** What this member exists to demonstrate. */
  role: string;
  /** Demo beat that fails if this member does not exist. */
  demoBeat: string;
  /** Can the demo survive without them? */
  essential: boolean;
}

/**
 * If accounts are scarce, seed in this order. The first four buy every rubric beat:
 * memory, continuity, contextual moderation, and the reward nomination.
 * Dropping @dr0pshipper_99 costs the clean-delete shot (a spam link from any handle
 * still demonstrates it). Dropping @new_kid_kai costs the live-join welcome, which can
 * instead be shown from the day-1 screenshots of anyone's join.
 */
export const MINIMUM_CAST = ['ada_edits', 'marco_cuts', 'lena_learns', 'rex_hotkeys'] as const;

export const CAST: Record<string, CastMember> = {
  ada_edits: {
    handle: 'ada_edits',
    display: 'Ada',
    role: 'the creator — on camera, issues override commands',
    demoBeat: 'all of them; this is your own account',
    essential: true,
  },
  marco_cuts: {
    handle: 'marco_cuts',
    display: 'Marco',
    role: 'loyal helpful regular since day 1 — the eventual Top Contributor',
    demoBeat: '75–95s: autonomous Top Contributor nomination + on-chain reward',
    essential: true,
  },
  lena_learns: {
    handle: 'lena_learns',
    display: 'Lena',
    role: 'beginner with an OPEN LOOP (choppy exports, day 2) who goes quiet and returns',
    demoBeat: '30–55s: MEMORY + CONTINUITY — the highest-scoring 25 seconds of the video',
    essential: true,
  },
  rex_hotkeys: {
    handle: 'rex_hotkeys',
    display: 'Rex',
    role: 'the borderline case — sarcastic banter a keyword bot would nuke',
    demoBeat: '55–75s: CONTEXT, NOT KEYWORDS',
    essential: true,
  },
  dr0pshipper_99: {
    handle: 'dr0pshipper_99',
    display: 'dropshipper',
    role: 'obvious spam/link drop — clean delete with reasoning',
    demoBeat: 'b-roll for the moderation log; any handle can post the spam line',
    essential: false,
  },
  new_kid_kai: {
    handle: 'new_kid_kai',
    display: 'Kai',
    role: 'joins live on camera — welcome + day-2 check-in',
    demoBeat: 'autonomous welcome + next-day check-in; can be evidenced from screenshots instead',
    essential: false,
  },
};

export interface SeedMessage {
  /** Cast key. */
  from: keyof typeof CAST;
  text: string;
  /** Why this line exists — keeps seeding honest and on-script. */
  beat?: string;
}

/**
 * Scripted history, one entry per sprint day. Day 1 = Aug 20.
 *
 * Keep each day short (10 minutes of posting). The point is not volume, it is that
 * relationships have a real past: Marco has been helpful since day 1, Lena's question
 * really did go unanswered on day 2, and the Mind really did watch it happen.
 */
export const DAYS: Record<number, SeedMessage[]> = {
  1: [
    {
      from: 'ada_edits',
      text: "Welcome to the Lab, everyone. This is where I answer editing questions between uploads. Two rules: be kind, and no self-promo without asking me first.",
      beat: 'establishes community norms the Mind will later moderate against',
    },
    {
      from: 'marco_cuts',
      text: "Been following since the color grading series — happy to help anyone with Resolve stuff, that's my day job.",
      beat: 'Marco establishes himself as the helpful regular on day 1',
    },
    {
      from: 'lena_learns',
      text: "hi! total beginner here, just switched from CapCut to Premiere and I'm a bit lost tbh",
      beat: 'Lena establishes herself as the beginner',
    },
    {
      from: 'marco_cuts',
      text: "@lena_learns welcome! Premiere's a big jump. Ask anything, no question is too basic in here.",
      beat: 'Marco helps unprompted — the contribution pattern that earns the reward',
    },
    {
      from: 'rex_hotkeys',
      text: "premiere in 2026 lmao. anyway hi ada, hotkey nerd, i will die on the ripple-delete hill",
      beat: 'establishes Rex as a sarcastic-but-harmless regular BEFORE the borderline moment — this is the relationship history that makes Keeper judge him correctly later',
    },
  ],
  2: [
    {
      from: 'lena_learns',
      text: "ok so my exports are coming out choppy?? like the timeline plays fine but the mp4 stutters. 1080p60, h264. any ideas",
      beat: 'THE OPEN LOOP. Nobody answers this. It stays dangling.',
    },
    {
      from: 'ada_edits',
      text: "Editing all day, back later — Marco's usually the export whisperer",
      beat: "deliberately does NOT answer Lena — the loop must stay open",
    },
    {
      from: 'marco_cuts',
      text: "quick one: anyone else's Resolve project files ballooning past 2GB? mine's getting silly",
      beat: 'conversation moves on, burying Lena’s question — realistic and necessary',
    },
  ],
  3: [
    {
      from: 'marco_cuts',
      text: "made a little cheat sheet of the export presets I use for YouTube vs Reels, happy to share it if anyone wants",
      beat: 'more contribution — builds the Top Contributor case in the Mind’s memory',
    },
    {
      from: 'rex_hotkeys',
      text: "post it, i'll tell you everything wrong with it (affectionately)",
      beat: 'Rex banter continues — the norm the Mind must learn',
    },
    {
      from: 'ada_edits',
      text: "yes please Marco, I'll pin it",
    },
  ],
  4: [
    {
      from: 'marco_cuts',
      text: "pinned version's up. also @ada_edits your last video's audio ducking was so clean, what are you using",
    },
    {
      from: 'ada_edits',
      text: "just the built-in ducking honestly, -18db on the music bed",
    },
  ],
  5: [
    {
      from: 'rex_hotkeys',
      text: "watched the new one. the jump cut at 2:14 is garbage lol what were you thinking",
      beat: 'THE BORDERLINE CASE (live on camera in the demo). Keyword bots see "garbage" and act; Keeper knows Rex has been here since day 1 and that this is how he talks.',
    },
  ],
};

export const DAY_NOTES: Record<number, string> = {
  1: 'Post as three different accounts. Space messages a few minutes apart so timestamps look human.',
  2: "Do NOT answer Lena. The open loop is the demo's spine.",
  5: "Rex's line is the moderation beat — post it live during recording if possible.",
};
