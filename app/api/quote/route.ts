import { NextRequest, NextResponse } from 'next/server';
import { fetchFinnhubQuote, getCachedFinnhubQuote } from '@/lib/services/finnhub';
import { getSupabaseClient } from '@/lib/supabase';
import { StockQuote } from '@/types';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    let token = searchParams.get('token');

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

    const quoteResult = await fetchFinnhubQuote(symbol, { token, init: { cache: 'no-store' } });
    const cachedQuote = getCachedFinnhubQuote(symbol, token);

    if (quoteResult && cachedQuote) {
      const payload = { ...cachedQuote, source: quoteResult.source ?? 'live' };
      return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
    }

    if (!quoteResult) {
      if (cachedQuote) {
        return NextResponse.json({ ...cachedQuote, source: 'cache' as const }, { headers: NO_STORE_HEADERS });
      }

      return NextResponse.json(
        { error: 'Invalid symbol or no data available' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const fallback = {
      c: quoteResult.price,
      d: quoteResult.dailyChange,
      t: quoteResult.timestamp,
      fetchedAt: quoteResult.timestamp ? quoteResult.timestamp * 1000 : Date.now(),
      source: quoteResult.source ?? 'live',
    } satisfies Partial<StockQuote> & { fetchedAt: number; source: 'live' | 'cache' };

    return NextResponse.json(fallback, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
