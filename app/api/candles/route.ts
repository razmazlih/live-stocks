import { NextRequest, NextResponse } from 'next/server';
import { CandleData } from '@/types';
import { fetchYahooCandles, MarketDataError } from '@/lib/market-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const symbol = params.get('symbol');
    const from = params.get('from');
    const to = params.get('to');
    const resolution = params.get('resolution') || 'D';

    if (!symbol || !from || !to) {
      return NextResponse.json(
        { error: 'Symbol, from, and to parameters are required' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const fromSeconds = Number.parseInt(from, 10);
    const toSeconds = Number.parseInt(to, 10);

    if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || fromSeconds >= toSeconds) {
      return NextResponse.json(
        { error: 'Invalid time range provided' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    let candleData: CandleData;

    try {
      candleData = await fetchYahooCandles(symbol, fromSeconds, toSeconds, resolution);
    } catch (error) {
      if (error instanceof MarketDataError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status, headers: NO_STORE_HEADERS }
        );
      }

      throw error;
    }

    return NextResponse.json(candleData, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Candles API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candle data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
