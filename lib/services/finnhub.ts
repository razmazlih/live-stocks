import { fetchWithRetry } from '@/lib/http';
import { isFiniteNumber } from '@/lib/utils/numbers';
import { StockQuote } from '@/types';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_INIT: RequestInit = { cache: 'no-store' };

interface FinnhubCacheEntry {
  quote: StockQuote;
  fetchedAt: number;
}

const quoteCache = new Map<string, FinnhubCacheEntry>();

export interface FinnhubQuoteResult {
  price: number;
  dailyChange?: number;
  timestamp?: number;
  fetchedAt?: number;
}

interface FinnhubQuoteOptions {
  token?: string | null;
  init?: RequestInit;
}

export interface FinnhubStockQuoteResult {
  quote: StockQuote;
  fetchedAt: number;
  fromCache: boolean;
}

function buildCacheKey(token: string, symbol: string): string {
  return `${token}:${symbol}`;
}

function getValidCacheEntry(cacheKey: string, now: number): FinnhubCacheEntry | null {
  const cached = quoteCache.get(cacheKey);
  if (!cached) {
    return null;
  }

  if (now - cached.fetchedAt <= CACHE_TTL_MS) {
    return cached;
  }

  quoteCache.delete(cacheKey);
  return null;
}

export async function fetchFinnhubStockQuote(
  symbol: string,
  options: FinnhubQuoteOptions,
): Promise<FinnhubStockQuoteResult | null> {
  const token = options.token?.trim();
  const init = options.init ?? DEFAULT_INIT;
  const normalizedSymbol = symbol.trim().toUpperCase();

  if (!token || !normalizedSymbol) {
    return null;
  }

  const cacheKey = buildCacheKey(token, normalizedSymbol);
  const now = Date.now();
  const cached = getValidCacheEntry(cacheKey, now);

  try {
    const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(normalizedSymbol)}&token=${token}`;
    const response = await fetchWithRetry(url, init);
    const data = await response.json() as StockQuote;

    if (!isFiniteNumber(data.c) || data.c <= 0) {
      if (cached) {
        return {
          quote: cached.quote,
          fetchedAt: cached.fetchedAt,
          fromCache: true,
        };
      }

      return null;
    }

    const fetchedAt = now;
    const enrichedQuote: StockQuote = { ...data, fetchedAt };
    const entry: FinnhubCacheEntry = {
      quote: enrichedQuote,
      fetchedAt,
    };

    quoteCache.set(cacheKey, entry);

    return {
      quote: enrichedQuote,
      fetchedAt,
      fromCache: false,
    };
  } catch (error) {
    if (cached) {
      return {
        quote: cached.quote,
        fetchedAt: cached.fetchedAt,
        fromCache: true,
      };
    }

    throw error;
  }
}

export async function fetchFinnhubQuote(
  symbol: string,
  options: FinnhubQuoteOptions,
): Promise<FinnhubQuoteResult | null> {
  try {
    const result = await fetchFinnhubStockQuote(symbol, options);

    if (!result) {
      return null;
    }

    const { quote, fetchedAt } = result;

    if (!isFiniteNumber(quote.c) || quote.c <= 0) {
      return null;
    }

    const mapped: FinnhubQuoteResult = {
      price: quote.c,
      fetchedAt,
    };

    if (isFiniteNumber(quote.d)) {
      mapped.dailyChange = quote.d;
    }

    if (isFiniteNumber(quote.t) && quote.t > 0) {
      mapped.timestamp = quote.t;
    }

    return mapped;
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}:`, error);
    return null;
  }
}
