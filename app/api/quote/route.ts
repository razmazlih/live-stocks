import { requireApiPrincipal, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { NextRequest, NextResponse } from 'next/server';
import { HttpStatusError } from '@/lib/http';
import {
  fetchFinnhubQuoteCached,
  FinnhubConfigError,
  resolveFinnhubToken,
} from '@/lib/services/finnhub-cache';

const NO_STORE_HEADERS = PRIVATE_HEADERS;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const principal = await requireApiPrincipal(request);
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const forceRefresh = searchParams.get('forceRefresh') === '1';

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const token = await resolveFinnhubToken(principal.userId);
    const quote = await fetchFinnhubQuoteCached(symbol, token, { forceRefresh });

    return NextResponse.json(quote, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const authResponse = authenticationResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof FinnhubConfigError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: NO_STORE_HEADERS },
      );
    }

    if (error instanceof HttpStatusError) {
      if (error.status === 429) {
        const headers: Record<string, string> = { ...NO_STORE_HEADERS };
        if (typeof error.retryAfterSeconds === 'number') {
          headers['Retry-After'] = String(error.retryAfterSeconds);
        }

        return NextResponse.json(
          { error: 'Quote rate limit exceeded. Please retry shortly.' },
          { status: 429, headers },
        );
      }

      return NextResponse.json(
        { error: `Upstream quote provider returned HTTP ${error.status}` },
        { status: error.status, headers: NO_STORE_HEADERS },
      );
    }

    if (error instanceof Error && error.message === 'Invalid symbol or no data available') {
      return NextResponse.json(
        { error: error.message },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote data' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
