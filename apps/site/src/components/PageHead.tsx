import { Reveal } from './Reveal';

/**
 * Every page after the landing opens the same way: an eyebrow that says what you are looking at,
 * a display line, and one paragraph. The corridor is the loud thing; these are deliberately not.
 */
export function PageHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede: string;
}) {
  return (
    <header className="mx-auto max-w-[1600px] px-6 pb-16 pt-36 md:px-10 md:pb-24 md:pt-48">
      <Reveal as="p" className="voice-record t-label text-warm">
        {eyebrow}
      </Reveal>
      <div className="mt-8 grid gap-10 md:grid-cols-12">
        <Reveal as="h1" className="t-section voice-mind md:col-span-7" delay={0.06}>
          {title}
        </Reveal>
        <Reveal
          as="p"
          mode="fade"
          delay={0.18}
          className="t-body self-end text-mute md:col-span-4 md:col-start-9"
        >
          {lede}
        </Reveal>
      </div>
    </header>
  );
}
