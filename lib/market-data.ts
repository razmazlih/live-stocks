import { CandleData } from '@/types';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const DEFAULT_RETRY_DELAY = 1000;
const MAX_RETRIES = 3;

export class MarketDataError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MarketDataError';
    this.status = status;
  }
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES, delay = DEFAULT_RETRY_DELAY): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        return response;
      }

      lastError = new MarketDataError(`HTTP ${response.status}`, response.status);
    } catch (error) {
      lastError = error;
    }

    if (attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, attempt)));
    }
  }

  if (lastError instanceof MarketDataError) {
    throw lastError;
  }

  throw new MarketDataError('Failed to fetch data after retries', 502);
}

export function resolveInterval(resolution: string): string {
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

export async function fetchYahooCandles(
  symbol: string,
  fromSeconds: number,
  toSeconds: number,
  resolution = 'D'
): Promise<CandleData> {
  if (!symbol) {
    throw new MarketDataError('Symbol parameter is required', 400);
  }

  if (!Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) || fromSeconds >= toSeconds) {
    throw new MarketDataError('Invalid time range provided', 400);
  }

  const interval = resolveInterval(resolution);
  const url = `${YAHOO_BASE_URL}/${encodeURIComponent(symbol)}?period1=${fromSeconds}&period2=${toSeconds}&interval=${interval}&includeAdjustedClose=true`;

  const response = await fetchWithRetry(url);
  const data = (await response.json()) as YahooChartResponse;

  const result = data.chart?.result?.[0];
  if (!result || !result.timestamp?.length || !result.indicators?.quote?.length) {
    const description = data.chart?.error?.description || 'No data available';
    throw new MarketDataError(description, 404);
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
    throw new MarketDataError('No data available for the specified period', 404);
  }

  return {
    t: entries.map((item) => item.t),
    o: entries.map((item) => item.o),
    h: entries.map((item) => item.h),
    l: entries.map((item) => item.l),
    c: entries.map((item) => item.c),
    v: entries.map((item) => item.v),
    s: 'ok',
  };
}
