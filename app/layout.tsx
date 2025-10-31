import './globals.css';
import type { Metadata } from 'next';
import { AppProvider } from '@/lib/context';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Stocks Status',
  description: 'Advanced stock portfolio tracker with analytics',
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
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <AppProvider>
            {children}
            <Toaster />
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
