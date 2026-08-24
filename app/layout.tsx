import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hours per week',
  description: 'A workshop instrument for seeing where a week goes.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The stack is full-bleed and the editor computes pxPerHour from the
  // viewport (§7.2); zoom would desynchronise the ruler from the bands.
  maximumScale: 1,
  themeColor: '#0e0e11',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
