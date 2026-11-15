/** Preserve only parameters covered by Better Auth's signed authorization query. */
export function signedOAuthQuery(search: string | URLSearchParams): string | null {
  const params = new URLSearchParams(search);
  if (!params.has('sig') || !params.has('ba_param')) return null;
  const names = new Set(['sig', 'ba_param', ...params.getAll('ba_param')]);
  return new URLSearchParams([...params].filter(([key]) => names.has(key))).toString();
}

/** Only a checked provider response may leave this site for the reviewed callback. */
export function validConsentDestination(value: unknown, callback: string, origin: string): string | null {
  if (typeof value !== 'string' || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, origin), expected = new URL(callback);
    if (url.username || url.password || url.hash) return null;
    if (url.origin === origin && ['/sign-in', '/oauth/consent', '/api/auth/error'].includes(url.pathname)) return url.href;
    if (url.origin !== expected.origin || url.pathname !== expected.pathname) return null;
    for (const [key, val] of expected.searchParams) if (url.searchParams.get(key) !== val) return null;
    return url.href;
  } catch { return null; }
}
