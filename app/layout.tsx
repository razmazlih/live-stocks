import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppProvider } from '@/lib/context';
import { Toaster } from '@/components/ui/sonner';
import { HeroUIProvider } from '@heroui/react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Stocks Status',
  description: 'Advanced stock portfolio tracker with analytics',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body className={`${inter.className} bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-foreground`}>
        <HeroUIProvider locale="he-IL">
          <AppProvider>
            <div className="min-h-screen bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-slate-950/80 text-foreground">
              {children}
            </div>
            <Toaster />
          </AppProvider>
        </HeroUIProvider>
      </body>
    </html>
  );
}
