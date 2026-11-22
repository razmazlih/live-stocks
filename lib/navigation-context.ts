const RETURN_PATHS = new Set(['/', '/positions', '/portfolio', '/watchlist']);

/** Only list routes can be stock return destinations; never accept external URLs. */
export function validateReturnTo(value: string | null | undefined, fallback = '/portfolio'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, 'https://livestocks.local');
    if (url.origin !== 'https://livestocks.local' || !RETURN_PATHS.has(url.pathname)) return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

export function buildStockHref(symbol: string, returnTo: string): string {
  return `/stock/${encodeURIComponent(symbol)}?${new URLSearchParams({ returnTo: validateReturnTo(returnTo) })}`;
}

export function buildTransactionHref(symbol: string, source?: string): string {
  const params = new URLSearchParams({ action: 'add', symbol: symbol.trim().toUpperCase() });
  if (source) params.set('source', source);
  return `/positions?${params}`;
}

export const RETURN_CONTEXT_KEY = 'livestocks:return-context';

export function rememberReturnContext(focusId: string): void {
  try {
    sessionStorage.setItem(RETURN_CONTEXT_KEY, JSON.stringify({
      url: `${window.location.pathname}${window.location.search}`,
      scrollY: window.scrollY,
      focusId,
    }));
  } catch { /* Navigation remains available when browser storage is disabled. */ }
}
