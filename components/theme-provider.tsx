'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { ThemeProvider as NextThemeProvider } from 'next-themes';
import { TRANSPARENCY_QUERY, TRANSPARENCY_STORAGE_KEY } from '@/lib/appearance-preferences';

interface AppearanceContextValue {
  reduceTransparency: boolean;
  systemReducesTransparency: boolean;
  ready: boolean;
  setReduceTransparency: (value: boolean) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const preferenceEvent = 'livestocks-appearance-change';
let sessionPreference = false;

function readTransparency() {
  try { return localStorage.getItem(TRANSPARENCY_STORAGE_KEY) === 'true'; }
  catch { return sessionPreference; }
}

function subscribePreference(callback: () => void) {
  function onStorage(event: StorageEvent) {
    if (event.key === TRANSPARENCY_STORAGE_KEY || event.key === null) callback();
  }
  window.addEventListener('storage', onStorage);
  window.addEventListener(preferenceEvent, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(preferenceEvent, callback);
  };
}

function subscribeSystemTransparency(callback: () => void) {
  const media = window.matchMedia(TRANSPARENCY_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

const serverFalse = () => false;
const clientReady = () => true;

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error('useAppearance requires ThemeProvider');
  return context;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const ready = useSyncExternalStore(subscribePreference, clientReady, serverFalse);
  const reduceTransparency = useSyncExternalStore(subscribePreference, readTransparency, serverFalse);
  const systemReducesTransparency = useSyncExternalStore(subscribeSystemTransparency, () => window.matchMedia(TRANSPARENCY_QUERY).matches, serverFalse);

  useEffect(() => {
    if (ready) document.documentElement.dataset.reduceTransparency = String(reduceTransparency || systemReducesTransparency);
  }, [ready, reduceTransparency, systemReducesTransparency]);

  function setReduceTransparency(value: boolean) {
    sessionPreference = value;
    try {
      localStorage.setItem(TRANSPARENCY_STORAGE_KEY, String(value));
    } catch {
      // The preference still applies for this session when storage is unavailable.
    }
    window.dispatchEvent(new Event(preferenceEvent));
  }

  return <NextThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="livestocks-theme">
    <AppearanceContext.Provider value={{ reduceTransparency, systemReducesTransparency, ready, setReduceTransparency }}>
      {children}
    </AppearanceContext.Provider>
  </NextThemeProvider>;
}
