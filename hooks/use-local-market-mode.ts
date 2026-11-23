'use client';

import { useSyncExternalStore } from 'react';
import { canChooseLocalMarketMode, DEMO_SCENARIO_EVENT, readLocalMarketMode } from '@/lib/demo/review';

function subscribe(onChange: () => void) {
  window.addEventListener(DEMO_SCENARIO_EVENT, onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener(DEMO_SCENARIO_EVENT, onChange);
    window.removeEventListener('popstate', onChange);
  };
}

const getSnapshot = () => canChooseLocalMarketMode() ? readLocalMarketMode() : null;
const getServerSnapshot = () => null;

export function useLocalMarketMode() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
