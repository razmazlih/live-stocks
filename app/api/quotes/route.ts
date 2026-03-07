import { NextRequest, NextResponse } from 'next/server';

import {
  fetchFinnhubQuoteCached,
  FinnhubConfigError,
  resolveFinnhubToken,
} from '@/lib/services/finnhub-cache';
import { StockQuote } from '@/types';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');
    const tokenParam = searchParams.get('token');
    const forceRefresh = searchParams.get('forceRefresh') === '1';

    if (!symbolsParam) {
      return NextResponse.json(
        { error: 'Symbols parameter is required' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const symbols = Array.from(
      new Set(
        symbolsParam
          .split(',')
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean),
      ),
    );

    if (!symbols.length) {
      return NextResponse.json(
        { error: 'No valid symbols were provided' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const token = await resolveFinnhubToken(tokenParam);

    const quotePairs = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const quote = await fetchFinnhubQuoteCached(symbol, token, { forceRefresh });
          return [symbol, quote] as const;
        } catch (error) {
          console.error(`Failed to fetch quote for ${symbol}:`, error);
          return [symbol, null] as const;
        }
      }),
    );

    const quotes: Record<string, StockQuote> = {};
    quotePairs.forEach(([symbol, quote]) => {
      if (quote) {
        quotes[symbol] = quote;
      }
    });

    return NextResponse.json({ quotes }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof FinnhubConfigError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: NO_STORE_HEADERS },
      );
    }

    console.error('Quotes API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quotes data' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
