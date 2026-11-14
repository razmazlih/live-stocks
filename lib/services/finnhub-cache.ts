import 'server-only';

import { fetchWithRetry } from '@/lib/http';
import { FINNHUB_BASE_URL } from '@/lib/services/finnhub';
import { createHash } from 'node:crypto';
import { readFinnhubCredential } from '@/lib/auth/credentials';
import { isFiniteNumber } from '@/lib/utils/numbers';
import { StockQuote } from '@/types';

const QUOTE_CACHE_TTL_MS = 60_000;

type CachedQuoteEntry = {
  quote: StockQuote;
  expiresAt: number;
};

const quoteCache = new Map<string, CachedQuoteEntry>();
const inFlightQuotes = new Map<string, Promise<StockQuote>>();

export class FinnhubConfigError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'FinnhubConfigError';
    this.status = status;
  }
}

export async function resolveFinnhubToken(userId: string): Promise<string> {
  if (!userId) throw new FinnhubConfigError('Account is required', 401);
  const token = (await readFinnhubCredential(userId))?.trim();
  if (!token) throw new FinnhubConfigError('Add your Finnhub key in account settings', 409);
  return token;
}

interface FetchQuoteOptions {
  forceRefresh?: boolean;
}

export async function fetchFinnhubQuoteCached(
  symbol: string,
  token: string,
  options: FetchQuoteOptions = {},
): Promise<StockQuote> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) {
    throw new Error('Symbol parameter is required');
  }

  const { forceRefresh = false } = options;
  const cacheKey = `${normalizedSymbol}:${createHash('sha256').update(token).digest('hex')}`;
  const now = Date.now();

  if (forceRefresh) {
    quoteCache.delete(cacheKey);
    inFlightQuotes.delete(cacheKey);
  }

  const cached = quoteCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.quote;
  }

  let inFlight = inFlightQuotes.get(cacheKey);
  if (!inFlight) {
    inFlight = (async () => {
      const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(normalizedSymbol)}`;
      const response = await fetchWithRetry(url, { cache: 'no-store', headers: { 'X-Finnhub-Token': token } });
      return (await response.json()) as StockQuote;
    })();
    inFlightQuotes.set(cacheKey, inFlight);
  }

  let quote: StockQuote;
  try {
    quote = await inFlight;
  } finally {
    inFlightQuotes.delete(cacheKey);
  }

  if (!isFiniteNumber(quote.c) || quote.c <= 0) {
    throw new Error('Invalid symbol or no data available');
  }

  quoteCache.set(cacheKey, {
    quote,
    expiresAt: now + QUOTE_CACHE_TTL_MS,
  });

  return quote;
}
