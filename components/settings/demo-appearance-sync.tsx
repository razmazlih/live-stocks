'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { useAppearance } from '@/components/theme-provider';
import { readDemoPreferences } from '@/lib/demo/client';

/** Apply the shared demo look without replacing the personal browser's preference. */
export function DemoAppearanceSync() {
  const { theme, setTheme } = useTheme();
  const { reduceTransparency, setReduceTransparency } = useAppearance();
  const access = useRef({ theme, reduceTransparency, setTheme, setReduceTransparency });
  useEffect(() => { access.current = { theme, reduceTransparency, setTheme, setReduceTransparency }; }, [theme, reduceTransparency, setTheme, setReduceTransparency]);
  useEffect(() => {
    const backupKey = 'livestocks:demo:appearance-before';
    let original = { theme: access.current.theme ?? 'system', reduceTransparency: access.current.reduceTransparency };
    try {
      const saved = JSON.parse(sessionStorage.getItem(backupKey) ?? 'null') as typeof original | null;
      if (saved && ['light', 'dark', 'system'].includes(saved.theme) && typeof saved.reduceTransparency === 'boolean') original = saved;
      else sessionStorage.setItem(backupKey, JSON.stringify(original));
    } catch { /* Restoring the current session remains possible without storage. */ }
    let active = true;
    const refresh = async () => {
      try {
        const preferences = await readDemoPreferences();
        if (!active) return;
        access.current.setTheme(preferences.theme ?? 'system');
        access.current.setReduceTransparency(preferences.reduceTransparency ?? false);
      } catch { /* Settings still show an explicit error if the local account cannot be saved. */ }
    };
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      access.current.setTheme(original.theme);
      access.current.setReduceTransparency(original.reduceTransparency);
      try { sessionStorage.removeItem(backupKey); } catch { /* Storage may be disabled. */ }
    };
  }, []);
  return null;
}
