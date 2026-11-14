import './globals.css';
import type { Metadata } from 'next';
import { AppProvider } from '@/lib/context';
import { StockNavigationProvider } from '@/components/portfolio/stock-navigation';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { transparencyInitScript } from '@/lib/appearance-preferences';

export const metadata: Metadata = {
  title: 'Stocks Status',
  description: 'Advanced stock portfolio tracker with analytics',
  icons: {
    icon: [
      { url: '/brand/livestocks.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    shortcut: '/brand/favicon-32.png',
    apple: { url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: transparencyInitScript }} /></head>
      <body className="font-sans">
        <ThemeProvider>
          <AppProvider>
            <StockNavigationProvider>{children}</StockNavigationProvider>
            <Toaster />
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
