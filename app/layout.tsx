import './globals.css';
import type { Metadata } from 'next';
import Toaster from '@/components/Toaster';
import QuickAddProvider from './quick-add/QuickAddProvider';
import React from 'react';

export const metadata: Metadata = {
  title: 'Clarity',
  description: 'Local-first Calendar + To-Do',
  manifest: '/manifest.webmanifest',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b1730' },
    { media: '(prefers-color-scheme: light)', color: '#f2f3f5' },
  ],
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/icons/icon-192.png' },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Clarity',
  },
  applicationName: 'Clarity',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const monthIdx = String(new Date().getMonth() + 1).padStart(2, '0');
  const initialBg = `/backgrounds/rich/month-${monthIdx}.svg`;
  const initialBgDark = `/backgrounds/rich-dark/month-${monthIdx}.svg`;
  return (
    <html lang="en" suppressHydrationWarning style={{ ['--clarity-app-bg' as any]: `url(${initialBg})` }}>
      <body className="min-h-screen">
        {/* Global app background overlay */}
        <div id="app-bg" className="app-bg" style={{ backgroundImage: 'var(--clarity-app-bg)' }} />
        <QuickAddProvider>
          <main className="w-full px-4 sm:px-6 lg:px-8">
            {children}
          </main>
          <Toaster />
        </QuickAddProvider>
      </body>
    </html>
  );
}
