import { NextRequest, NextResponse } from 'next/server';
import { fetchWithRetry } from '@/lib/http';
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

async function fetchQuote(symbol: string, token: string, forceRefresh: boolean): Promise<StockQuote> {
  const normalizedSymbol = symbol.toUpperCase();
  const cacheKey = `${normalizedSymbol}:${token}`;
  const now = Date.now();

  if (forceRefresh) {
    quoteCache.delete(cacheKey);
    inFlightQuotes.delete(cacheKey);
  }

  const cached = quoteCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.quote;
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
    throw new Error('Invalid symbol or no data available');
  }

  quoteCache.set(cacheKey, {
    quote: data,
    expiresAt: now + QUOTE_CACHE_TTL_MS,
  });

  return data;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');
    let token = searchParams.get('token');
    const forceRefresh = searchParams.get('forceRefresh') === '1';

    if (!symbolsParam) {
      return NextResponse.json(
        { error: 'Symbols parameter is required' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const symbols = Array.from(
      new Set(
        symbolsParam
          .split(',')
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean),
      ),
    );

    if (!symbols.length) {
      return NextResponse.json(
        { error: 'No valid symbols were provided' },
        { status: 400, headers: NO_STORE_HEADERS },
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
          { status: 500, headers: NO_STORE_HEADERS },
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
          { status: 500, headers: NO_STORE_HEADERS },
        );
      }

      token = settingsData?.finnhub_token || process.env.FINNHUB_TOKEN || undefined;
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Finnhub token is not configured' },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const quotePairs = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const quote = await fetchQuote(symbol, token, forceRefresh);
          return [symbol, quote] as const;
        } catch (error) {
          console.error(`Failed to fetch quote for ${symbol}:`, error);
          return [symbol, null] as const;
        }
      }),
    );

    const quotes: Record<string, StockQuote> = {};
    quotePairs.forEach(([symbol, quote]) => {
      if (quote) {
        quotes[symbol] = quote;
      }
    });

    return NextResponse.json(
      { quotes },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error('Quotes API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quotes data' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
