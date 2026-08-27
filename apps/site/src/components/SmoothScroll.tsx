'use client';

/**
 * Smooth scroll is the backbone the corridor is timed against — without it, a trackpad's jitter
 * reads as the scene stuttering rather than as the scene being scrubbed.
 *
 * Disabled outright under prefers-reduced-motion: interpolated scrolling is itself motion, and
 * honouring the preference by leaving it on while turning off the fades would be a token gesture.
 */
import { useEffect } from 'react';

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    let frame = 0;
    let cancelled = false;

    void import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 });
      const raf = (time: number): void => {
        lenis?.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, []);

  return null;
}
