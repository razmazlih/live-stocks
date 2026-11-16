import type { TimeRange } from '@/types';

export const POSITION_SORTS = ['latest_activity', 'symbol_asc', 'symbol_desc', 'quantity_desc', 'entry_date_desc'] as const;
export type PositionSort = typeof POSITION_SORTS[number];
const RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y', 'All'];

export function parsePositionsState(params: URLSearchParams) {
  const account = params.get('account');
  const sort = params.get('sort');
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 20);
  return {
    searchTerm: (params.get('q') ?? '').slice(0, 200),
    locationFilter: account && (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account) || account === 'bank_one' || account === 'bank_two') ? account : 'all' as const,
    sortOption: POSITION_SORTS.includes(sort as PositionSort) ? sort as PositionSort : 'latest_activity' as const,
    currentPage: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: [10, 20, 50].includes(pageSize) ? pageSize : 20,
  };
}

export function parseWatchlistState(params: URLSearchParams) {
  const range = params.get('range') as TimeRange;
  const date = params.get('from');
  const parsed = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : null;
  const min = new Date();
  min.setFullYear(min.getFullYear() - 10);
  min.setHours(0, 0, 0, 0);
  const valid = parsed && Number.isFinite(parsed.getTime()) && parsed >= min && parsed <= new Date()
    && `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}` === date;
  return {
    group: (params.get('group') ?? '').slice(0, 200) || null,
    range: RANGES.includes(range) ? range : '1M' as TimeRange,
    customStartDate: valid ? parsed : null,
  };
}

export function localDateParam(date: Date | null) {
  return date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : null;
}
