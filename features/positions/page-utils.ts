import { DEFAULT_COMMISSION_USD } from '@/lib/positions';
import { fetchStockQuotePrice } from '@/lib/services/quote-client';

import type { TransactionFormData } from './page-types';

export function getTimestampFromIsoDate(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function buildFallbackInitials(display: string, symbol: string): string {
  return (
    (display || symbol || '?')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || '?'
  );
}

export function getTodayIsoDate(): string {
  return new Date().toISOString().split('T')[0];
}

export function createDefaultTransactionForm(): TransactionFormData {
  return {
    type: 'BUY',
    price: 0,
    quantity: 0,
    executedAt: getTodayIsoDate(),
    hasCommission: true,
    commissionAmount: DEFAULT_COMMISSION_USD,
  };
}

export async function fetchQuotePrice(symbol: string): Promise<number | null> {
  return fetchStockQuotePrice(symbol);
}
