import type { Metadata } from 'next';
import { PageHead } from '../../components/PageHead';
import { Reveal } from '../../components/Reveal';
import { Mark } from '../../components/Mark';

export const metadata: Metadata = {
  title: 'Brand — Keeper',
  description: 'The mark, the palette, the two voices, and why each of them is what it is.',
};

const SWATCHES = [
  { name: '--void', hex: '#0B0A08', role: 'Background. Warm near-black — archive in shadow, not dark mode.' },
  { name: '--paper', hex: '#F2EFE9', role: 'Primary text. Warm and faintly aged. Never #FFF.' },
  { name: '--mute', hex: '#8A8578', role: 'Labels, metadata, rules.' },
  { name: '--warm', hex: '#F59E0B', role: 'The accent. Not chosen — it is the Mind’s own token for warmth: warm.' },
];

const SEMANTIC = [
  { name: 'steady', hex: '#38BDF8' },
  { name: 'cooling', hex: '#A78BFA' },
  { name: 'at_risk', hex: '#F43F5E' },
];

export default function Brand() {
  return (
    <>
      <PageHead
        eyebrow="the assets"
        title="A mark that never closes, and two voices that were already there."
        lede="Nothing here was picked for taste alone. The accent is a value the product assigns, and the typefaces divide along a split the moderation log already had."
      />

      {/* The mark. */}
      <section className="mx-auto max-w-[1600px] px-6 pb-28 md:px-10">
        <div className="grid gap-12 md:grid-cols-12">
          <Reveal as="div" mode="fade" className="md:col-span-5">
            <div className="flex aspect-square items-center justify-center rounded-lg border border-paper/12 bg-[#100E0A]">
              <Mark className="h-32 w-32 text-paper md:h-44 md:w-44" animate />
            </div>
          </Reveal>
          <div className="md:col-span-6 md:col-start-7">
            <Reveal as="h2" className="t-section voice-mind">
              An open loop.
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.1} className="t-body mt-6 text-mute">
              A ring with a deliberate gap, its two terminals reaching <em className="not-italic text-paper">past</em>{' '}
              each other rather than meeting — a thread picked back up. It is the product&rsquo;s own
              noun: Keeper tracks <span className="voice-record text-paper">openLoops</span> per
              member, and the returning-member beat exists because one of them stayed open for 52
              hours.
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.18} className="t-body mt-5 text-mute">
              The gap never closes. On load a faint trace runs from one terminal, around, and stops
              at the other: the loop being <em className="not-italic text-paper">held</em>, not
              resolved. A mark that snapped shut would promise the opposite of what the product does.
            </Reveal>
            <Reveal as="p" mode="fade" delay={0.26} className="voice-record t-label mt-8 text-mute">
              /brand/mark.svg &nbsp;·&nbsp; single stroke &nbsp;·&nbsp; currentColor
            </Reveal>
          </div>
        </div>
      </section>

      {/* Palette. */}
      <section className="border-t border-paper/10">
        <div className="mx-auto max-w-[1600px] px-6 py-24 md:px-10">
          <Reveal as="p" className="voice-record t-label mb-10 text-mute">
            palette · four roles
          </Reveal>
          <div className="grid gap-px overflow-hidden rounded-lg border border-paper/12 bg-paper/12 md:grid-cols-4">
            {SWATCHES.map((c, i) => (
              <div key={c.name} className="bg-void p-6">
                <Reveal as="div" mode="fade" delay={i * 0.05}>
                  <span
                    className="mb-5 block h-24 w-full rounded border border-paper/10"
                    style={{ background: c.hex }}
                  />
                  <p className="voice-record t-label text-paper">{c.name}</p>
                  <p className="voice-record t-label mt-1 text-mute">{c.hex}</p>
                  <p className="t-body mt-4 text-mute">{c.role}</p>
                </Reveal>
              </div>
            ))}
          </div>

          <Reveal as="p" mode="fade" className="t-body mt-10 max-w-[60ch] text-mute">
            Three more colours exist and are used <em className="not-italic text-paper">only</em>{' '}
            where they are literally true — they are the other warmth ratings the Mind assigns.
            They never appear as decoration.
          </Reveal>
          <div className="mt-6 flex flex-wrap gap-8">
            {SEMANTIC.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-full" style={{ background: c.hex }} />
                <span className="voice-record t-label text-mute">
                  {c.name} · {c.hex}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Type. */}
      <section className="border-t border-paper/10">
        <div className="mx-auto max-w-[1600px] px-6 py-24 md:px-10">
          <Reveal as="p" className="voice-record t-label mb-10 text-mute">
            type · two voices
          </Reveal>
          <Reveal as="p" mode="fade" className="t-body mb-14 max-w-[64ch] text-mute">
            The moderation log has two authors: the Mind writes the replies and the reasoning, the
            connector records the timestamps and the outcome. The typography stages that split
            rather than inventing one.
          </Reveal>

          <div className="grid gap-px overflow-hidden rounded-lg border border-paper/12 bg-paper/12 md:grid-cols-2">
            <div className="bg-void p-8 md:p-12">
              <p className="voice-record t-label text-warm">Fraunces · what the Mind said</p>
              <p className="voice-mind mt-8 text-paper" style={{ fontSize: 'clamp(1.6rem,3vw,2.6rem)', lineHeight: 1.2 }}>
                hey Lena — welcome back. school eats weeks, that&rsquo;s normal, no apology needed.
              </p>
              <p className="t-body mt-8 text-mute">
                A variable serif that reads antique and contemporary at once, with its WONK axis
                dialled up. It carries the hero, the section heads, and anything the Mind actually
                wrote — because that voice is a person&rsquo;s, not a system&rsquo;s.
              </p>
            </div>
            <div className="bg-[#100E0A] p-8 md:p-12">
              <p className="voice-record t-label text-warm">IBM Plex Mono · what the system recorded</p>
              <p className="voice-record mt-8 text-[0.82rem] leading-[1.9] text-paper/80">
                ACTION #67 · reply · CONFIDENCE HIGH · 28 AUG 00:27:40 HKT
                <br />
                target @lena_learns · gated false · converted null
                <br />
                outcome: reply posted in group
              </p>
              <p className="t-body mt-8 text-mute">
                Honest rather than stylistic: this is how the log renders. Timestamps, ids,
                confidence and labels all sit here, and nothing the Mind said ever does.
              </p>
            </div>
          </div>

          <div className="mt-10 rounded-lg border border-paper/12 p-8 md:p-10">
            <p className="voice-record t-label text-mute">Instrument Sans · body</p>
            <p className="t-body mt-5 max-w-[70ch] text-paper/85">
              The third face stays out of the way. It runs every paragraph on this site, including
              this one, and it is deliberately not Inter — which is the typeface every product page
              reaches for when nobody has made a decision.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
