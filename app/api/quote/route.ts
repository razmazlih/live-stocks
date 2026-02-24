import { NextRequest, NextResponse } from 'next/server';
import { fetchWithRetry, HttpStatusError } from '@/lib/http';
import { FINNHUB_BASE_URL } from '@/lib/services/finnhub';
import { getSupabaseClient } from '@/lib/supabase';
import { StockQuote } from '@/types';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };
const QUOTE_CACHE_TTL_MS = 60_000;

type CachedQuoteEntry = {
  quote: StockQuote;
  expiresAt: number;
};

const quoteCache = new Map<string, CachedQuoteEntry>();
const inFlightQuotes = new Map<string, Promise<StockQuote>>();

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    let token = searchParams.get('token');
    const forceRefresh = searchParams.get('forceRefresh') === '1';

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!token) {
      let supabase;
      try {
        supabase = getSupabaseClient();
      } catch (error) {
        console.error('Supabase client initialization failed:', error);
        return NextResponse.json(
          { error: 'Supabase client is not configured.' },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }

      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('finnhub_token')
        .limit(1)
        .maybeSingle();

      if (settingsError && settingsError.code !== 'PGRST116') {
        console.error('Failed to load settings for Finnhub token:', settingsError);
        return NextResponse.json(
          { error: 'Failed to load Finnhub token configuration' },
          { status: 500, headers: NO_STORE_HEADERS }
        );
      }

      token = settingsData?.finnhub_token || process.env.FINNHUB_TOKEN || undefined;
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Finnhub token is not configured' },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }

    const normalizedSymbol = symbol.toUpperCase();
    const cacheKey = `${normalizedSymbol}:${token}`;
    const now = Date.now();
    const cached = forceRefresh ? null : quoteCache.get(cacheKey);

    if (forceRefresh) {
      quoteCache.delete(cacheKey);
      inFlightQuotes.delete(cacheKey);
    }

    if (cached && cached.expiresAt > now) {
      return NextResponse.json(cached.quote, { headers: NO_STORE_HEADERS });
    }

    let inFlight = inFlightQuotes.get(cacheKey);
    if (!inFlight) {
      inFlight = (async () => {
        const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(normalizedSymbol)}&token=${token}`;
        const response = await fetchWithRetry(url, { cache: 'no-store' });
        return (await response.json()) as StockQuote;
      })();
      inFlightQuotes.set(cacheKey, inFlight);
    }

    let data: StockQuote;
    try {
      data = await inFlight;
    } finally {
      inFlightQuotes.delete(cacheKey);
    }

    if (data.c === 0 || data.c === undefined) {
      return NextResponse.json(
        { error: 'Invalid symbol or no data available' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    quoteCache.set(cacheKey, {
      quote: data,
      expiresAt: now + QUOTE_CACHE_TTL_MS,
    });

    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof HttpStatusError) {
      if (error.status === 429) {
        const headers: Record<string, string> = { ...NO_STORE_HEADERS };
        if (typeof error.retryAfterSeconds === 'number') {
          headers['Retry-After'] = String(error.retryAfterSeconds);
        }

        return NextResponse.json(
          { error: 'Quote rate limit exceeded. Please retry shortly.' },
          { status: 429, headers }
        );
      }

      return NextResponse.json(
        { error: `Upstream quote provider returned HTTP ${error.status}` },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }

    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
