import { NextRequest, NextResponse } from 'next/server';
import { getAuth0 } from '@/lib/auth/auth0';
import { isPublicInformationPath } from '@/lib/public-routes';
import { getPublicPublisher } from '@/lib/public-publisher';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // APIs verify their own web, MCP, or widget credentials at the route boundary.
  if (pathname.startsWith('/api/') || pathname.startsWith('/.well-known/')) return NextResponse.next();

  if (isPublicInformationPath(pathname)) {
    if (getPublicPublisher()) return NextResponse.next();
    return new NextResponse('<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>LiveStocks</title></head><body><main><h1>LiveStocks</h1><p>מידע השירות עדיין אינו זמין לפרסום.</p><p lang="en" dir="ltr">Service information is not yet available for publication.</p><a href="/sign-in">חזרה לכניסה / Back to sign-in</a></main></body></html>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }

  const auth0 = getAuth0();
  if (!auth0) {
    if (pathname === '/sign-in') return NextResponse.next();
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  const response = await auth0.middleware(request);
  if (pathname.startsWith('/auth/') || pathname === '/sign-in') return response;

  const session = await auth0.getSession(request);
  if (!session?.user?.sub) {
    const target = new URL('/sign-in', request.url);
    target.searchParams.set('returnTo', pathname + request.nextUrl.search);
    return NextResponse.redirect(target);
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|brand/).*)'],
};
