import { Position, PositionLot, PositionLotType } from '@/types';

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

interface SupabasePositionLot {
  id: string;
  position_id: string;
  side: PositionLotType;
  price: number | string;
  quantity: number | string;
  executed_at: string;
}

interface SupabasePositionRow {
  id: string;
  symbol: string;
  display: string;
  image_url: string;
  entry_price?: number | string | null;
  quantity?: number | string | null;
  entry_date?: string | null;
  position_lots?: SupabasePositionLot[] | null;
}

export interface OpenLot {
  id?: string;
  price: number;
  quantity: number;
  executedAt: string;
}

export interface PositionSummary {
  openLots: OpenLot[];
  totalQuantity: number;
  costBasis: number;
  averageEntryPrice: number;
  earliestEntryDate?: string;
  weightedHoldingYears: number;
}

function parseNumeric(value?: number | string | null): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeLot(lot: SupabasePositionLot): PositionLot {
  return {
    id: lot.id,
    positionId: lot.position_id,
    type: lot.side,
    price: parseNumeric(lot.price),
    quantity: parseNumeric(lot.quantity),
    executedAt: lot.executed_at,
  };
}

export function computeOpenLots(lots: PositionLot[]): OpenLot[] {
  if (!lots.length) {
    return [];
  }

  const sorted = [...lots].sort((a, b) => {
    const aTime = new Date(a.executedAt).getTime();
    const bTime = new Date(b.executedAt).getTime();
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
      return 0;
    }
    return aTime - bTime;
  });

  const queue: OpenLot[] = [];

  for (const lot of sorted) {
    const quantity = Number.isFinite(lot.quantity) ? Math.max(lot.quantity, 0) : 0;
    if (quantity === 0) {
      continue;
    }

    if (lot.type === 'BUY') {
      queue.push({ id: lot.id, price: lot.price, quantity, executedAt: lot.executedAt });
      continue;
    }

    let remaining = quantity;
    while (remaining > 0 && queue.length) {
      const current = queue[0];
      if (current.quantity > remaining) {
        current.quantity -= remaining;
        remaining = 0;
      } else {
        remaining -= current.quantity;
        queue.shift();
      }
    }
  }

  return queue.filter((lot) => lot.quantity > 0);
}

export function summarizeLots(lots: PositionLot[], asOf: Date = new Date()): PositionSummary {
  const openLots = computeOpenLots(lots);

  if (!openLots.length) {
    return {
      openLots: [],
      totalQuantity: 0,
      costBasis: 0,
      averageEntryPrice: 0,
      weightedHoldingYears: 0,
    };
  }

  const totalQuantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
  const costBasis = openLots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);
  const averageEntryPrice = totalQuantity > 0 ? costBasis / totalQuantity : 0;

  const earliestEntryDate = openLots.reduce<string | undefined>((earliest, lot) => {
    if (!lot.executedAt) {
      return earliest;
    }

    if (!earliest) {
      return lot.executedAt;
    }

    return new Date(lot.executedAt) < new Date(earliest) ? lot.executedAt : earliest;
  }, undefined);

  const weightedHoldingYears = totalQuantity > 0
    ? openLots.reduce((acc, lot) => {
        const executedAt = new Date(lot.executedAt);
        if (Number.isNaN(executedAt.getTime())) {
          return acc;
        }
        const heldYears = Math.max((asOf.getTime() - executedAt.getTime()) / MS_PER_YEAR, 0);
        return acc + heldYears * lot.quantity;
      }, 0) / totalQuantity
    : 0;

  return {
    openLots,
    totalQuantity,
    costBasis,
    averageEntryPrice,
    earliestEntryDate,
    weightedHoldingYears,
  };
}

export function mapPositionRow(row: SupabasePositionRow): Position {
  const lots = Array.isArray(row.position_lots)
    ? row.position_lots.map(normalizeLot).filter((lot) => lot.quantity > 0)
    : [];

  const summary = summarizeLots(lots);

  const fallbackQuantity = parseNumeric(row.quantity);
  const fallbackEntryPrice = parseNumeric(row.entry_price);
  const fallbackEntryDate = row.entry_date ?? new Date().toISOString();

  const quantity = summary.totalQuantity > 0 ? summary.totalQuantity : fallbackQuantity;
  const entryPrice = summary.totalQuantity > 0 ? summary.averageEntryPrice : fallbackEntryPrice;
  const entryDate = summary.earliestEntryDate ?? fallbackEntryDate;

  return {
    id: row.id,
    symbol: row.symbol,
    display: row.display,
    imageUrl: row.image_url,
    entryPrice,
    quantity,
    entryDate,
    lots,
  };
}
