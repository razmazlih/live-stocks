import 'server-only';

import { fetchWithRetry } from '@/lib/http';
import { CandleData } from '@/types';

const YAHOO_BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

type CandleResolution = 'D' | '60' | 'W' | 'M';

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

export class YahooCandlesError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'YahooCandlesError';
    this.status = status;
  }
}

function resolveInterval(resolution: CandleResolution): string {
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

export async function fetchYahooCandlesData(
  symbol: string,
  from: number,
  to: number,
  resolution: CandleResolution = 'D',
): Promise<CandleData> {
  const normalizedSymbol = symbol.trim();
  if (!normalizedSymbol) {
    throw new YahooCandlesError('Symbol parameter is required', 400);
  }

  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    throw new YahooCandlesError('Invalid time range provided', 400);
  }

  const interval = resolveInterval(resolution);
  const url = `${YAHOO_BASE_URL}/${encodeURIComponent(normalizedSymbol)}?period1=${Math.floor(from)}&period2=${Math.floor(to)}&interval=${interval}&includeAdjustedClose=true`;

  const response = await fetchWithRetry(
    url,
    { cache: 'no-store' },
    { shouldRetry: (res) => !res.ok },
  );

  const data = (await response.json()) as YahooChartResponse;
  const result = data.chart?.result?.[0];
  if (!result || !result.timestamp?.length || !result.indicators?.quote?.length) {
    const description = data.chart?.error?.description || 'No data available';
    throw new YahooCandlesError(description, 404);
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
    quote.volume?.length ?? 0,
  );

  for (let i = 0; i < length; i += 1) {
    const timestamp = timestamps[i];
    if (typeof timestamp !== 'number') {
      continue;
    }

    if (timestamp < from || timestamp > to) {
      continue;
    }

    const open = quote.open?.[i] ?? null;
    const high = quote.high?.[i] ?? null;
    const low = quote.low?.[i] ?? null;
    const close = quote.close?.[i] ?? null;
    const volume = quote.volume?.[i] ?? null;
    if (open === null || high === null || low === null || close === null || volume === null) {
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
    throw new YahooCandlesError('No data available for the specified period', 404);
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
