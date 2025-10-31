import { fetchWithRetry } from '@/lib/http';
import { isFiniteNumber } from '@/lib/utils/numbers';
import { StockQuote } from '@/types';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
export const FINNHUB_CACHE_TTL_MS = 5 * 60 * 1000;

export interface FinnhubQuoteResult {
  price: number;
  dailyChange?: number;
  timestamp?: number;
  retrievedAt: number;
  raw?: StockQuote;
}

interface FinnhubQuoteOptions {
  token?: string | null;
  init?: RequestInit;
}

interface FinnhubCacheEntry {
  quote: FinnhubQuoteResult;
  storedAt: number;
}

const quoteCache = new Map<string, FinnhubCacheEntry>();

function buildCacheKey(symbol: string, token: string): string {
  return `${token.trim().toUpperCase()}::${symbol.trim().toUpperCase()}`;
}

function isCacheValid(entry: FinnhubCacheEntry, now: number): boolean {
  return now - entry.storedAt <= FINNHUB_CACHE_TTL_MS;
}

function createQuoteResult(data: StockQuote, retrievedAt: number): FinnhubQuoteResult {
  const price = data.c;

  const result: FinnhubQuoteResult = {
    price,
    retrievedAt,
    raw: { ...data, c: price },
  };

  if (isFiniteNumber(data.d)) {
    result.dailyChange = data.d;
  }

  if (isFiniteNumber(data.t) && data.t > 0) {
    result.timestamp = data.t;
  }

  return result;
}

export function clearFinnhubQuoteCache(): void {
  quoteCache.clear();
}

export async function fetchFinnhubQuote(
  symbol: string,
  options: FinnhubQuoteOptions,
): Promise<FinnhubQuoteResult | null> {
  const { token, init = { cache: 'no-store' } } = options;

  if (!token) {
    return null;
  }

  const cacheKey = buildCacheKey(symbol, token);
  const cached = quoteCache.get(cacheKey);
  const now = Date.now();

  try {
    const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
    const response = await fetchWithRetry(url, init);
    const data = await response.json() as StockQuote;

    if (!isFiniteNumber(data.c) || data.c <= 0) {
      if (cached && isCacheValid(cached, now)) {
        return cached.quote;
      }
      return null;
    }

    const retrievedAt = Date.now();
    const quote = createQuoteResult(data, retrievedAt);

    quoteCache.set(cacheKey, { quote, storedAt: retrievedAt });

    return quote;
  } catch (error) {
    if (cached && isCacheValid(cached, now)) {
      console.warn(`Using cached Finnhub quote for ${symbol} after error:`, error);
      return cached.quote;
    }

    console.error(`Failed to fetch quote for ${symbol}:`, error);
    return null;
  }
}
