import './globals.css';
import type { Metadata } from 'next';
import { AppProvider } from '@/lib/context';
import { Toaster } from '@/components/ui/sonner';

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
    <html lang="he" dir="rtl">
      <body className="font-sans antialiased">
        <div className="liquid-background">
          <div className="liquid-background__gradient" />
          <div className="liquid-background__orb liquid-background__orb--primary" />
          <div className="liquid-background__orb liquid-background__orb--accent" />
          <div className="liquid-background__sheen" />
        </div>
        <AppProvider>
          <div className="relative z-10 flex min-h-screen flex-col">
            {children}
            <Toaster />
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
