import { NextRequest, NextResponse } from 'next/server';
import { fetchWithRetry } from '@/lib/http';
import { CandleData } from '@/types';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

function buildYahooChartUrl(
  symbol: string,
  fromSeconds: number,
  toSeconds: number,
  interval: string,
): URL {
  const endpoint = new URL(YAHOO_BASE_URL);
  endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${symbol}`;
  endpoint.searchParams.set('period1', fromSeconds.toString());
  endpoint.searchParams.set('period2', toSeconds.toString());
  endpoint.searchParams.set('interval', interval);
  endpoint.searchParams.set('includeAdjustedClose', 'true');
  return endpoint;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

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
    const symbolParam = params.get('symbol');
    const fromParam = params.get('from');
    const toParam = params.get('to');
    const resolutionParam = params.get('resolution');

    const symbol = symbolParam?.trim().toUpperCase();
    const from = fromParam?.trim();
    const to = toParam?.trim();
    const resolution = resolutionParam?.trim().toUpperCase() || 'D';

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
    const endpoint = buildYahooChartUrl(symbol, fromSeconds, toSeconds, interval);

    const response = await fetchWithRetry(
      endpoint,
      { cache: 'no-store' },
      { shouldRetry: response => !response.ok },
    );
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
