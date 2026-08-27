/**
 * One row of the real moderation log.
 *
 * The reasoning is the whole point — it is written by the Mind, and there is no classifier in the
 * codebase to attribute it to. So it is set in the machine voice, at length, unedited.
 */
export function LogRow({
  id,
  stamp,
  action,
  confidence,
  target,
  reasoning,
  outcome,
  tone = 'normal',
}: {
  id: string;
  stamp: string;
  action: string;
  confidence: string;
  target?: string;
  reasoning: string;
  outcome: string;
  tone?: 'normal' | 'accent';
}) {
  return (
    <article className="grid gap-5 border-t border-paper/12 py-8 md:grid-cols-12">
      <div className="voice-record t-label flex flex-wrap items-center gap-x-4 gap-y-2 md:col-span-3 md:block md:space-y-2">
        <span className="text-mute">{id}</span>
        <span className={tone === 'accent' ? 'block text-warm' : 'block text-paper'}>{action}</span>
        <span className="block text-mute">{stamp}</span>
        {target !== undefined && <span className="block text-mute">{target}</span>}
      </div>
      <div className="md:col-span-8 md:col-start-5">
        <p className="voice-record text-[0.8rem] leading-[1.9] text-paper/72">{reasoning}</p>
        <p className="voice-record t-label mt-4 text-mute">
          {outcome} <span className="mx-2 text-mute/40">/</span> confidence {confidence}
        </p>
      </div>
    </article>
  );
}
