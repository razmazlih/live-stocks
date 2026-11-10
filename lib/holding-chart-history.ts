import { calculateRequiredExitPrice, calculateSymbolExceptionAssessment } from '@/lib/calculations';
import { computeOpenLots, computeRealizedSales } from '@/lib/positions';
import type { HistoricalPoint, Position, PositionLot } from '@/types';

const DAY_MS = 86_400_000;

export interface HoldingChartReference {
  timestamp: number;
  /** Average USD purchase cost of the shares still open on this day, including buy fees. */
  baseline: number | null;
  /** USD full-sale price meeting the symbol's personal goal, including earlier realized results. */
  target: number | null;
}

function dailyHoldingStates(positions: Position[], points: HistoricalPoint[]) {
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

  return history.map((point) => {
    const cutoff = Math.floor(point.timestamp / DAY_MS) * DAY_MS + DAY_MS - 1;
    const asOf = new Date(cutoff);
    const asOfPositions = datedPositions.flatMap(({ position, entryTimestamp, lots }) => {
      const eligible: PositionLot[] = lots.filter((entry) => entry.timestamp <= cutoff).map((entry) => entry.lot);
      const undated = lots.filter((entry) => !Number.isFinite(entry.timestamp)).map((entry) => entry.lot);
      if (!eligible.length && (entryTimestamp > cutoff || (lots.length > 0 && !undated.length))) return [];
      return [{ ...position, lots: [...eligible, ...undated] }];
    });
    // A known realized gain can make the required sale price uncomputable
    // (negative), without invalidating any of the transaction history.
    const assessment = symbols.size === 1 && symbols.values().next().value && Number.isFinite(asOf.getTime())
      ? calculateSymbolExceptionAssessment(asOfPositions, undefined, 0, asOf)
      : undefined;
    const valid = assessment?.status === 'open' || assessment?.status === 'closed'
      || (assessment?.status === 'invalid' && assessment.invalidReason === 'uncomputable_required_exit_price'
        && assessment.openQuantity > 0);
    return { point, cutoff, asOf, asOfPositions, valid };
  });
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
  return dailyHoldingStates(positions, points).map(({ point: { timestamp }, asOf, asOfPositions, valid }) => {
    const unavailable: HoldingChartReference = { timestamp, baseline: null, target: null };
    if (!valid) return unavailable;
    const openLots = asOfPositions.flatMap((position) => computeOpenLots(position.lots ?? []));
    const quantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
    const baseline = openLots.reduce((sum, lot) => sum + lot.totalCost, 0) / quantity;
    const target = Number.isFinite(annualGrowthRate)
      ? calculateRequiredExitPrice(asOfPositions, annualGrowthRate, asOf) ?? null
      : null;
    return Number.isFinite(baseline) && quantity > 0 ? { timestamp, baseline, target } : unavailable;
  });
}

export interface HoldingPerformancePoint {
  timestamp: number;
  /** Cumulative realized + unrealized USD profit after recorded fees and before tax. */
  actual: number | null;
  /** Personal USD profit goal for the same complete symbol history. */
  target: number | null;
}

/**
 * Cumulative symbol performance at each daily close. Unlike an average cost or
 * required sale price, these amounts keep the same basis when shares are bought,
 * partially sold, fully closed or reopened. A sold portion's goal stops accruing
 * at its sale time; remaining shares accrue through the sample's UTC day-end.
 * No future sale fee or tax is estimated, and missing goals do not hide known P/L.
 */
export function buildHoldingPerformanceHistory(
  positions: Position[],
  points: HistoricalPoint[],
  annualGrowthRate: number,
): HoldingPerformancePoint[] {
  const MS_PER_YEAR = 365.25 * DAY_MS;
  const expectedProfit = (cost: number, boughtAt: number, through: number) =>
    cost * (Math.pow(1 + annualGrowthRate, Math.max((through - boughtAt) / MS_PER_YEAR, 0)) - 1);

  return dailyHoldingStates(positions, points).map(({ point: { timestamp, close }, cutoff, asOfPositions, valid }) => {
    if (!valid) return { timestamp, actual: null, target: null };
    const openLots = asOfPositions.flatMap((position) => computeOpenLots(position.lots ?? []));
    const realized = asOfPositions.flatMap(computeRealizedSales);
    const actual = realized.reduce((sum, sale) => sum + sale.profitUsd, 0)
      + openLots.reduce((sum, lot) => sum + close * lot.quantity - lot.totalCost, 0);
    const expectedOpen = openLots.reduce((sum, lot) =>
      sum + expectedProfit(lot.totalCost, new Date(lot.executedAt).getTime(), cutoff), 0);
    const expectedRealized = realized.reduce((sum, sale) => {
      const soldAt = new Date(sale.sellDate).getTime();
      return sum + (sale.matchedLots
        ? sale.matchedLots.reduce((total, lot) => total + expectedProfit(lot.costBasisUsd, lot.buyTimestamp, soldAt), 0)
        : expectedProfit(sale.costBasisUsd, soldAt - (sale.holdingPeriodDays ?? 0) * DAY_MS, soldAt));
    }, 0);
    const target = expectedOpen + expectedRealized;
    return {
      timestamp,
      actual: Number.isFinite(actual) ? actual : null,
      target: Number.isFinite(annualGrowthRate) && Number.isFinite(target) ? target : null,
    };
  });
}
