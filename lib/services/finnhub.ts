import { fetchWithRetry } from '@/lib/http';
import { isFiniteNumber } from '@/lib/utils/numbers';
import { StockQuote } from '@/types';

export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';

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
    const url = new URL('quote', `${FINNHUB_BASE_URL}/`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('token', token);

    const response = await fetchWithRetry(url, init);
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
