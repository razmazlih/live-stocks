import { NextRequest } from 'next/server';
import {
  errorNoStore,
  jsonNoStore,
  parseBooleanFlag,
  parseSymbolsList,
} from '@/lib/api/route';
import {
  fetchQuotesForSymbols,
  FinnhubConfigError,
} from '@/lib/services/quote-provider';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get('symbols');
    const tokenParam = searchParams.get('token');
    const forceRefresh = parseBooleanFlag(searchParams.get('forceRefresh'));

    if (!symbolsParam) {
      return errorNoStore('Symbols parameter is required', 400);
    }

    const symbols = parseSymbolsList(symbolsParam);

    if (!symbols.length) {
      return errorNoStore('No valid symbols were provided', 400);
    }

    const quotes = await fetchQuotesForSymbols(symbols, {
      token: tokenParam,
      forceRefresh,
    });

    return jsonNoStore({ quotes });
  } catch (error) {
    if (error instanceof FinnhubConfigError) {
      return errorNoStore(error.message, error.status);
    }

    console.error('Quotes API error:', error);
    return errorNoStore('Failed to fetch quotes data', 500);
  }
}
