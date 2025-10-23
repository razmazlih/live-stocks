'use client';

import { HeroUIProvider } from '@heroui/react';
import { ReactNode } from 'react';

import { AppProvider } from '@/lib/context';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <HeroUIProvider>
      <AppProvider>{children}</AppProvider>
    </HeroUIProvider>
  );
}
