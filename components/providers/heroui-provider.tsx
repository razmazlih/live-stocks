'use client';

import type { ReactNode } from 'react';
import { HeroUIProvider } from '@heroui/react';

interface HeroUiProviderProps {
  children: ReactNode;
}

export function HeroUiProvider({ children }: HeroUiProviderProps) {
  return <HeroUIProvider>{children}</HeroUIProvider>;
}
