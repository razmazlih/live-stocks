import { NextRequest, NextResponse } from 'next/server';
import { localDemoRequestOrigin, localDemoOriginAllowed } from '@/lib/demo/server';
import { DEMO_COOKIE } from '@/lib/demo/data';

export async function POST(request: NextRequest) {
  if (!localDemoRequestOrigin(request)) return new NextResponse(null, { status: 404 });
  if (!localDemoOriginAllowed(request)) return new NextResponse(null, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(DEMO_COOKIE, '1', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 60 * 60 * 8 });
  return response;
}
export async function DELETE(request: NextRequest) {
  if (!localDemoRequestOrigin(request)) return new NextResponse(null, { status: 404 });
  if (!localDemoOriginAllowed(request)) return new NextResponse(null, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
