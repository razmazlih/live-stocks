'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const CHANGE_EVENT = 'livestocks:url-state';
const subscribe = (notify: () => void) => {
  window.addEventListener('popstate', notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener('popstate', notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
};
const snapshot = () => `${window.location.pathname}${window.location.search}`;
const serverSnapshot = () => '';

/** Native history updates retain input focus and avoid refetching route data. */
export function useUrlState<T>(parse: (params: URLSearchParams) => T) {
  const url = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const state = useMemo(() => parse(new URLSearchParams(url.split('?')[1] ?? '')), [parse, url]);
  const patch = useCallback((values: Record<string, string | number | null>) => {
    const params = new URLSearchParams(window.location.search);
    Object.entries(values).forEach(([key, value]) => {
      if (value === null || value === '') params.delete(key);
      else params.set(key, String(value));
    });
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [state, patch, url] as const;
}
