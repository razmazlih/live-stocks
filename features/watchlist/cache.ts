import type { TimeRange } from '@/types';
import { isNasdaqTradingHours } from '@/lib/utils/trading-hours';
import type { TickerCacheEntry } from './types';

const TICKER_CACHE_PREFIX = 'watchlist:ticker:';

function getTickerCacheStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.warn('Ticker cache unavailable:', error);
    return null;
  }
}

export function buildTickerCacheKey(
  tickerKey: string,
  range: TimeRange,
  from: number,
  resolution: string,
): string {
  return `${TICKER_CACHE_PREFIX}${tickerKey}::${range}::${from}::${resolution}`;
}

export function readTickerCache(key: string): TickerCacheEntry | null {
  const storage = getTickerCacheStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as TickerCacheEntry | null;
    if (!parsed || typeof parsed !== 'object') {
      storage.removeItem(key);
      return null;
    }

    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      storage.removeItem(key);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to read ticker cache entry', error);
    storage.removeItem(key);
    return null;
  }
}

export function writeTickerCache(key: string, entry: TickerCacheEntry): void {
  const storage = getTickerCacheStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn('Failed to write ticker cache entry', error);
  }
}

export function getTickerCacheTtlMs(date: Date = new Date()): number {
  return isNasdaqTradingHours(date) ? 3 * 60 * 1000 : 60 * 60 * 1000;
}
