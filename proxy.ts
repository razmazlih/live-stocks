import { NextRequest, NextResponse } from 'next/server';
import { getAuth0 } from '@/lib/auth/auth0';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // APIs verify their own web, MCP, or widget credentials at the route boundary.
  if (pathname.startsWith('/api/') || pathname.startsWith('/.well-known/')) return NextResponse.next();

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
