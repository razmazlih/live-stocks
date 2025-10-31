import { NextRequest, NextResponse } from 'next/server';
import { fetchFinnhubStockQuote } from '@/lib/services/finnhub';
import { getSupabaseClient } from '@/lib/supabase';
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

    const result = await fetchFinnhubStockQuote(symbol, { token, init: { cache: 'no-store' } });

    if (!result) {
      return NextResponse.json(
        { error: 'Invalid symbol or no data available' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const { quote } = result;

    if (quote.c === 0 || quote.c === undefined) {
      return NextResponse.json(
        { error: 'Invalid symbol or no data available' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(quote, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
