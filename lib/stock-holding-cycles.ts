import { expandPositionActivations } from '@/lib/positions';
import type { Position } from '@/types';

export interface StockHoldingCycle {
  id: string;
  start: number;
  end: number | null;
  current: boolean;
  position: Position;
}

/** Keep account lifecycles separate: a sale in one account cannot close another. */
export function buildStockHoldingCycles(positions: Position[]): StockHoldingCycle[] {
  return positions.flatMap((source, sourceIndex) =>
    expandPositionActivations(source).flatMap((position) => {
      const start = new Date(position.activationStart ?? position.entryDate).getTime();
      const end = position.activationEnd ? new Date(position.activationEnd).getTime() : null;
      if (!Number.isFinite(start) || (end !== null && (!Number.isFinite(end) || end < start))) {
        return [];
      }

      return [{
        id: `${source.id ?? `${source.symbol}:${source.location}:${sourceIndex}`}:${position.activationId ?? position.activationIndex ?? 0}`,
        start,
        end,
        current: position.quantity > 0 && !position.isHistoricalActivation && end === null,
        position,
      }];
    }),
  ).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
