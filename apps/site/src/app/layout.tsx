import type { Metadata } from 'next';
import { Fraunces, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/**
 * Three faces, two voices.
 *
 * Fraunces carries anything the Mind SAID — it is a variable serif that reads antique and
 * contemporary at once, which is the register Keeper's replies are actually written in.
 * IBM Plex Mono carries anything the system RECORDED: timestamps, ids, confidence, reasoning.
 * Instrument Sans stays out of the way in between. That split is true to the product, not a
 * styling choice — the moderation log really does have two authors.
 */
const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  axes: ['SOFT', 'WONK', 'opsz'],
  display: 'swap',
});
const body = Instrument_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://dashboard-chi-one-92.vercel.app'),
  title: 'Keeper — it remembers who came back',
  description:
    'A community steward that treats every member as an ongoing relationship. It picked up a thread 52 hours after it died, without being asked.',
  icons: { icon: '/brand/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="grain">
        <a
          href="#main"
          className="voice-record t-label sr-only focus:not-sr-only focus:fixed focus:left-6 focus:top-6 focus:z-[70] focus:rounded focus:bg-warm focus:px-4 focus:py-3 focus:text-void"
        >
          Skip to content
        </a>
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
