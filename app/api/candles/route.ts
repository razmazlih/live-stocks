import { NextRequest, NextResponse } from 'next/server';
import { CandleData } from '@/types';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}`);
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError ?? new Error('Max retries reached');
}

function resolveInterval(resolution: string): string {
  switch (resolution) {
    case '60':
      return '1h';
    case 'W':
      return '1wk';
    case 'M':
      return '1mo';
    default:
      return '1d';
  }
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          close?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    };
  };
}

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

    const interval = resolveInterval(resolution);
    const url = `${YAHOO_BASE_URL}/${encodeURIComponent(symbol)}?period1=${fromSeconds}&period2=${toSeconds}&interval=${interval}&includeAdjustedClose=true`;

    const response = await fetchWithRetry(url);
    const data = (await response.json()) as YahooChartResponse;

    const result = data.chart?.result?.[0];
    if (!result || !result.timestamp?.length || !result.indicators?.quote?.length) {
      const description = data.chart?.error?.description || 'No data available';
      return NextResponse.json(
        { error: description },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0] ?? {};

    const entries: Array<{
      t: number;
      o: number;
      h: number;
      l: number;
      c: number;
      v: number;
    }> = [];

    const length = Math.max(
      timestamps.length,
      quote.open?.length ?? 0,
      quote.high?.length ?? 0,
      quote.low?.length ?? 0,
      quote.close?.length ?? 0,
      quote.volume?.length ?? 0
    );

    for (let i = 0; i < length; i++) {
      const timestamp = timestamps[i];
      if (typeof timestamp !== 'number') {
        continue;
      }

      if (timestamp < fromSeconds || timestamp > toSeconds) {
        continue;
      }

      const open = quote.open?.[i] ?? null;
      const high = quote.high?.[i] ?? null;
      const low = quote.low?.[i] ?? null;
      const close = quote.close?.[i] ?? null;
      const volume = quote.volume?.[i] ?? null;

      if (
        open === null ||
        high === null ||
        low === null ||
        close === null ||
        volume === null
      ) {
        continue;
      }

      entries.push({
        t: timestamp,
        o: open,
        h: high,
        l: low,
        c: close,
        v: volume,
      });
    }

    if (!entries.length) {
      return NextResponse.json(
        { error: 'No data available for the specified period' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const candleData: CandleData = {
      t: entries.map((item) => item.t),
      o: entries.map((item) => item.o),
      h: entries.map((item) => item.h),
      l: entries.map((item) => item.l),
      c: entries.map((item) => item.c),
      v: entries.map((item) => item.v),
      s: 'ok',
    };

    return NextResponse.json(candleData, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('Candles API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candle data' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
