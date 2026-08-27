'use client';

/**
 * A thin mono rail. The nav is metadata about the site, so it is set in the machine voice — the
 * same face the moderation log uses for everything it recorded.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/proof', label: 'Proof' },
  { href: '/context', label: 'Context' },
  { href: '/memory', label: 'Memory' },
  { href: '/pricing', label: 'Pricing' },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="fixed inset-x-0 top-0 z-50 mix-blend-difference">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-5 md:px-10 md:py-6"
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
