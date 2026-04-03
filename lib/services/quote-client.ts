import type { StockQuote } from '@/types';

export async function fetchStockQuote(symbol: string): Promise<StockQuote | null> {
  const normalizedSymbol = symbol.trim().toUpperCase();

  if (!normalizedSymbol) {
    return null;
  }

  try {
    const response = await fetch(
      `/api/quote?symbol=${encodeURIComponent(normalizedSymbol)}`,
      { cache: 'no-store' },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as StockQuote;
  } catch (error) {
    console.error('Failed to fetch quote for symbol:', symbol, error);
    return null;
  }
}

export async function fetchStockQuotePrice(symbol: string): Promise<number | null> {
  const quote = await fetchStockQuote(symbol);
  const price = quote?.c;

  if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
    return price;
  }

  return null;
}
