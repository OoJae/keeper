import type { Metadata } from 'next';
import { PageHead } from '../../components/PageHead';
import { Reveal } from '../../components/Reveal';

export const metadata: Metadata = {
  title: 'How the memory works — Keeper',
  description:
    'Envelope in, directive out. The relationship memory lives in the Mind, not in our database.',
};

const STEPS = [
  {
    n: '01',
    t: 'An event is wrapped, not interpreted',
    d: 'Every message becomes an envelope: who sent it, when they first appeared, when they were last seen, and the raw text. The connector computes two timestamps. It forms no opinion.',
  },
  {
    n: '02',
    t: 'Only judgment-worthy events are sent',
    d: 'A cheap local filter decides what is worth an exchange — joins, returns, questions, links, creator commands. This is a cost control, not a moderation decision. Everything else is mirrored locally and costs nothing.',
  },
  {
    n: '03',
    t: 'The Mind decides',
    d: 'It answers with a fenced directive: an action, a target, the message to post, its own reasoning, and a confidence. Every judgment in the product is made here and nowhere else.',
  },
  {
    n: '04',
    t: 'The connector executes, or refuses',
    d: 'Low confidence never acts — it flags the creator. A destructive action recovered from unfenced prose is refused, because a member can type JSON into a group. The log records what we would not do, and why.',
  },
];

export default function Memory() {
  return (
    <>
      <PageHead
        eyebrow="04 / architecture"
        title="Envelope in. Directive out. The memory stays where it is."
        lede="Keeper's connector is plumbing on purpose. It relays and it executes; it does not think. That split is what makes the memory claim checkable rather than rhetorical."
      />

      <section className="mx-auto max-w-[1600px] px-6 pb-8 md:px-10">
        <ol className="grid gap-px overflow-hidden rounded-lg border border-paper/12 bg-paper/12 md:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.n} className="bg-void p-8 md:p-12">
              <Reveal as="p" className="voice-record t-label text-warm" delay={i * 0.06}>
                {s.n}
              </Reveal>
              <Reveal as="h2" className="t-quote voice-mind mt-5 text-paper" delay={i * 0.06 + 0.04}>
                {s.t}
              </Reveal>
              <Reveal as="p" mode="fade" delay={i * 0.06 + 0.12} className="t-body mt-4 text-mute">
                {s.d}
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-[1600px] px-6 py-28 md:px-10 md:py-36">
        <div className="grid gap-12 md:grid-cols-12">
          <Reveal as="h2" className="t-section voice-mind md:col-span-6">
            Delete the database. It still knows everyone.
          </Reveal>
          <div className="md:col-span-5 md:col-start-8">
            <Reveal as="p" mode="fade" delay={0.1} className="t-body text-mute">
              The SQLite file is a mirror. It holds messages, timestamps and an audit log — never a
              profile, never a judgment. Who someone <em className="not-italic text-paper">is</em>{' '}
              lives in the Mind&rsquo;s own long-term memory.
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.18} className="t-body mt-6 text-mute">
              The check anyone can run: delete it, restart, and ask the Mind who @lena_learns is. It
              answers — including the thread she left open — from a conversation with no history.
            </Reveal>
            <Reveal as="pre" mode="fade" delay={0.26} className="voice-record mt-8 overflow-x-auto rounded border border-paper/12 bg-[#100E0A] p-5 text-[0.72rem] leading-relaxed text-paper/70">
{`$ rm var/keeper.db
$ pnpm dev:connector

> who is @lena_learns?
  Lena, joined 2026-08-24. Switched from CapCut to
  Premiere. Her 1080p60 h264 exports stutter while the
  timeline plays fine — still open.`}
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
