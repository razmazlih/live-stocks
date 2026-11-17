import { NextRequest, NextResponse } from 'next/server';
import { localDemoEnabled, isLoopbackHost } from '@/lib/demo/server';
import { DEMO_COOKIE } from '@/lib/demo/data';

export async function POST(request: NextRequest) {
  if (!localDemoEnabled() || !isLoopbackHost(request.nextUrl.hostname)) return new NextResponse(null, { status: 404 });
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return new NextResponse(null, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(DEMO_COOKIE, '1', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 8 });
  return response;
}
export async function DELETE(request: NextRequest) {
  if (!localDemoEnabled() || !isLoopbackHost(request.nextUrl.hostname)) return new NextResponse(null, { status: 404 });
  if (request.headers.get('origin') !== new URL(request.url).origin) return new NextResponse(null, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
