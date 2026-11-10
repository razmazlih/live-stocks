import { NextRequest, NextResponse } from 'next/server';
import { FINNHUB_BASE_URL } from '@/lib/services/finnhub';
import { FinnhubConfigError, resolveFinnhubToken } from '@/lib/services/finnhub-cache';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  if ((!query && !symbol) || (query?.length ?? 0) > 80 || (symbol && !/^[A-Z0-9.^:=/-]{1,30}$/.test(symbol))) {
    return NextResponse.json({ error: 'A valid query or symbol is required' }, { status: 400, headers });
  }

  try {
    const token = await resolveFinnhubToken();
    const url = new URL(`${FINNHUB_BASE_URL}/${symbol ? 'stock/profile2' : 'search'}`);
    url.searchParams.set(symbol ? 'symbol' : 'q', symbol || query!);
    const response = await fetch(url, {
      headers: { 'X-Finnhub-Token': token },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Asset lookup is temporarily unavailable' }, { status: response.status === 429 ? 429 : 502, headers });
    }
    const data = await response.json();
    if (symbol) {
      if (typeof data.name !== 'string' || !data.name.trim()) {
        return NextResponse.json({ error: 'No company profile found' }, { status: 404, headers });
      }
      return NextResponse.json({ symbol, display: data.name, imageUrl: typeof data.logo === 'string' && data.logo.startsWith('https://') ? data.logo : '' }, { headers });
    }
    const results = Array.isArray(data.result) ? data.result : [];
    return NextResponse.json({ results: results
      .filter((item: { symbol?: unknown; description?: unknown }) => typeof item.symbol === 'string' && typeof item.description === 'string' && /^[A-Z0-9.^:=/-]{1,30}$/.test(item.symbol))
      .slice(0, 8)
      .map((item: { symbol: string; description: string }) => ({ symbol: item.symbol, display: item.description, imageUrl: '' })) }, { headers });
  } catch (error) {
    return NextResponse.json({ error: 'Asset lookup is temporarily unavailable' }, { status: error instanceof FinnhubConfigError ? error.status : 502, headers });
  }
}
