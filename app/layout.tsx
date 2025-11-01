import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { AppProvider } from '@/lib/context';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Stocks Status',
  description: 'Advanced stock portfolio tracker with analytics',
  icons: {
    icon: 'https://res.cloudinary.com/dvdgfcniz/image/upload/c_crop,w_167,h_167,ar_1:1/v1761288262/image_sa6vpb.jpg',
  },
  other: {
    'color-scheme': 'dark light',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <Script
          id="theme-sync"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(() => {
              try {
                const root = document.documentElement;
                const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
                const applyTheme = (isDark) => {
                  root.classList.toggle('dark', Boolean(isDark));
                  root.style.colorScheme = isDark ? 'dark' : 'light';
                };
                applyTheme(mediaQuery.matches);
                const listener = (event) => applyTheme(event.matches);
                if (typeof mediaQuery.addEventListener === 'function') {
                  mediaQuery.addEventListener('change', listener);
                } else if (typeof mediaQuery.addListener === 'function') {
                  mediaQuery.addListener(listener);
                }
              } catch (_) {
                /* no-op */
              }
            })();`,
          }}
        />
        <AppProvider>
          {children}
          <Toaster />
        </AppProvider>
      </body>
    </html>
  );
}
