import type { Metadata } from 'next';
import { PageHead } from '../../components/PageHead';
import { LogRow } from '../../components/LogRow';
import { Reveal } from '../../components/Reveal';
import { Constellation } from '../../components/Constellation';

export const metadata: Metadata = {
  title: 'Proof — Keeper',
  description: 'The real moderation log: every action, with the reasoning the Mind wrote for it.',
};

/**
 * The receipts.
 *
 * Keeper's argument is "check me", so the second page is the evidence rather than more claims.
 * Every row below happened, at the timestamp shown. The one real person in the group is
 * pseudonymised here exactly as they are in the product's own public API — their identity is not
 * ours to publish, and what Keeper DID is the part that matters.
 */
export default function Proof() {
  return (
    <>
      <PageHead
        eyebrow="02 / the receipts"
        title="Every action, with the reasoning that produced it."
        lede="Twenty actions are on record. Seven of them nothing triggered. The reasoning column is written by the Mind — there is no classifier in this repository to attribute it to."
      />

      <section className="mx-auto max-w-[1600px] px-6 md:px-10">
        <Constellation />
      </section>

      <section className="mx-auto max-w-[1600px] px-6 py-24 md:px-10 md:py-32">
        <Reveal as="p" className="voice-record t-label mb-10 text-mute">
          moderation log · verbatim
        </Reveal>

        <LogRow
          id="#67"
          stamp="28 AUG · 00:27:40"
          action="reply"
          confidence="high"
          target="@lena_learns"
          tone="accent"
          reasoning="Type member_returned with last_seen 2026-08-25 (3 days ago) means pickup where conversation died, by name, not generic welcome. Last conversational thread on file: 2026-08-25T12:40:08Z proxy-files question. Reply references the proxy walkthrough, re-asks the RAM/GPU question, leaves the door open for the deep dive after she reports back. No moderation concern. No greeting-as-introduction required (member_returned ≠ member_joined). Entity record updated with the open-loop evolution."
          outcome="reply posted in group"
        />
        <LogRow
          id="#63"
          stamp="27 AUG · 02:24:17"
          action="reply · unprompted"
          confidence="high"
          target="a newcomer"
          reasoning="24h check-in per the standing instruction. They joined the previous night with a one-word message that read more like a join notification than an intro, were greeted on arrival, and have been quiet since. Reply names them, asks one specific question about what brought them in, and does not press."
          outcome="reply posted in group · nothing triggered it"
        />
        <LogRow
          id="#57"
          stamp="26 AUG · 01:46:41"
          action="delete"
          confidence="high"
          target="@dr0pshipper_99"
          reasoning="Third dropship event from the same id in this conversation within 28 minutes (17:17:32Z, 17:34:39Z, now 17:45:50Z). Same rotation pattern, same link shortener, escalating urgency. The first was flagged to the creator rather than removed; the account has produced nothing else. Deleting this one."
          outcome="deleted message 44"
        />
        <LogRow
          id="#48"
          stamp="26 AUG · 03:21:24"
          action="reply"
          confidence="high"
          target="@rex_hotkeys"
          reasoning="Rex has four days of history in this group: blunt, lowercase, affectionate. The jab is aimed at the work, not the person, and the person it is aimed at answered it in kind ten minutes ago. No norm crossed. Answering the actual question instead."
          outcome="reply posted in group · later reversed by the creator"
        />

        <Reveal as="p" mode="fade" className="t-body mt-14 max-w-[52ch] text-mute">
          The last row was undone. <span className="text-paper">/keeper undo</span> removed it
          seventeen minutes after it posted, and the row still carries the reversal and the moment
          it happened. A log that only records the actions that went well is not a log.
        </Reveal>
      </section>

      <section className="border-t border-paper/10">
        <div className="mx-auto max-w-[1600px] px-6 py-24 md:px-10">
          <Reveal as="p" className="t-section voice-mind max-w-[20ch]">
            Try it yourself.
          </Reveal>
          <Reveal as="p" mode="fade" delay={0.1} className="t-body mt-6 max-w-[56ch] text-mute">
            Open a conversation to the Steward Mind that Keeper has never used and ask who
            @lena_learns is. It answers from memory, in a thread with no history, about a member it
            last heard from days ago. Our code is not in the loop.
          </Reveal>
          <Reveal as="div" mode="fade" delay={0.2} className="mt-10">
            <a
              href="https://dashboard-chi-one-92.vercel.app"
              className="voice-record t-label group inline-flex items-center gap-3 rounded-full border border-paper/25 px-7 py-4 text-paper transition-colors duration-500 ease-out hover:border-warm hover:text-warm"
            >
              Open the live dashboard
              <span className="inline-block transition-transform duration-500 ease-out group-hover:translate-x-1.5">
                →
              </span>
            </a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
