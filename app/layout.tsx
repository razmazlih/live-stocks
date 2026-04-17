import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Assistant } from 'next/font/google';

import { AppProvider } from '@/lib/context';
import { Toaster } from '@/components/ui/sonner';
import { AppNavigation } from '@/components/navigation/app-navigation';
import { HeroUiProvider } from '@/components/providers/heroui-provider';

const assistant = Assistant({
  subsets: ['latin', 'hebrew'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-app',
});

export const metadata: Metadata = {
  title: 'Stocks Status | Portfolio Intelligence',
  description: 'Advanced stock portfolio tracker with charts, positions, and portfolio analytics',
  icons: {
    icon: 'https://res.cloudinary.com/dvdgfcniz/image/upload/c_crop,w_167,h_167,ar_1:1/v1761288262/image_sa6vpb.jpg',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const localeCookie = cookieStore.get('locale')?.value;
  const initialLocale = localeCookie === 'en' ? 'en' : 'he';
  const dir = initialLocale === 'he' ? 'rtl' : 'ltr';

  return (
    <html lang={initialLocale} dir={dir}>
      <body
        className={`${assistant.variable} ${assistant.className} app-root text-[var(--color-primary-900)] antialiased overflow-x-clip overscroll-x-none`}
      >
        <HeroUiProvider>
          <AppProvider initialLocale={initialLocale}>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-[max(1rem,env(safe-area-inset-left))] focus:top-[max(1rem,env(safe-area-inset-top))] focus:z-[100] focus:rounded-full focus:border focus:border-[color:var(--color-slate-200)]/80 focus:bg-[color:var(--color-neutral-white)]/98 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--color-primary-900)] focus:shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-emerald-300)] focus:ring-offset-2 focus:ring-offset-[color:var(--color-primary-050)]"
            >
              דלג לתוכן הראשי / Skip to main content
            </a>
            <AppNavigation />
            <main
              id="main-content"
              className="relative isolate min-w-0 overflow-x-clip pb-[calc(var(--page-bottom-clearance)+env(safe-area-inset-bottom))] md:pb-0 md:pt-[6.75rem]"
            >
              {children}
            </main>
            <Toaster />
          </AppProvider>
        </HeroUiProvider>
      </body>
    </html>
  );
}
