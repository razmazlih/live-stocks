import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { getRangeParams as getWatchlistRangeParamsFromFeature } from '@/features/watchlist/range';
import {
  getStockDetailRangeParams,
  getWatchlistRangeParams,
} from '@/lib/market/range-params';

describe('market range params', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-03T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps watchlist feature wrapper aligned with lib implementation', () => {
    const fromFeature = getWatchlistRangeParamsFromFeature('1M');
    const fromLib = getWatchlistRangeParams('1M');
    expect(fromFeature).toEqual(fromLib);
  });

  it('clamps custom watchlist start date to the supported max/min boundaries', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    const farFuture = getWatchlistRangeParams('1M', new Date('2030-01-01T00:00:00.000Z'));
    expect(farFuture.from).toBe(nowSeconds - 60);

    const farPast = getWatchlistRangeParams('1M', new Date('2000-01-01T00:00:00.000Z'));
    expect(farPast.from).toBe(nowSeconds - 10 * 365 * 24 * 60 * 60);
  });

  it('uses only candle resolutions supported by our API service', () => {
    const shortWindow = getWatchlistRangeParams('1M', new Date('2026-04-01T00:00:00.000Z'));
    expect(shortWindow.resolution).toBe('60');
  });

  it('uses entry date for stock detail All range but never later than yesterday', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const oneDaySeconds = 24 * 60 * 60;
    const fiveYearsSeconds = 5 * 365 * oneDaySeconds;

    const resultWithEarlyEntry = getStockDetailRangeParams('All', '2018-01-01');
    expect(resultWithEarlyEntry.resolution).toBe('W');
    expect(resultWithEarlyEntry.from).toBeLessThanOrEqual(nowSeconds - oneDaySeconds);

    const resultWithoutEntry = getStockDetailRangeParams('All');
    expect(resultWithoutEntry.resolution).toBe('W');
    expect(resultWithoutEntry.from).toBe(nowSeconds - fiveYearsSeconds);
  });
});
