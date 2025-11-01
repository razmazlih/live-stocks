import '../styles/globals.css';
import type { Metadata } from 'next';
import Providers from './providers';
import { AppProvider } from '@/lib/context';
import { Toaster } from '@/components/ui/sonner';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>
          <AppProvider>
            {children}
            <Toaster />
          </AppProvider>
        </Providers>
      </body>
    </html>
  );
}
