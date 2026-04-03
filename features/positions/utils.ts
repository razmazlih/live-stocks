import { DEFAULT_COMMISSION_USD } from '@/lib/positions';
import type { Position } from '@/types';
import type { PositionFormData, TransactionFormData } from '@/features/positions/types';

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

export function createDefaultPositionForm(): PositionFormData {
  return {
    symbol: '',
    display: '',
    imageUrl: '',
    location: 'bank_one',
    initialPrice: 0,
    initialQuantity: 0,
    initialDate: getTodayIsoDate(),
    initialHasCommission: true,
    initialCommissionAmount: DEFAULT_COMMISSION_USD,
  };
}

export function createPositionFormForEdit(position: Position): PositionFormData {
  return {
    symbol: position.symbol,
    display: position.display,
    imageUrl: position.imageUrl,
    location: position.location,
    initialPrice: position.entryPrice,
    initialQuantity: position.quantity,
    initialDate: position.entryDate,
    initialHasCommission: true,
    initialCommissionAmount: DEFAULT_COMMISSION_USD,
  };
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
