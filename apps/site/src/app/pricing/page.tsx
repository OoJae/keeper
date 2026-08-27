import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHead } from '../../components/PageHead';
import { Reveal } from '../../components/Reveal';

export const metadata: Metadata = {
  title: 'Pricing — Keeper',
  description: 'One community, one Mind. Priced against what a creator actually runs.',
};

const TIERS = [
  {
    name: 'Single community',
    price: '$29',
    unit: '/ month',
    for: 'One group. One Mind. The creator who is doing all of it alone.',
    has: [
      'Relationship memory for every member',
      'Context moderation with the reasoning shown',
      'Nightly digest, welcomes, day-2 check-ins',
      '/keeper undo on everything',
    ],
  },
  {
    name: 'Studio',
    price: '$89',
    unit: '/ month',
    for: 'Several communities, or one with moderators who need the log.',
    has: [
      'Up to five communities',
      'Shared moderation log and override history',
      'Contributor nominations across groups',
      'Priority Cognition allocation',
    ],
    accent: true,
  },
  {
    name: 'Platform',
    price: 'Talk to us',
    unit: '',
    for: 'You are running communities for other people.',
    has: [
      'Your own Minds, your own keys',
      'Self-hosted connector',
      'Audit export',
      'Roadmap input',
    ],
  },
];

export default function Pricing() {
  return (
    <>
      <PageHead
        eyebrow="05 / pricing"
        title="Priced per community, because that is what you actually run."
        lede="Keeper costs what a moderator costs for an afternoon. It is awake for the rest of the month."
      />

      <section className="mx-auto max-w-[1600px] px-6 pb-16 md:px-10">
        <div className="grid gap-px overflow-hidden rounded-lg border border-paper/12 bg-paper/12 md:grid-cols-3">
          {TIERS.map((t, i) => (
            <div key={t.name} className={`p-8 md:p-10 ${t.accent === true ? 'bg-[#12100B]' : 'bg-void'}`}>
              <Reveal as="p" className="voice-record t-label text-mute" delay={i * 0.06}>
                {t.name}
              </Reveal>
              <Reveal
                as="p"
                className={`voice-mind mt-6 ${t.accent === true ? 'text-warm' : 'text-paper'}`}
                delay={i * 0.06 + 0.04}
                style={{ fontSize: 'clamp(2.2rem,4vw,3.4rem)', lineHeight: 1 }}
              >
                {t.price}
                {t.unit !== '' && <span className="voice-record t-label ml-2 text-mute">{t.unit}</span>}
              </Reveal>
              <Reveal as="p" mode="fade" delay={i * 0.06 + 0.12} className="t-body mt-5 text-mute">
                {t.for}
              </Reveal>
              <ul className="mt-8 space-y-3">
                {t.has.map((h) => (
                  <li key={h} className="flex gap-3 text-paper/80">
                    <span className="voice-record mt-1 text-[0.7rem] text-warm">—</span>
                    <span className="t-body">{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1600px] px-6 pb-32 md:px-10">
        <Reveal as="p" mode="fade" className="t-body max-w-[62ch] text-mute">
          <span className="text-paper">On the honest bit:</span> Keeper nominates contributors for
          rewards from its own memory of who shows up, and you approve them. It cannot send the
          reward itself — the on-chain payout is blocked by a platform billing gate we cannot open
          from the API. That is roadmap, and it is priced as though it does not exist, because
          today it does not.
        </Reveal>
        <Reveal as="div" mode="fade" delay={0.12} className="mt-10">
          <Link
            href="/proof"
            className="voice-record t-label group inline-flex items-center gap-3 text-warm"
          >
            See what it has actually done
            <span className="inline-block transition-transform duration-500 ease-out group-hover:translate-x-1.5">
              →
            </span>
          </Link>
        </Reveal>
      </section>
    </>
  );
}
