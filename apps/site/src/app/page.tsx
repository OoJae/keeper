import Link from 'next/link';
import { Corridor } from '../components/Corridor';
import { Reveal } from '../components/Reveal';
import { Rule } from '../components/Rule';

/**
 * The landing page.
 *
 * The corridor opens it with no headline — you land inside the scene, mid-thread, and the thesis
 * arrives on the first scroll. That is the page's one real risk, taken because its whole argument
 * is that silence is what memory survives; making you sit in it for a beat IS the pitch.
 */
export default function Home() {
  return (
    <>
      <Corridor />

      {/* 01 — the thesis, delivered only after you have felt the gap. */}
      <section className="mx-auto max-w-[1600px] px-6 py-32 md:px-10 md:py-48">
        <Rule label="what just happened" index="01" />
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-7">
            <Reveal as="h1" className="t-hero voice-mind">
              It remembers
            </Reveal>
            <Reveal as="h1" className="t-hero voice-mind text-warm" delay={0.08}>
              who came back.
            </Reveal>
          </div>
          <div className="md:col-span-4 md:col-start-9">
            <Reveal as="p" mode="fade" className="t-body text-paper/75" delay={0.2}>
              Lena asked about stuttering exports, then disappeared for two days. When she came
              back, nobody prompted Keeper. It greeted her by name, picked up the exact thread that
              died, and re-asked the two questions she never answered.
            </Reveal>
            <Reveal as="p" mode="fade" className="t-body mt-6 text-mute" delay={0.3}>
              There is no open-loops table in the code. Nothing computes that. The memory lives in
              the Mind, and this is what it looks like from the outside.
            </Reveal>
          </div>
        </div>
      </section>

      {/* 02 — the machine voice, unedited. This is the proof that the judgment is not ours. */}
      <section className="border-t border-paper/10 bg-[#0E0C09]">
        <div className="mx-auto max-w-[1600px] px-6 py-32 md:px-10 md:py-40">
          <Rule label="and here is why it did that" index="02" />
          <div className="grid gap-12 md:grid-cols-12">
            <div className="md:col-span-4">
              <Reveal as="p" mode="fade" className="t-body text-paper/75">
                Every action Keeper takes is logged with the reasoning that produced it — written
                by the Mind, not by us. There is no classifier in this repository to attribute it
                to.
              </Reveal>
              <Reveal as="div" mode="fade" delay={0.12} className="mt-8">
                <Link
                  href="/proof"
                  className="voice-record t-label group inline-flex items-center gap-3 text-warm"
                >
                  Read the log
                  <span className="inline-block transition-transform duration-500 ease-out group-hover:translate-x-1.5">
                    →
                  </span>
                </Link>
              </Reveal>
            </div>
            <Reveal
              as="blockquote"
              mode="fade"
              delay={0.15}
              className="voice-record md:col-span-7 md:col-start-6"
            >
              <p className="text-[0.8rem] leading-[1.9] text-paper/70">
                <span className="text-mute">reasoning /</span> Type{' '}
                <span className="text-warm">member_returned</span> with last_seen 2026-08-25 (3
                days ago) means pickup where conversation died, by name, not generic welcome. Last
                conversational thread on file:{' '}
                <span className="text-paper">2026-08-25T12:40:08Z</span> proxy-files question.
                Reply references the proxy walkthrough, re-asks the RAM/GPU question. No moderation
                concern. No greeting-as-introduction required (member_returned ≠ member_joined).
                Entity record on Lena updated with the open-loop evolution.
              </p>
              <footer className="mt-6 border-t border-paper/10 pt-4 text-[0.7rem] tracking-[0.14em] text-mute">
                ACTION #67 · CONFIDENCE HIGH · 28 AUG 00:27:40 HKT
              </footer>
            </Reveal>
          </div>
        </div>
      </section>

      {/* 03 — the rest of the job, stated in numbers that are literally true. */}
      <section className="mx-auto max-w-[1600px] px-6 py-32 md:px-10 md:py-40">
        <Rule label="what it does when nobody asks" index="03" />
        <div className="grid gap-10 md:grid-cols-3">
          {[
            {
              n: '7',
              t: 'actions with nothing triggering them',
              d: 'A newcomer welcomed on arrival. A check-in the next day. Nightly digests the Mind schedules itself — not a cron job of ours.',
            },
            {
              n: '3rd',
              t: 'post before it deleted anything',
              d: 'A spam account got flagged to the creator first. Only when the same account posted a third time did Keeper remove it. Proportion, not reflex.',
            },
            {
              n: '0',
              t: 'classifiers in the codebase',
              d: 'No toxicity model, no scoring function, no rule table. The only decisions our code makes are whether to ask, and whether it is safe to act.',
            },
          ].map((c, i) => (
            <Reveal key={c.n} as="div" mode="fade" delay={i * 0.09} className="border-t border-paper/12 pt-6">
              <p className="voice-mind text-warm" style={{ fontSize: 'clamp(2.5rem,5vw,4rem)', lineHeight: 1 }}>
                {c.n}
              </p>
              <p className="voice-record t-label mt-3 text-paper">{c.t}</p>
              <p className="t-body mt-4 text-mute">{c.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 04 — the limit, volunteered. A page that names its own gap is believed about the rest. */}
      <section className="border-t border-paper/10">
        <div className="mx-auto max-w-[1600px] px-6 py-28 md:px-10">
          <Rule label="what it does not do" index="04" />
          <div className="grid gap-10 md:grid-cols-12">
            <Reveal as="p" mode="fade" className="t-section voice-mind md:col-span-6">
              It cannot pay anyone yet.
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.12} className="t-body text-mute md:col-span-5 md:col-start-8">
              Keeper nominates contributors from its own memory of who actually shows up, and the
              creator approves. The on-chain payout is blocked by a platform billing gate that two
              purchases did not lift, so it is roadmap — not built. Nothing here claims a
              transaction.
            </Reveal>
          </div>
        </div>
      </section>

      {/* 05 — close. */}
      <section className="border-t border-paper/10">
        <div className="mx-auto max-w-[1600px] px-6 py-32 md:px-10 md:py-48">
          <Reveal as="p" className="t-hero voice-mind max-w-[16ch]">
            Run it like a relationship.
          </Reveal>
          <Reveal as="p" className="t-hero voice-mind max-w-[16ch] text-mute" delay={0.08}>
            Not a rulebook.
          </Reveal>
          <div className="mt-16 flex flex-wrap items-center gap-x-10 gap-y-5">
            <Reveal as="div" mode="fade" delay={0.2}>
              <Link
                href="/memory"
                className="voice-record t-label group inline-flex items-center gap-3 rounded-full border border-paper/25 px-7 py-4 text-paper transition-colors duration-400 ease-out hover:border-warm hover:text-warm"
              >
                How the memory works
                <span className="inline-block transition-transform duration-500 ease-out group-hover:translate-x-1.5">
                  →
                </span>
              </Link>
            </Reveal>
            <Reveal as="div" mode="fade" delay={0.28}>
              <a
                href="https://dashboard-chi-one-92.vercel.app"
                className="voice-record t-label text-mute underline-offset-8 transition-colors duration-300 hover:text-paper hover:underline"
              >
                See the live dashboard
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      <footer className="border-t border-paper/10">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-6 py-10 md:px-10">
          <p className="voice-record t-label text-mute">
            Keeper · a community steward powered by a Mind
          </p>
          <p className="voice-record t-label text-mute">
            Built solo, in eight days · Creative Minds Jam
          </p>
        </div>
      </footer>
    </>
  );
}
