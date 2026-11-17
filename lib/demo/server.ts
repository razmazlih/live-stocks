import { NextRequest, NextResponse } from 'next/server';
import { DEMO_COOKIE, demoDashboard, demoTable, demoUser } from './data';

export function localDemoEnabled() { return process.env.NODE_ENV === 'development'; }
export function isLoopbackHost(hostname: string) { return ['localhost', '127.0.0.1', '[::1]'].includes(hostname); }
export function hasLocalDemoSession(request: NextRequest) {
  return localDemoEnabled() && isLoopbackHost(request.nextUrl.hostname) && request.cookies.get(DEMO_COOKIE)?.value === '1';
}
const headers = { 'Cache-Control': 'private, no-store' };
export function demoApiResponse(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  if (request.method !== 'GET') return NextResponse.json({ error: 'חשבון הדמו הוא לתצוגה בלבד. / Demo is read-only.', message: 'חשבון הדמו הוא לתצוגה בלבד. / Demo is read-only.', code: 'DEMO_READ_ONLY' }, { status: 403, headers });
  if (path === '/api/account/session') return NextResponse.json({ configured: true, user: demoUser }, { headers });
  if (path === '/api/portfolio/dashboard') return NextResponse.json(demoDashboard(), { headers });
  if (path.startsWith('/api/local-demo/rest/v1/')) {
    const table = path.split('/').at(-1)!;
    let rows = demoTable(table);
    for (const [key, value] of request.nextUrl.searchParams) if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
    const single = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
    return NextResponse.json(single ? rows[0] ?? null : rows, { headers });
  }
  if (path === '/api/account/link/recovery-status') return NextResponse.json({ pending: false }, { headers });
  if (path === '/api/account/credentials') return NextResponse.json({ configured: false }, { headers });
  return NextResponse.json({ error: 'פעולה זו אינה זמינה בדמו. / Unavailable in demo.' }, { status: 403, headers });
}
