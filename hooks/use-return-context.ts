'use client';

import { useEffect } from 'react';
import { RETURN_CONTEXT_KEY } from '@/lib/navigation-context';

/** Wait for the original card to exist before restoring keyboard focus and scroll. */
export function useReturnContext(ready = true) {
  useEffect(() => {
    if (!ready) return;
    let context: { url: string; scrollY: number; focusId: string };
    try {
      const raw = sessionStorage.getItem(RETURN_CONTEXT_KEY);
      if (!raw) return;
      context = JSON.parse(raw);
      if (context.url !== `${window.location.pathname}${window.location.search}`) return;
    } catch { return; }
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      const target = document.getElementById(context.focusId);
      if (!target && attempts++ < 30) {
        frame = requestAnimationFrame(restore);
        return;
      }
      if (!target) return;
      target.focus({ preventScroll: true });
      window.scrollTo({ top: Number.isFinite(context.scrollY) ? context.scrollY : 0, behavior: 'instant' });
      try { sessionStorage.removeItem(RETURN_CONTEXT_KEY); } catch { /* optional storage */ }
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [ready]);
}
