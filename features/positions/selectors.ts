import type { Position, PositionLot } from '@/types';
import type {
  PositionLocationFilter,
  PositionSortOption,
} from './page-types';
import {
  buildFallbackInitials,
  getTimestampFromIsoDate,
} from './page-utils';

export interface PositionListItem {
  position: Position;
  sortedLots: PositionLot[];
  recentLots: PositionLot[];
  lastActivityDate: string;
  lastActivityTimestamp: number;
  fallbackInitials: string;
}

export function buildPositionListItems(positions: Position[]): PositionListItem[] {
  return positions.map((position) => {
    const sortedLots = [...(position.lots ?? [])].sort((a, b) => {
      const aTime = getTimestampFromIsoDate(a.executedAt);
      const bTime = getTimestampFromIsoDate(b.executedAt);
      return bTime - aTime;
    });

    const recentLots = sortedLots.slice(0, 3);
    const lastLotDate = sortedLots[0]?.executedAt ?? position.entryDate;

    return {
      position,
      sortedLots,
      recentLots,
      lastActivityDate: lastLotDate,
      lastActivityTimestamp: getTimestampFromIsoDate(lastLotDate),
      fallbackInitials: buildFallbackInitials(position.display, position.symbol),
    };
  });
}

export const buildPositionItems = buildPositionListItems;

function sortPositionItems(
  items: PositionListItem[],
  sortOption: PositionSortOption,
): PositionListItem[] {
  const sorted = [...items];

  sorted.sort((a, b) => {
    if (sortOption === 'latest_activity') {
      return (
        b.lastActivityTimestamp - a.lastActivityTimestamp ||
        a.position.symbol.localeCompare(b.position.symbol)
      );
    }

    if (sortOption === 'symbol_desc') {
      return b.position.symbol.localeCompare(a.position.symbol);
    }

    if (sortOption === 'quantity_desc') {
      return (
        b.position.quantity - a.position.quantity ||
        a.position.symbol.localeCompare(b.position.symbol)
      );
    }

    if (sortOption === 'entry_date_desc') {
      return (
        getTimestampFromIsoDate(b.position.entryDate) -
          getTimestampFromIsoDate(a.position.entryDate) ||
        a.position.symbol.localeCompare(b.position.symbol)
      );
    }

    return a.position.symbol.localeCompare(b.position.symbol);
  });

  return sorted;
}

export function filterAndSortPositionItems(
  items: PositionListItem[],
  options: {
    searchTerm: string;
    locationFilter: PositionLocationFilter;
    sortOption: PositionSortOption;
  },
): PositionListItem[] {
  const { searchTerm, locationFilter, sortOption } = options;
  const normalizedSearch = searchTerm.trim().toUpperCase();

  const filtered = items.filter(({ position }) => {
    if (locationFilter !== 'all' && position.location !== locationFilter) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const symbol = position.symbol.toUpperCase();
    const display = position.display.toUpperCase();
    return symbol.includes(normalizedSearch) || display.includes(normalizedSearch);
  });

  return sortPositionItems(filtered, sortOption);
}
