import { LotExit, Position, PositionLot } from '@/types';
import { summarizePositionLots } from './calculations';

function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const parsed = Number((value as { toString(): string }).toString());
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeDate(value: unknown): string {
  if (!value) {
    return new Date().toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return new Date().toISOString();
}

function normalizeExit(exit: any): LotExit {
  return {
    id: exit?.id,
    quantity: parseNumber(exit?.quantity ?? exit?.exit_quantity),
    exitPrice: parseNumber(exit?.exitPrice ?? exit?.exit_price),
    exitDate: normalizeDate(exit?.exitDate ?? exit?.exit_date),
  };
}

function normalizeLot(rawLot: any): PositionLot {
  const exits = Array.isArray(rawLot?.exits) ? rawLot.exits.map(normalizeExit) : [];

  return {
    id: rawLot?.id,
    entryPrice: parseNumber(rawLot?.entryPrice ?? rawLot?.entry_price),
    entryQuantity: parseNumber(rawLot?.entryQuantity ?? rawLot?.entry_quantity ?? rawLot?.quantity),
    entryDate: normalizeDate(rawLot?.entryDate ?? rawLot?.entry_date),
    exits,
  };
}

export function mapSupabasePosition(record: any): Position {
  const lots = Array.isArray(record?.lots)
    ? record.lots.map(normalizeLot).filter((lot) => lot.entryQuantity > 0)
    : [];

  if (!lots.length) {
    lots.push({
      entryPrice: parseNumber(record?.entry_price),
      entryQuantity: parseNumber(record?.quantity),
      entryDate: normalizeDate(record?.entry_date),
      exits: [],
    });
  }

  const summary = summarizePositionLots(lots, 0, new Date());
  const fallbackEntryPrice = parseNumber(record?.entry_price);
  const fallbackQuantity = parseNumber(record?.quantity);
  const fallbackDate = normalizeDate(record?.entry_date);

  return {
    id: record?.id,
    symbol: record?.symbol ?? '',
    display: record?.display ?? record?.symbol ?? '',
    imageUrl: record?.image_url ?? record?.imageUrl ?? '',
    entryPrice: summary.averageEntryPrice || fallbackEntryPrice,
    quantity: summary.totalQuantity || fallbackQuantity,
    entryDate: summary.weightedEntryDate || fallbackDate,
    lots,
  };
}

export function preparePositionPersistencePayload(position: Partial<Position>) {
  const lots = position.lots && position.lots.length > 0 ? position.lots : [];
  const normalizedLots = lots.map((lot) => ({
    ...lot,
    entryDate: normalizeDate(lot.entryDate),
    exits: (lot.exits || []).map((exit) => ({
      ...exit,
      exitDate: normalizeDate(exit.exitDate),
    })),
  }));
  const summary = summarizePositionLots(normalizedLots, 0, new Date());
  const firstLot = normalizedLots[0];

  return {
    symbol: position.symbol,
    display: position.display,
    image_url: position.imageUrl || (position.symbol ? `https://logo.clearbit.com/${position.symbol.toLowerCase()}.com` : null),
    entry_price: summary.averageEntryPrice || position.entryPrice || firstLot?.entryPrice || 0,
    quantity: summary.totalQuantity || position.quantity || firstLot?.entryQuantity || 0,
    entry_date: summary.weightedEntryDate || position.entryDate || firstLot?.entryDate,
    lots: normalizedLots,
    updated_at: new Date().toISOString(),
  };
}

export function formatDateForInput(date: string | undefined): string {
  if (!date) {
    return new Date().toISOString().split('T')[0];
  }
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  return d.toISOString().split('T')[0];
}
