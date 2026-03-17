import './globals.css';
import type { Metadata } from 'next';
import { Assistant } from 'next/font/google';

import { AppProvider } from '@/lib/context';
import { Toaster } from '@/components/ui/sonner';
import { AppNavigation } from '@/components/navigation/app-navigation';

const assistant = Assistant({
  subsets: ['latin', 'hebrew'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Stocks Status | Portfolio Intelligence',
  description: 'Advanced stock portfolio tracker with charts, positions, and portfolio analytics',
  icons: {
    icon: 'https://res.cloudinary.com/dvdgfcniz/image/upload/c_crop,w_167,h_167,ar_1:1/v1761288262/image_sa6vpb.jpg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body
        className={`${assistant.className} bg-[var(--color-primary-050)] text-[var(--color-primary-900)] antialiased`}
      >
        <AppProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:border focus:border-[color:var(--color-slate-200)]/80 focus:bg-[color:var(--color-neutral-white)]/98 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--color-primary-900)] focus:shadow-sm focus:outline-none"
          >
            דלג לתוכן הראשי / Skip to main content
          </a>
          <AppNavigation />
          <main
            id="main-content"
            className="relative isolate pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0"
          >
            {children}
          </main>
          <Toaster />
        </AppProvider>
      </body>
    </html>
  );
}
