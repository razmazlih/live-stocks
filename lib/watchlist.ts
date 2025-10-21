import { WatchlistGroup, WatchlistTicker } from '@/types';

type SupabaseValue<T> = T | string | null | undefined;

interface SupabaseWatchlistTickerRow {
  id: string;
  group_id: string;
  symbol: string;
  display?: SupabaseValue<string>;
  image_url?: SupabaseValue<string>;
  note?: SupabaseValue<string>;
  sort_order?: SupabaseValue<number>;
  created_at?: SupabaseValue<string>;
  updated_at?: SupabaseValue<string>;
}

interface SupabaseWatchlistGroupRow {
  id: string;
  name: string;
  description?: SupabaseValue<string>;
  created_at?: SupabaseValue<string>;
  updated_at?: SupabaseValue<string>;
  watchlist_tickers?: SupabaseWatchlistTickerRow[] | null;
}

function parseString(value?: SupabaseValue<string>): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  return undefined;
}

function parseNumber(value?: SupabaseValue<number>): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function mapWatchlistTicker(row: SupabaseWatchlistTickerRow): WatchlistTicker {
  const sortOrder = parseNumber(row.sort_order);

  return {
    id: row.id,
    groupId: row.group_id,
    symbol: row.symbol,
    display: parseString(row.display),
    imageUrl: parseString(row.image_url),
    note: parseString(row.note),
    sortOrder: typeof sortOrder === 'number' ? Math.floor(sortOrder) : undefined,
    createdAt: parseString(row.created_at),
    updatedAt: parseString(row.updated_at),
  };
}

export function mapWatchlistGroup(row: SupabaseWatchlistGroupRow): WatchlistGroup {
  const tickers = Array.isArray(row.watchlist_tickers)
    ? row.watchlist_tickers.map(mapWatchlistTicker)
    : [];

  return {
    id: row.id,
    name: row.name,
    description: parseString(row.description),
    tickers: sortWatchlistTickers(tickers),
    createdAt: parseString(row.created_at),
    updatedAt: parseString(row.updated_at),
  };
}

export function sortWatchlistTickers(tickers: WatchlistTicker[]): WatchlistTicker[] {
  return [...tickers].sort((a, b) => {
    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.symbol.localeCompare(b.symbol);
  });
}

export function sortWatchlistGroups(groups: WatchlistGroup[]): WatchlistGroup[] {
  return [...groups].sort((a, b) => a.name.localeCompare(b.name));
}
