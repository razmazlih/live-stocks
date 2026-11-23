import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/components/auth/auth-provider';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { transparencyInitScript } from '@/lib/appearance-preferences';
import { initialOverviewLayout } from '@/lib/overview-layout-init';
import { entryLocaleInitScript } from '@/lib/entry-locale';
import { getAuthPublicOptions } from '@/lib/auth/better-auth-config';

export const metadata: Metadata = {
  title: 'LiveStocks',
  description: 'Track your investment portfolio, transactions and performance against your personal target.',
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
      <head><script dangerouslySetInnerHTML={{ __html: transparencyInitScript + ';' + entryLocaleInitScript(process.env.NODE_ENV === 'development') + initialOverviewLayout }} /></head>
      <body className="font-sans">
        <ThemeProvider>
          <AuthProvider options={getAuthPublicOptions()}>{children}</AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
