import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Keeper — Community Steward',
  description:
    'A persistent community steward powered by a Mind. Its memory is not in this dashboard.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
