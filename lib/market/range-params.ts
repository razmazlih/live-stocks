import type { TimeRange } from '@/types';

const DAY_SECONDS = 24 * 60 * 60;
const WATCHLIST_HISTORY_LOOKBACK_YEARS = 5;
const WATCHLIST_CUSTOM_START_MIN_YEARS = 10;

export const STOCK_DETAIL_TIME_RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', 'All'];

function determineAdaptiveResolution(fromSeconds: number, toSeconds: number): string {
  const secondsRange = Math.max(toSeconds - fromSeconds, DAY_SECONDS);
  const days = secondsRange / DAY_SECONDS;

  if (days <= 45) {
    return '60';
  }
  if (days <= 180) {
    return 'D';
  }
  if (days <= 365 * 3) {
    return 'W';
  }
  return 'M';
}

export function getWatchlistRangeParams(
  range: TimeRange,
  startDate?: Date | null,
): { from: number; resolution: string } {
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (startDate instanceof Date && !Number.isNaN(startDate.getTime())) {
    const rawFrom = Math.floor(startDate.getTime() / 1000);
    const maxFrom = Math.max(nowSeconds - 60, 0);
    const minFrom = nowSeconds - DAY_SECONDS * 365 * WATCHLIST_CUSTOM_START_MIN_YEARS;
    const normalizedFrom = Math.min(rawFrom, maxFrom);
    const effectiveFrom = Math.max(normalizedFrom, minFrom);
    const resolution = determineAdaptiveResolution(effectiveFrom, nowSeconds);
    return { from: effectiveFrom, resolution };
  }

  switch (range) {
    case '1D':
      return { from: nowSeconds - DAY_SECONDS * 2, resolution: '60' };
    case '1W':
      return { from: nowSeconds - DAY_SECONDS * 7, resolution: '60' };
    case '1M':
      return { from: nowSeconds - DAY_SECONDS * 30, resolution: 'D' };
    case '3M':
      return { from: nowSeconds - DAY_SECONDS * 90, resolution: 'D' };
    case '6M':
      return { from: nowSeconds - DAY_SECONDS * 180, resolution: 'D' };
    case 'YTD': {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      return { from: Math.floor(startOfYear.getTime() / 1000), resolution: 'D' };
    }
    case '1Y':
      return { from: nowSeconds - DAY_SECONDS * 365, resolution: 'D' };
    case 'All':
      return { from: nowSeconds - DAY_SECONDS * 365 * WATCHLIST_HISTORY_LOOKBACK_YEARS, resolution: 'W' };
    default:
      return { from: nowSeconds - DAY_SECONDS * 90, resolution: 'D' };
  }
}

export function getStockDetailRangeParams(
  range: TimeRange,
  entryDate?: string,
): { from: number; resolution: string } {
  const nowSeconds = Math.floor(Date.now() / 1000);

  switch (range) {
    case '1D':
      return { from: nowSeconds - DAY_SECONDS, resolution: '60' };
    case '1W':
      return { from: nowSeconds - 7 * DAY_SECONDS, resolution: 'D' };
    case '1M':
      return { from: nowSeconds - 30 * DAY_SECONDS, resolution: 'D' };
    case '3M':
      return { from: nowSeconds - 90 * DAY_SECONDS, resolution: 'D' };
    case '6M':
      return { from: nowSeconds - 180 * DAY_SECONDS, resolution: 'D' };
    case 'YTD': {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
      return { from: Math.floor(startOfYear), resolution: 'D' };
    }
    case '1Y':
      return { from: nowSeconds - 365 * DAY_SECONDS, resolution: 'D' };
    case 'All': {
      const defaultRange = nowSeconds - 5 * 365 * DAY_SECONDS;
      const entryTimestamp = entryDate
        ? Math.floor(new Date(entryDate).getTime() / 1000)
        : defaultRange;
      const earliest = Math.min(entryTimestamp, defaultRange);
      const clamped = Math.min(earliest, nowSeconds - DAY_SECONDS);
      return { from: clamped, resolution: 'W' };
    }
    default:
      return { from: nowSeconds - 30 * DAY_SECONDS, resolution: 'D' };
  }
}
