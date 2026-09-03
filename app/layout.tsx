import type { Metadata } from 'next';
import { EB_Garamond, Geist } from 'next/font/google';
import './globals.css';
import './experience.css';

const display = EB_Garamond({ variable: '--font-display', subsets: ['latin'], display: 'swap' });
const body = Geist({ variable: '--font-body', subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_APP_ORIGIN ?? 'https://interview-copilot.example'),
  title: 'Torvi — Real-time help for every conversation',
  description: 'A consent-first desktop copilot for live answers, screen context, notes, decisions, and follow-through.',
  openGraph: {
    title: 'Torvi',
    description: 'Help during the conversation, not after it.',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'Torvi product preview' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Torvi',
    description: 'Help during the conversation, not after it.',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
