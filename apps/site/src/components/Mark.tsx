/**
 * The Keeper mark: an open loop.
 *
 * Two strokes. The ring, and a returning end that overshoots the start rather than meeting it.
 * The gap is the idea — Keeper holds a loop open until it resolves — so nothing here ever closes
 * it. With `animate`, the trace draws once on load and stops short, which is the same statement
 * in motion.
 */
export function Mark({ className = '', animate = false }: { className?: string; animate?: boolean }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} role="img" aria-label="Keeper">
      <title>Keeper — an open loop</title>
      <path
        d="M31.5 8.6a17 17 0 1 1-15 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        className={animate ? 'mark-trace' : undefined}
      />
      <path d="M24 3.4c4.9 0 8.7 2.4 10.4 5.6" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
