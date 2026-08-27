'use client';

/**
 * A thin mono rail. The nav is metadata about the site, so it is set in the machine voice — the
 * same face the moderation log uses for everything it recorded.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/proof', label: 'Proof' },
  { href: '/context', label: 'Context' },
  { href: '/memory', label: 'Memory' },
  { href: '/pricing', label: 'Pricing' },
];

export function Nav() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);

  // Once the page has moved, the bar becomes opaque. A gradient scrim alone was not enough: the
  // display type is 90px of near-white and it read straight through, leaving the one element
  // that is on screen the whole time as the least legible thing on it.
  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      {/*
        A scrim, not mix-blend-difference. Difference blending looked elegant over the corridor's
        near-black and then went almost invisible the moment the nav crossed the hero's near-white
        display type — which it does on every page. A soft gradient is less clever and always
        legible, which is the correct trade for the one element that is on screen the whole time.
      */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 border-b transition-[opacity,border-color] duration-500 ease-io ${
          scrolled ? 'border-paper/10 opacity-100' : 'border-transparent opacity-0'
        }`}
        style={{ background: 'rgba(11,10,8,0.86)', backdropFilter: 'blur(14px)' }}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-28 transition-opacity duration-500 ease-io ${
          scrolled ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ background: 'linear-gradient(to bottom, rgba(11,10,8,0.75), rgba(11,10,8,0))' }}
      />
      <nav
        aria-label="Primary"
        className="relative mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-5 md:px-10 md:py-6"
      >
        <Link href="/" className="group flex items-center gap-3" aria-label="Keeper — home">
          <svg viewBox="0 0 48 48" fill="none" className="h-5 w-5 text-paper" aria-hidden="true">
            <path
              d="M31.5 8.6a17 17 0 1 1-15 0"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* The returning end. It overshoots the start rather than meeting it — the loop is
                held open, which is the one thing the product actually promises. */}
            <path
              d="M24 3.4c4.9 0 8.7 2.4 10.4 5.6"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              className="origin-center transition-transform duration-500 ease-out group-hover:rotate-[26deg]"
            />
          </svg>
          <span className="voice-record t-label hidden text-paper sm:inline">Keeper</span>
        </Link>

        <ul className="flex items-center gap-4 md:gap-8">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="voice-record text-[0.62rem] uppercase leading-none tracking-[0.14em] text-paper/70 transition-colors duration-300 hover:text-paper md:text-[0.7rem]"
                aria-current={path === l.href ? 'page' : undefined}
              >
                <span className={path === l.href ? 'border-b border-paper pb-1' : ''}>{l.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
