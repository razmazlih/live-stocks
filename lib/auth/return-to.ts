/** Accept only an application-relative destination, never a different origin. */
export function safeSignInReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://livestocks.invalid');
    if (url.origin !== 'https://livestocks.invalid') return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/'; }
}
