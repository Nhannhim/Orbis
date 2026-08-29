import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.ORBIS_SITE_ORIGIN ?? 'http://localhost:3000'),
  title: 'Orbis — Physical intelligence, coordinated',
  description:
    'The coordination layer for machines that perceive, verify, and act together.',
  openGraph: {
    title: 'Orbis — Physical intelligence, coordinated',
    description:
      'The coordination layer for machines that perceive, verify, and act together.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Orbis — Physical intelligence, coordinated.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Orbis — Physical intelligence, coordinated',
    description:
      'The coordination layer for machines that perceive, verify, and act together.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
