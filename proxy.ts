import { hasLocalDemoSession, demoApiResponse } from '@/lib/demo/server';
import { NextRequest, NextResponse } from 'next/server';
import { getBetterAuthSession } from '@/lib/auth/better-auth';
import { isPublicInformationPath, isPublicAuthPath } from '@/lib/public-routes';
import { getPublicPublisher } from '@/lib/public-publisher';
import { maintenanceResponse } from '@/lib/maintenance';

export async function proxy(request: NextRequest) {
  const maintenance = maintenanceResponse(request);
  if (maintenance) return maintenance;
  const pathname = request.nextUrl.pathname;
  if (hasLocalDemoSession(request) && pathname !== '/api/local-demo' && !pathname.startsWith('/api/local-demo/')) {
    if (pathname.startsWith('/api/')) return demoApiResponse(request);
    if (!pathname.startsWith('/oauth/') && !pathname.startsWith('/account/')) return NextResponse.next();
  }
  // APIs verify their own web, MCP, or widget credentials at the route boundary.
  if (pathname.startsWith('/api/') || pathname.startsWith('/.well-known/')) return NextResponse.next();

  if (isPublicInformationPath(pathname)) {
    if (getPublicPublisher()) return NextResponse.next();
    return new NextResponse('<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LiveStocks</title></head><body><main><h1>LiveStocks</h1><p>מידע השירות עדיין אינו זמין לפרסום.</p><p lang="en" dir="ltr">Service information is not yet available for publication.</p><a href="/sign-in">חזרה לכניסה / Back to sign-in</a></main></body></html>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }

  if (isPublicAuthPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  let session;
  try { session = await getBetterAuthSession(new Headers(request.headers)); } catch { /* Fail closed. */ }
  if (!session?.user?.id || !session.user.emailVerified) {
    const target = new URL('/sign-in', request.url);
    target.searchParams.set('returnTo', pathname + request.nextUrl.search);
    return NextResponse.redirect(target);
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'private, no-store');
  if (pathname === '/oauth/consent' || pathname === '/account/sign-in-methods/complete' || pathname === '/account/owner-confirmation') response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|brand/).*)'],
};
