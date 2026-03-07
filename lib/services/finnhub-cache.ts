import 'server-only';

import { fetchWithRetry } from '@/lib/http';
import { FINNHUB_BASE_URL } from '@/lib/services/finnhub';
import { getSupabaseClient } from '@/lib/supabase';
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

function normalizeToken(token?: string | null): string | null {
  const trimmed = token?.trim();
  return trimmed ? trimmed : null;
}

export async function resolveFinnhubToken(explicitToken?: string | null): Promise<string> {
  const directToken = normalizeToken(explicitToken);
  if (directToken) {
    return directToken;
  }

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (error) {
    console.error('Supabase client initialization failed:', error);
    throw new FinnhubConfigError('Supabase client is not configured.');
  }

  const { data: settingsData, error: settingsError } = await supabase
    .from('settings')
    .select('finnhub_token')
    .limit(1)
    .maybeSingle();

  if (settingsError && settingsError.code !== 'PGRST116') {
    console.error('Failed to load settings for Finnhub token:', settingsError);
    throw new FinnhubConfigError('Failed to load Finnhub token configuration');
  }

  const resolvedToken = normalizeToken(settingsData?.finnhub_token)
    ?? normalizeToken(process.env.FINNHUB_TOKEN);

  if (!resolvedToken) {
    throw new FinnhubConfigError('Finnhub token is not configured');
  }

  return resolvedToken;
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
  const cacheKey = `${normalizedSymbol}:${token}`;
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
      const url = `${FINNHUB_BASE_URL}/quote?symbol=${encodeURIComponent(normalizedSymbol)}&token=${token}`;
      const response = await fetchWithRetry(url, { cache: 'no-store' });
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
