import type { WatchlistTicker } from '@/types';

export function getWatchlistTickerKey(ticker: WatchlistTicker): string {
  return ticker.id ?? ticker.symbol;
}
