import type { HistoricalPoint, StockQuote } from '@/types';

interface WatchlistDisplayInput {
  historical?: HistoricalPoint[] | null;
  quote?: StockQuote | null;
  basePrice?: number | null;
  baseDate?: Date | null;
  currentPrice?: number | null;
}

const priceOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** Daily quote change and selected-period change have different baselines. */
export function getWatchlistDisplayData(input: WatchlistDisplayInput) {
  const history = Array.from(new Map((input.historical ?? [])
    .filter((point) => Number.isFinite(new Date(point.timestamp).getTime()) && priceOrNull(point.close) !== null)
    .map((point) => [point.timestamp, point])).values()).sort((left, right) => left.timestamp - right.timestamp);
  const first = history[0];
  const last = history[history.length - 1];
  const currentPrice = priceOrNull(input.currentPrice) ?? priceOrNull(input.quote?.c) ?? priceOrNull(last?.close);
  const basePrice = priceOrNull(input.basePrice) ?? priceOrNull(first?.close);
  const baseDate = input.baseDate instanceof Date && Number.isFinite(input.baseDate.getTime()) ? input.baseDate : first ? new Date(first.timestamp) : null;
  const periodAbsolute = currentPrice !== null && basePrice !== null ? currentPrice - basePrice : null;
  const periodPercent = periodAbsolute !== null && basePrice !== null ? periodAbsolute / basePrice * 100 : null;
  const dailyPercent = typeof input.quote?.dp === 'number' && Number.isFinite(input.quote.dp) ? input.quote.dp : null;
  return { history, currentPrice, basePrice, baseDate, periodAbsolute, periodPercent, dailyPercent };
}

export function watchlistTrendTone(value: number | null) {
  return value === null || value === 0 ? 'text-slate-500' : value > 0 ? 'text-emerald-600' : 'text-rose-600';
}

export function watchlistTrendColor(value: number | null) {
  return value === null || value === 0 ? '#2563eb' : value > 0 ? '#059669' : '#dc2626';
}
