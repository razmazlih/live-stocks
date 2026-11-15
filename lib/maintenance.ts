/** A deployment gate used while publishing issuer metadata before the atomic cutover. */
const DISCOVERY = new Set([
  '/api/auth/jwks',
  '/api/auth/.well-known/openid-configuration',
  '/api/auth/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server/api/auth',
  '/.well-known/oauth-protected-resource',
]);
const INFORMATION = new Set(['/about', '/privacy', '/terms']);

export function maintenanceResponse(request: Request): Response | null {
  if (process.env.LIVESTOCKS_MAINTENANCE !== 'true') return null;
  const pathname = new URL(request.url).pathname;
  if ((request.method === 'GET' || request.method === 'HEAD') && (
    DISCOVERY.has(pathname) || INFORMATION.has(pathname)
    || pathname.startsWith('/_next/static/') || pathname === '/favicon.ico'
  )) return null;
  const headers = { 'Cache-Control': 'private, no-store', 'Retry-After': '60', 'X-Robots-Tag': 'noindex',
    'Content-Type': pathname.startsWith('/api/') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8' };
  return new Response(pathname.startsWith('/api/')
    ? JSON.stringify({ code: 'MAINTENANCE', message: 'LiveStocks is temporarily unavailable' })
    : '<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LiveStocks</title><body style="font-family:system-ui;background:#10151f;color:#f1f5f9;padding:10vh 8vw"><main><h1>LiveStocks מתעדכן</h1><p>האתר בתחזוקה קצרה. אפשר לנסות שוב בעוד כמה דקות.</p><p lang="en" dir="ltr">LiveStocks is being updated. Please try again in a few minutes.</p></main></body></html>',
  { status: 503, headers });
}
