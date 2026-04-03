import type { Position, PositionLocation, PositionLot, PositionLotType } from '@/types';

export interface PositionFormData {
  symbol: string;
  display: string;
  imageUrl: string;
  location: PositionLocation;
  initialPrice: number;
  initialQuantity: number;
  initialDate: string;
  initialHasCommission: boolean;
  initialCommissionAmount: number;
}

export interface TransactionFormData {
  id?: string;
  type: PositionLotType;
  price: number;
  quantity: number;
  executedAt: string;
  hasCommission: boolean;
  commissionAmount: number;
}

export type PositionLocationFilter = PositionLocation | 'all';

export type PositionSortOption =
  | 'latest_activity'
  | 'symbol_asc'
  | 'symbol_desc'
  | 'quantity_desc'
  | 'entry_date_desc';

export interface PositionListItem {
  position: Position;
  sortedLots: PositionLot[];
  recentLots: PositionLot[];
  lastActivityDate: string;
  lastActivityTimestamp: number;
  fallbackInitials: string;
}
