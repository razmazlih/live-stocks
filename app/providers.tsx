'use client';

import { ReactNode } from 'react';
import { HeroUIProvider } from '@heroui/react';
import { useRouter } from 'next/navigation';

import { AppProvider } from '@/lib/context';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  const router = useRouter();

  return (
    <HeroUIProvider locale="he-IL" navigate={router.push}>
      <AppProvider>{children}</AppProvider>
    </HeroUIProvider>
  );
}
