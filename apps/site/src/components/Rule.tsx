/** A hairline with a mono label. Sections are entries in a ledger, not slides. */
export function Rule({ label, index }: { label: string; index?: string }) {
  return (
    <div className="mb-12 flex items-baseline gap-5 border-t border-paper/12 pt-5">
      {index !== undefined && <span className="voice-record t-label text-warm">{index}</span>}
      <span className="voice-record t-label text-mute">{label}</span>
    </div>
  );
}
