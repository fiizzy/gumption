import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gumption',
  description: 'An agentic whiteboard: describe it, and watch it get sketched.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
