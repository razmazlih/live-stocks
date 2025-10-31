import { fetchWithRetry } from '@/lib/http';
import { isFiniteNumber } from '@/lib/utils/numbers';
import { StockQuote } from '@/types';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

function buildFinnhubEndpoint(path: string): URL {
  const base = new URL(FINNHUB_BASE_URL);
  const sanitizedPath = path.startsWith('/') ? path.slice(1) : path;
  base.pathname = `${base.pathname.replace(/\/$/, '')}/${sanitizedPath}`;
  return base;
}

export function buildFinnhubQuoteUrl(symbol: string, token: string): URL {
  const trimmedSymbol = symbol.trim();
  if (!trimmedSymbol) {
    throw new Error('Symbol must be provided when requesting a Finnhub quote.');
  }

  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error('Finnhub token must be provided when requesting a quote.');
  }

  const endpoint = buildFinnhubEndpoint('quote');
  endpoint.searchParams.set('symbol', trimmedSymbol);
  endpoint.searchParams.set('token', normalizedToken);
  return endpoint;
}

export interface FinnhubQuoteResult {
  price: number;
  dailyChange?: number;
  timestamp?: number;
}

interface FinnhubQuoteOptions {
  token?: string | null;
  init?: RequestInit;
}

export async function fetchFinnhubQuote(
  symbol: string,
  options: FinnhubQuoteOptions,
): Promise<FinnhubQuoteResult | null> {
  const { token, init = { cache: 'no-store' } } = options;

  if (!token) {
    return null;
  }

  try {
    const endpoint = buildFinnhubQuoteUrl(symbol, token);
    const response = await fetchWithRetry(endpoint, init);
    const data = await response.json() as StockQuote;

    if (!isFiniteNumber(data.c) || data.c <= 0) {
      return null;
    }

    const quote: FinnhubQuoteResult = { price: data.c };

    if (isFiniteNumber(data.d)) {
      quote.dailyChange = data.d;
    }

    if (isFiniteNumber(data.t) && data.t > 0) {
      quote.timestamp = data.t;
    }

    return quote;
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}:`, error);
    return null;
  }
}
