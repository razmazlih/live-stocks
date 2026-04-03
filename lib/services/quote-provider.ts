import type { StockQuote } from '@/types';

import {
  fetchFinnhubQuoteCached,
  FinnhubConfigError,
  resolveFinnhubToken,
} from './finnhub-cache';

interface FetchQuoteOptions {
  token?: string | null;
  forceRefresh?: boolean;
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export async function fetchQuoteForSymbol(
  symbol: string,
  options: FetchQuoteOptions = {},
): Promise<StockQuote> {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!normalizedSymbol) {
    throw new Error('Symbol parameter is required');
  }

  const token = await resolveFinnhubToken(options.token);
  return fetchFinnhubQuoteCached(normalizedSymbol, token, {
    forceRefresh: options.forceRefresh,
  });
}

export async function fetchQuotesForSymbols(
  symbols: string[],
  options: FetchQuoteOptions = {},
): Promise<Record<string, StockQuote>> {
  const normalizedSymbols = Array.from(
    new Set(symbols.map(normalizeSymbol).filter(Boolean)),
  );

  if (!normalizedSymbols.length) {
    return {};
  }

  const token = await resolveFinnhubToken(options.token);

  const quotePairs = await Promise.all(
    normalizedSymbols.map(async (symbol) => {
      try {
        const quote = await fetchFinnhubQuoteCached(symbol, token, {
          forceRefresh: options.forceRefresh,
        });
        return [symbol, quote] as const;
      } catch (error) {
        console.error(`Failed to fetch quote for ${symbol}:`, error);
        return [symbol, null] as const;
      }
    }),
  );

  const quotes: Record<string, StockQuote> = {};
  for (const [symbol, quote] of quotePairs) {
    if (quote) {
      quotes[symbol] = quote;
    }
  }

  return quotes;
}

export { FinnhubConfigError };
