import { NextRequest } from 'next/server';
import { errorNoStore, jsonNoStore, parseBooleanFlag } from '@/lib/api/route';
import { HttpStatusError } from '@/lib/http';
import {
  fetchQuoteForSymbol,
  FinnhubConfigError,
} from '@/lib/services/quote-provider';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const tokenParam = searchParams.get('token');
    const forceRefresh = parseBooleanFlag(searchParams.get('forceRefresh'));

    if (!symbol) {
      return errorNoStore('Symbol parameter is required', 400);
    }

    const quote = await fetchQuoteForSymbol(symbol, {
      token: tokenParam,
      forceRefresh,
    });

    return jsonNoStore(quote);
  } catch (error) {
    if (error instanceof FinnhubConfigError) {
      return errorNoStore(error.message, error.status);
    }

    if (error instanceof HttpStatusError) {
      if (error.status === 429) {
        return errorNoStore(
          'Quote rate limit exceeded. Please retry shortly.',
          429,
          typeof error.retryAfterSeconds === 'number'
            ? { 'Retry-After': String(error.retryAfterSeconds) }
            : undefined,
        );
      }

      return errorNoStore(`Upstream quote provider returned HTTP ${error.status}`, error.status);
    }

    if (error instanceof Error && error.message === 'Invalid symbol or no data available') {
      return errorNoStore(error.message, 404);
    }

    console.error('Quote API error:', error);
    return errorNoStore('Failed to fetch quote data', 500);
  }
}
