import { fetchWithRetry } from '@/lib/http';
import { isFiniteNumber } from '@/lib/utils/numbers';
import { StockQuote } from '@/types';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export interface FinnhubQuoteResult {
  price: number;
  dailyChange?: number;
  timestamp?: number;
  source?: 'live' | 'cache';
}

interface FinnhubQuoteOptions {
  token?: string | null;
  init?: RequestInit;
}

export const QUOTE_CACHE_TTL_MS = 5 * 60 * 1000;

interface QuoteCacheEntry {
  result: FinnhubQuoteResult;
  raw: StockQuote;
  fetchedAt: number;
}

const quoteCache = new Map<string, QuoteCacheEntry>();

export async function fetchFinnhubQuote(
  symbol: string,
  options: FinnhubQuoteOptions,
): Promise<FinnhubQuoteResult | null> {
  const { token, init = { cache: 'no-store' } } = options;

  if (!token) {
    return null;
  }

  const cacheKey = `${token}:${symbol}`;
  const now = Date.now();
  const cached = quoteCache.get(cacheKey);

  try {
    const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
    const response = await fetchWithRetry(url, init);
    const data = await response.json() as StockQuote;

    if (!isFiniteNumber(data.c) || data.c <= 0) {
      return null;
    }

    const quote: FinnhubQuoteResult = { price: data.c, source: 'live' };

    if (isFiniteNumber(data.d)) {
      quote.dailyChange = data.d;
    }

    if (isFiniteNumber(data.t) && data.t > 0) {
      quote.timestamp = data.t;
    }

    quoteCache.set(cacheKey, {
      result: quote,
      raw: data,
      fetchedAt: now,
    });

    return quote;
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}:`, error);
    if (cached && now - cached.fetchedAt <= QUOTE_CACHE_TTL_MS) {
      return { ...cached.result, source: 'cache' };
    }
    return null;
  }
}

export function getCachedFinnhubQuote(
  symbol: string,
  token?: string | null,
): (StockQuote & { fetchedAt: number }) | null {
  if (!token) {
    return null;
  }

  const cacheKey = `${token}:${symbol}`;
  const entry = quoteCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (Date.now() - entry.fetchedAt > QUOTE_CACHE_TTL_MS) {
    return null;
  }

  const fetchedAt = entry.raw.t && entry.raw.t > 0 ? entry.raw.t * 1000 : entry.fetchedAt;

  return { ...entry.raw, fetchedAt };
}
