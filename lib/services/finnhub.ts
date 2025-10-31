import { fetchWithRetry } from '@/lib/http';
import { isFiniteNumber } from '@/lib/utils/numbers';
import { StockQuote } from '@/types';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

export interface FinnhubQuoteResult {
  price: number;
  dailyChange?: number;
  timestamp?: number;
  fetchedAt: number;
}

interface FinnhubQuoteOptions {
  token?: string | null;
  init?: RequestInit;
}

const QUOTE_CACHE_TTL_MS = 5 * 60 * 1000;

export type StockQuoteWithMeta = StockQuote & { fetchedAt: number };

interface CachedQuoteEntry {
  quote: StockQuoteWithMeta;
  expiresAt: number;
}

const quoteCache = new Map<string, CachedQuoteEntry>();
const pendingQuoteRequests = new Map<string, Promise<StockQuoteWithMeta>>();

function getQuoteCacheKey(symbol: string, token: string): string {
  return `${token.trim().toUpperCase()}:${symbol.trim().toUpperCase()}`;
}

async function requestQuoteFromFinnhub(
  symbol: string,
  token: string,
  init: RequestInit,
): Promise<StockQuoteWithMeta> {
  const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`;
  const response = await fetchWithRetry(url, init);
  const data = await response.json() as StockQuote;

  if (!isFiniteNumber(data.c) || data.c <= 0) {
    throw new Error(`Invalid price received for ${symbol}`);
  }

  const fetchedAt = Date.now();
  const quoteWithMeta: StockQuoteWithMeta = { ...data, fetchedAt };
  quoteCache.set(getQuoteCacheKey(symbol, token), {
    quote: quoteWithMeta,
    expiresAt: fetchedAt + QUOTE_CACHE_TTL_MS,
  });

  return quoteWithMeta;
}

export async function fetchFinnhubStockQuote(
  symbol: string,
  options: FinnhubQuoteOptions,
): Promise<StockQuoteWithMeta | null> {
  const { token, init = { cache: 'no-store' } } = options;

  const trimmedToken = token?.trim();
  if (!trimmedToken) {
    return null;
  }

  const cacheKey = getQuoteCacheKey(symbol, trimmedToken);
  const now = Date.now();
  const cached = quoteCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.quote;
  }

  const existingPromise = pendingQuoteRequests.get(cacheKey);
  if (existingPromise) {
    try {
      return await existingPromise;
    } catch (error) {
      console.error(`Pending quote request failed for ${symbol}:`, error);
    }
  }

  const request = requestQuoteFromFinnhub(symbol, trimmedToken, init);
  pendingQuoteRequests.set(cacheKey, request);

  try {
    return await request;
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}:`, error);
    if (cached) {
      return cached.quote;
    }
    return null;
  } finally {
    pendingQuoteRequests.delete(cacheKey);
  }
}

export async function fetchFinnhubQuote(
  symbol: string,
  options: FinnhubQuoteOptions,
): Promise<FinnhubQuoteResult | null> {
  const quote = await fetchFinnhubStockQuote(symbol, options);

  if (!quote) {
    return null;
  }

  const result: FinnhubQuoteResult = {
    price: quote.c,
    fetchedAt: quote.fetchedAt,
  };

  if (isFiniteNumber(quote.d)) {
    result.dailyChange = quote.d;
  }

  if (isFiniteNumber(quote.t) && quote.t > 0) {
    result.timestamp = quote.t;
  }

  return result;
}
