import { isNasdaqTradingHours } from '@/lib/utils/trading-hours';
import type { WatchlistTicker as WatchlistTickerType } from '@/types';

import type { TickerState } from './types';
import { getWatchlistTickerKey } from './utils';

export interface WatchlistSignalSummary {
  totalTickers: number;
  loadingCount: number;
  readyCount: number;
  freshCount: number;
  errorCount: number;
  staleCount: number;
  noteCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  samples: number;
  averageMomentum: number;
}

export function buildWatchlistSignalSummary(
  tickers: WatchlistTickerType[],
  tickerStates: Record<string, TickerState>,
  now: number = Date.now(),
): WatchlistSignalSummary {
  const staleThresholdMs = isNasdaqTradingHours(new Date(now)) ? 15 * 60 * 1000 : 90 * 60 * 1000;
  let loadingCount = 0;
  let errorCount = 0;
  let staleCount = 0;
  let noteCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let samples = 0;
  let momentumTotal = 0;

  for (const ticker of tickers) {
    const key = getWatchlistTickerKey(ticker);
    const state = tickerStates[key];
    const historical = state?.historical ?? [];
    const firstPoint = historical.find(
      (point) => typeof point.close === 'number' && Number.isFinite(point.close),
    );
    const lastPoint = historical.length > 0 ? historical[historical.length - 1] : null;

    if (state?.loading) {
      loadingCount += 1;
    }

    if (state?.error) {
      errorCount += 1;
    }

    if (ticker.note?.trim()) {
      noteCount += 1;
    }

    const hasData = Boolean(state?.quote) || historical.length > 0;
    const isStale =
      !state?.loading &&
      !state?.error &&
      hasData &&
      typeof state?.lastUpdated === 'number' &&
      now - state.lastUpdated > staleThresholdMs;

    if (isStale) {
      staleCount += 1;
    }

    const basePrice =
      typeof firstPoint?.close === 'number' && Number.isFinite(firstPoint.close)
        ? firstPoint.close
        : null;
    const currentPrice =
      typeof state?.quote?.c === 'number' && Number.isFinite(state.quote.c)
        ? state.quote.c
        : typeof lastPoint?.close === 'number' && Number.isFinite(lastPoint.close)
          ? lastPoint.close
          : null;

    if (basePrice === null || basePrice <= 0 || currentPrice === null) {
      continue;
    }

    const changePercent = ((currentPrice - basePrice) / basePrice) * 100;
    momentumTotal += changePercent;
    samples += 1;

    if (changePercent > 0.25) {
      positiveCount += 1;
    } else if (changePercent < -0.25) {
      negativeCount += 1;
    } else {
      neutralCount += 1;
    }
  }

  return {
    totalTickers: tickers.length,
    loadingCount,
    readyCount: tickers.length - loadingCount,
    freshCount: Math.max(tickers.length - loadingCount - staleCount - errorCount, 0),
    errorCount,
    staleCount,
    noteCount,
    positiveCount,
    negativeCount,
    neutralCount,
    samples,
    averageMomentum: samples > 0 ? momentumTotal / samples : 0,
  };
}
