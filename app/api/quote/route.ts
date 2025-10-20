import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { StockQuote } from '@/types';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) return response;
      if (response.status === 429 && i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        continue;
      }
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries reached');
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    let token = searchParams.get('token');

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol parameter is required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!token) {
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

    const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
    const response = await fetchWithRetry(url);
    const data: StockQuote = await response.json();

    if (data.c === 0 || data.c === undefined) {
      return NextResponse.json(
        { error: 'Invalid symbol or no data available' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Quote API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
