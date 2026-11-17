import { NextRequest, NextResponse } from 'next/server';
import { demoAssets, demoAsset, demoQuote } from './assets';
import { DEMO_COOKIE, demoDashboard, demoTable, demoUser } from './data';

export function localDemoEnabled() { return process.env.NODE_ENV === 'development'; }
export function isLoopbackHost(hostname: string) { return ['localhost', '127.0.0.1', '[::1]'].includes(hostname); }
export function hasLocalDemoSession(request: NextRequest) {
  return localDemoEnabled() && isLoopbackHost(request.nextUrl.hostname) && request.cookies.get(DEMO_COOKIE)?.value === '1';
}
const headers = { 'Cache-Control': 'private, no-store' };
export function demoApiResponse(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  if (request.method !== 'GET') return NextResponse.json({ error: 'שינויים בדמו נשמרים בדפדפן בלבד, ולא בשרת. / Demo changes are saved only in your browser, never on the server.', message: 'שינויים בדמו נשמרים בדפדפן בלבד, ולא בשרת. / Demo changes are saved only in your browser, never on the server.', code: 'DEMO_READ_ONLY' }, { status: 403, headers });
  if (path === '/api/assets') {
    const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
    if (symbol) return NextResponse.json(demoAsset(symbol) ?? { error: 'No demo profile found' }, { status: demoAsset(symbol) ? 200 : 404, headers });
    const query = (request.nextUrl.searchParams.get('q') ?? '').trim().toUpperCase();
    return NextResponse.json({ results: demoAssets.filter(asset => `${asset.symbol} ${asset.display}`.toUpperCase().includes(query))
      .map(asset => demoAsset(asset.symbol)) }, { headers });
  }
  if (path === '/api/quotes') {
    const symbols = [...new Set((request.nextUrl.searchParams.get('symbols') ?? '').split(',').map(symbol => symbol.trim().toUpperCase()).filter(Boolean))].slice(0, 100);
    return NextResponse.json({ quotes: Object.fromEntries(symbols.map(symbol => [symbol, demoQuote(symbol)])) }, { headers });
  }
  if (path === '/api/quote') {
    const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
    return symbol && demoAsset(symbol) ? NextResponse.json(demoQuote(symbol), { headers })
      : NextResponse.json({ error: 'No synthetic quote for this symbol; enter a price manually.' }, { status: 404, headers });
  }
  if (path === '/api/exchange-rate') return NextResponse.json({ usdToIls: 3.65, timestamp: new Date().toISOString() }, { headers });
  if (path === '/api/candles') {
    const symbol = request.nextUrl.searchParams.get('symbol') ?? 'SPY';
    const now = Math.floor(Date.now() / 1000);
    const requestedFrom = Number(request.nextUrl.searchParams.get('from'));
    const requestedTo = Number(request.nextUrl.searchParams.get('to'));
    const to = Number.isFinite(requestedTo) && requestedTo > 0 ? Math.min(now, requestedTo) : now;
    const from = Number.isFinite(requestedFrom) && requestedFrom > 0 ? Math.min(requestedFrom, to) : to - 90 * 86400;
    const price = demoQuote(symbol).c;
    const t = Array.from({ length: 90 }, (_, index) => Math.round(from + (to - from) * index / 89));
    const c = t.map((_, index) => price * (0.9 + index / 890));
    return NextResponse.json({ s: 'ok', t, c, o: c, h: c, l: c, v: c.map(() => 1000) }, { headers });
  }
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
