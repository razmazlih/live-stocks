import type { HistoricalPoint, StockQuote, TimeRange } from '@/types';

export interface GroupFormState {
  id: string | null;
  name: string;
  description: string;
}

export interface TickerFormState {
  id: string | null;
  symbol: string;
  display: string;
  imageUrl: string;
  note: string;
}

export interface TickerState {
  loading: boolean;
  error: string | null;
  quote: StockQuote | null;
  historical: HistoricalPoint[];
  range: TimeRange;
  from: number | null;
  lastUpdated: number | null;
}

export interface TickerCacheEntry {
  quote: StockQuote | null;
  historical: HistoricalPoint[];
  error: string | null;
  storedAt: number;
  expiresAt: number;
  range: TimeRange;
  from: number;
  resolution: string;
}
