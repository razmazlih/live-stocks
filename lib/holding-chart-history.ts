import { calculateRequiredExitPrice, calculateSymbolExceptionAssessment } from '@/lib/calculations';
import { computeOpenLots } from '@/lib/positions';
import type { HistoricalPoint, Position, PositionLot } from '@/types';

const DAY_MS = 86_400_000;

export interface HoldingChartReference {
  timestamp: number;
  /** Average USD purchase cost of the shares still open on this day, including buy fees. */
  baseline: number | null;
  /** USD full-sale price meeting the symbol's personal goal, including earlier realized results. */
  target: number | null;
}

/**
 * References for daily closing prices, using the end of each sample's UTC day.
 * This matches portfolio daily valuation: an afternoon trade belongs to that
 * day's closing sample even when the provider timestamps its candle at midnight.
 * Later calendar days never contribute trades or realized results to an earlier
 * reference. Inputs must contain the original records of a single symbol,
 * including closed lifecycles; activation-only records omit earlier sales.
 */
export function buildHoldingChartReferences(
  positions: Position[],
  points: HistoricalPoint[],
  annualGrowthRate: number,
): HoldingChartReference[] {
  const history = Array.from(new Map(points
    .filter((point) => Number.isFinite(point.timestamp)
      && Number.isFinite(new Date(point.timestamp).getTime())
      && Number.isFinite(point.close) && point.close >= 0)
    .map((point) => [point.timestamp, point])).values())
    .sort((left, right) => left.timestamp - right.timestamp);
  const symbols = new Set(positions.map((position) => position.symbol.trim().toUpperCase()));
  const datedPositions = positions.map((position) => ({
    position,
    entryTimestamp: new Date(position.entryDate).getTime(),
    lots: (position.lots ?? []).map((lot) => ({ lot, timestamp: new Date(lot.executedAt).getTime() })),
  }));

  return history.map(({ timestamp }) => {
    const unavailable: HoldingChartReference = { timestamp, baseline: null, target: null };
    if (symbols.size !== 1 || !symbols.values().next().value) return unavailable;
    const cutoff = Math.floor(timestamp / DAY_MS) * DAY_MS + DAY_MS - 1;
    const asOf = new Date(cutoff);
    if (!Number.isFinite(asOf.getTime())) return unavailable;

    const asOfPositions = datedPositions.flatMap(({ position, entryTimestamp, lots }) => {
      const eligible: PositionLot[] = lots.filter((entry) => entry.timestamp <= cutoff).map((entry) => entry.lot);
      const undated = lots.filter((entry) => !Number.isFinite(entry.timestamp)).map((entry) => entry.lot);
      if (!eligible.length) {
        // Future records do not invalidate earlier dates. Missing or undated
        // history for an already-started record must still fail validation.
        if (entryTimestamp > cutoff || (lots.length > 0 && !undated.length)) return [];
      }
      return [{ ...position, lots: [...eligible, ...undated] }];
    });
    // Validate the transaction history independently of the user's goal so a
    // missing goal does not hide a known purchase-cost reference.
    const assessment = calculateSymbolExceptionAssessment(asOfPositions, undefined, 0, asOf);
    const validOpenHistory = assessment?.status === 'open'
      || (assessment?.status === 'invalid' && assessment.invalidReason === 'uncomputable_required_exit_price'
        && assessment.openQuantity > 0);
    if (!validOpenHistory) return unavailable;
    const target = Number.isFinite(annualGrowthRate)
      ? calculateRequiredExitPrice(asOfPositions, annualGrowthRate, asOf) ?? null
      : null;

    const openLots = asOfPositions.flatMap((position) => computeOpenLots(position.lots ?? []));
    const quantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
    const baseline = openLots.reduce((sum, lot) => sum + lot.totalCost, 0) / quantity;
    return Number.isFinite(baseline) && quantity > 0
      ? { timestamp, baseline, target }
      : unavailable;
  });
}
