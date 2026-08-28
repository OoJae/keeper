import type { Metadata } from 'next';
import { PageHead } from '../../../components/PageHead';
import { Reveal } from '../../../components/Reveal';

export const metadata: Metadata = {
  title: 'Context, not keywords — Keeper',
  description:
    'A spam account flagged first and deleted on its third post. A regular’s blunt insult left alone. Same night.',
};

/** Two decisions from the same night that a keyword bot gets wrong in opposite directions. */
export default function Context() {
  return (
    <>
      <PageHead
        eyebrow="03 / proportion"
        title="Two calls a keyword bot gets wrong in opposite directions."
        lede="Both happened on the night of 26 August, ninety minutes apart. One message was removed. One that looks far worse on paper was left exactly where it was."
      />

      <section className="mx-auto max-w-[1600px] px-6 pb-28 md:px-10">
        <div className="grid gap-px overflow-hidden rounded-lg border border-paper/12 bg-paper/12 md:grid-cols-2">
          {/* Left: the one it removed — and only on the third try. */}
          <div className="bg-void p-8 md:p-12">
            <Reveal as="p" className="voice-record t-label text-mute">
              removed · on the third post
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.08} className="voice-record mt-8 text-[0.78rem] leading-relaxed text-paper/60">
              01:17 &nbsp;“MAKE $4700/WEEK EDITING FACELESS YOUTUBE VIDEOS…”
              <br />
              <span className="text-warm">→ flagged to the creator. Not removed.</span>
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.14} className="voice-record mt-5 text-[0.78rem] leading-relaxed text-paper/60">
              01:34 &nbsp;“LAST CHANCE 🔥 MAKE $8000/WEEK…”
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.2} className="voice-record mt-5 text-[0.78rem] leading-relaxed text-paper/85">
              01:45 &nbsp;“💰 EDITORS WANTED — $300/day, zero skills needed…”
              <br />
              <span className="text-warm">→ deleted.</span>
            </Reveal>
            <Reveal as="blockquote" mode="fade" delay={0.26} className="mt-10 border-l-2 border-warm/40 pl-5">
              <p className="voice-record text-[0.78rem] leading-[1.9] text-paper/70">
                Third dropship event from the same id in this conversation within 28 minutes. Same
                rotation pattern, same link shortener, escalating urgency. The first was flagged to
                the creator rather than removed; the account has produced nothing else.
              </p>
            </Reveal>
          </div>

          {/* Right: the one it left alone. */}
          <div className="bg-[#100E0A] p-8 md:p-12">
            <Reveal as="p" className="voice-record t-label text-mute">
              left alone
            </Reveal>
            <Reveal
              as="p"
              mode="fade"
              delay={0.08}
              className="voice-mind mt-8 text-paper"
              style={{ fontSize: 'clamp(1.2rem,2vw,1.7rem)', lineHeight: 1.35 }}
            >
              “cheat sheet&rsquo;s fine. reels preset is wrong though, you&rsquo;ve got it at 24fps
              and vertical hates that”
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.16} className="voice-record t-label mt-5 text-mute">
              @rex_hotkeys · 25 AUG · 19:17
            </Reveal>
            <Reveal as="blockquote" mode="fade" delay={0.24} className="mt-10 border-l-2 border-paper/20 pl-5">
              <p className="voice-record text-[0.78rem] leading-[1.9] text-paper/70">
                Rex has four days of history in this group: blunt, lowercase, affectionate. The jab
                is aimed at the work, not the person, and the person it is aimed at answered it in
                kind ten minutes ago. No norm crossed.
              </p>
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.32} className="t-body mt-8 text-mute">
              A keyword bot sees an insult and removes it. Keeper saw four days of Rex talking
              exactly like that with people who like him.
            </Reveal>
          </div>
        </div>

        <Reveal as="p" mode="fade" className="t-body mx-auto mt-16 max-w-[58ch] text-center text-mute">
          Neither call is a rule. Both are the Mind reading a relationship it has been keeping
          since the group started — which is the only way to get these two right on the same night.
        </Reveal>
      </section>
    </>
  );
}
