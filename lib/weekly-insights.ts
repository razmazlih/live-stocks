import type { HistoricalPoint, PortfolioSummary, PortfolioTimelinePoint, PositionMetrics } from '@/types';

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

export interface WeeklySnapshot {
  baselineTimestamp: number | null;
  currentTimestamp: number | null;
  netPnLDeltaUsd: number;
  projectedPnLDeltaUsd: number;
  forecastGapDeltaUsd: number;
  currentDailyMomentumUsd: number;
}

export interface WeeklyPositionMove {
  key: string;
  symbol: string;
  display: string;
  changeUsd: number;
  changePercent: number;
}

export function buildWeeklySnapshot(
  timeline: PortfolioTimelinePoint[],
  summary: PortfolioSummary | null
): WeeklySnapshot {
  if (!summary || timeline.length === 0) {
    return {
      baselineTimestamp: null,
      currentTimestamp: null,
      netPnLDeltaUsd: 0,
      projectedPnLDeltaUsd: 0,
      forecastGapDeltaUsd: 0,
      currentDailyMomentumUsd: 0,
    };
  }

  const sorted = timeline.slice().sort((a, b) => a.timestamp - b.timestamp);
  const currentPoint = sorted[sorted.length - 1];
  const baselinePoint = findBaselinePoint(sorted, currentPoint.timestamp);

  const netPnLDeltaUsd = currentPoint.netPnLUsd - baselinePoint.netPnLUsd;
  const projectedPnLDeltaUsd = currentPoint.expectedNetPnLUsd - baselinePoint.expectedNetPnLUsd;
  const forecastGapDeltaUsd = netPnLDeltaUsd - projectedPnLDeltaUsd;

  return {
    baselineTimestamp: baselinePoint.timestamp,
    currentTimestamp: currentPoint.timestamp,
    netPnLDeltaUsd,
    projectedPnLDeltaUsd,
    forecastGapDeltaUsd,
    currentDailyMomentumUsd: summary.totalCurrentPnLUsd - baselinePoint.totalPnLUsd,
  };
}

export function buildWeeklyActionItems(metrics: PositionMetrics[], limit: number = 3): PositionMetrics[] {
  return metrics
    .filter((metric) => metric.position.quantity > 0 && metric.combined < -0.01)
    .sort((a, b) => a.combined - b.combined)
    .slice(0, limit);
}

export function buildWeeklyMovers(
  metrics: PositionMetrics[],
  sparklineData: Record<string, HistoricalPoint[]>,
  limit: number = 3
): {
  improved: WeeklyPositionMove[];
  worsened: WeeklyPositionMove[];
} {
  const moves = metrics
    .filter((metric) => metric.position.quantity > 0)
    .map((metric) => {
      const key = metric.position.activationId ?? metric.position.id ?? metric.position.symbol;
      const points = sparklineData[key] ?? [];
      if (points.length < 2) {
        return null;
      }

      const sortedPoints = points.slice().sort((a, b) => a.timestamp - b.timestamp);
      const currentPoint = sortedPoints[sortedPoints.length - 1];
      const baselinePoint = findBaselinePricePoint(sortedPoints, currentPoint.timestamp);
      const priceDelta = currentPoint.close - baselinePoint.close;
      const changeUsd = priceDelta * metric.position.quantity;
      const changePercent = baselinePoint.close !== 0 ? (priceDelta / baselinePoint.close) * 100 : 0;

      return {
        key,
        symbol: metric.position.symbol,
        display: metric.position.display || metric.position.symbol,
        changeUsd,
        changePercent,
      };
    })
    .filter((move): move is WeeklyPositionMove => Boolean(move));

  const improved = moves
    .filter((move) => move.changeUsd > 0)
    .sort((a, b) => b.changeUsd - a.changeUsd)
    .slice(0, limit);

  const worsened = moves
    .filter((move) => move.changeUsd < 0)
    .sort((a, b) => a.changeUsd - b.changeUsd)
    .slice(0, limit);

  return { improved, worsened };
}

function findBaselinePoint(sortedPoints: PortfolioTimelinePoint[], latestTimestamp: number): PortfolioTimelinePoint {
  const threshold = latestTimestamp - WEEK_IN_MS;
  for (let index = sortedPoints.length - 1; index >= 0; index -= 1) {
    if (sortedPoints[index].timestamp <= threshold) {
      return sortedPoints[index];
    }
  }
  return sortedPoints[0];
}

function findBaselinePricePoint(sortedPoints: HistoricalPoint[], latestTimestamp: number): HistoricalPoint {
  const threshold = latestTimestamp - WEEK_IN_MS;
  for (let index = sortedPoints.length - 1; index >= 0; index -= 1) {
    if (sortedPoints[index].timestamp <= threshold) {
      return sortedPoints[index];
    }
  }
  return sortedPoints[0];
}
