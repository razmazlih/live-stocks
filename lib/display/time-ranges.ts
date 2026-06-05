import type { TimeRange } from '@/types';

export const WATCHLIST_TIME_RANGES = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y'] as const satisfies readonly TimeRange[];
export const STOCK_DETAIL_TIME_RANGES = [...WATCHLIST_TIME_RANGES, 'All'] as const satisfies readonly TimeRange[];
