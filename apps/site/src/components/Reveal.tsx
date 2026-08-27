'use client';

/**
 * One reveal primitive, fired ONCE when the element is ~85% up the viewport.
 *
 * Deliberately not a scroll-linked animation: reveals that re-run every time you scroll past are
 * the scattered-motion tell. This observes, fires, and disconnects.
 */
import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';

export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  mode = 'mask',
  className = '',
  style: extra,
}: {
  children: ReactNode;
  as?: ElementType;
  /** Seconds. Stagger siblings 0.06–0.1s; more than that reads as a queue, not a group. */
  delay?: number;
  /** `mask` slides a line up behind overflow:hidden. `fade` is for anything that must not clip. */
  mode?: 'mask' | 'fade';
  className?: string;
  /** Merged after the delay variable, so a caller can set a one-off type size. */
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -15% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style = { ['--reveal-delay' as string]: `${delay}s`, ...extra };

  if (mode === 'fade') {
    return (
      <Tag ref={ref} data-shown={shown} style={style} className={`fade ${className}`}>
        {children}
      </Tag>
    );
  }
  return (
    <div ref={ref as never} data-shown={shown} style={style} className={`reveal ${className}`}>
      <Tag>{children}</Tag>
    </div>
  );
}
