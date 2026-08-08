'use client';

import { useCallback, useEffect, useState } from 'react';

import { useApp } from '@/lib/context';
import {
  computeRealizedSalesWithFx,
  expandPositionActivations,
} from '@/lib/positions';
import {
  buildPortfolioTimelinePointFromSummary,
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRequiredExitPrice,
  calculateRealizedPortfolioTotals,
  calculateRealizedTaxLiability,
  enrichPortfolioSummaryWithRealized,
  normalizeOpenPortfolioSummary,
} from '@/lib/calculations';
import {
  HistoricalPoint,
  Position,
  PositionMetrics,
  PortfolioSummary,
  PortfolioTimelinePoint,
  RealizedSale,
} from '@/types';
import { buildUsdIlsRateResolver } from '@/lib/services/historical-fx';

interface SparklineResult {
  key: string;
  symbol: string;
  points: HistoricalPoint[];
  timeline: PortfolioTimelinePoint[];
  isHistorical: boolean;
}

interface LoadSparklinesResult {
  sparklineData: Record<string, HistoricalPoint[]>;
  portfolioTimeline: PortfolioTimelinePoint[];
}

interface LoadOptions {
  background?: boolean;
  forceQuoteRefresh?: boolean;
}

interface LoadSparklinesOptions {
  candlesByKey: Record<string, HistoricalPoint[]>;
  spyPoints: HistoricalPoint[];
}

interface PortfolioDashboardPayload {
  positions?: Position[];
  activationPositions?: Position[];
  usdToIls?: number;
  fxHistoryPoints?: HistoricalPoint[];
  quotes?: Record<string, { c?: number; d?: number }>;
  candlesByKey?: Record<string, HistoricalPoint[]>;
  spyPoints?: HistoricalPoint[];
}

type NormalizedLot = {
  type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestamp: number;
};

type FxRateResolver = (timestamp: number) => number;
const msPerDay = 24 * 60 * 60 * 1000;

function parseTimestamp(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildZeroTimelinePoint(timestamp: number): PortfolioTimelinePoint {
  return {
    timestamp,
    totalPnLUsd: 0,
    totalPnLIls: 0,
    netPnLUsd: 0,
    netPnLIls: 0,
    expectedNetPnLUsd: 0,
    expectedNetPnLIls: 0,
    spyNetPnLUsd: 0,
    spyNetPnLIls: 0,
  };
}

function toUtcDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function resolveEarliestPortfolioActivityTimestamp(positions: Position[]): number | null {
  const timestamps: number[] = [];

  positions.forEach((position) => {
    const entryTimestamp = parseTimestamp(position.entryDate);
    if (entryTimestamp !== null) {
      timestamps.push(entryTimestamp);
    }

    const activationStartTimestamp = parseTimestamp(position.activationStart ?? null);
    if (activationStartTimestamp !== null) {
      timestamps.push(activationStartTimestamp);
    }

    (position.lots ?? []).forEach((lot) => {
      const lotTimestamp = parseTimestamp(lot.executedAt);
      if (lotTimestamp !== null) {
        timestamps.push(lotTimestamp);
      }
    });
  });

  if (!timestamps.length) {
    return null;
  }

  return Math.min(...timestamps);
}

function buildContinuousTimeline(
  timeline: PortfolioTimelinePoint[],
  earliestActivityTimestamp: number | null,
): PortfolioTimelinePoint[] {
  const sortedTimeline = timeline
    .filter((point) => Number.isFinite(point.timestamp))
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);

  if (!sortedTimeline.length) {
    return [];
  }

  const points: PortfolioTimelinePoint[] = [];
  const pushPoint = (point: PortfolioTimelinePoint) => {
    const last = points[points.length - 1];
    if (last && last.timestamp === point.timestamp) {
      points[points.length - 1] = point;
      return;
    }
    points.push(point);
  };

  const firstPoint = sortedTimeline[0];
  if (
    earliestActivityTimestamp !== null &&
    earliestActivityTimestamp < firstPoint.timestamp &&
    sortedTimeline.length > 1
  ) {
    pushPoint(buildZeroTimelinePoint(earliestActivityTimestamp));
  }

  pushPoint(firstPoint);

  for (let index = 1; index < sortedTimeline.length; index += 1) {
    const currentPoint = sortedTimeline[index];
    let previousPoint = points[points.length - 1];
    let previousDay = toUtcDayStart(previousPoint.timestamp);
    const currentDay = toUtcDayStart(currentPoint.timestamp);

    while (previousDay + msPerDay < currentDay) {
      previousDay += msPerDay;
      pushPoint({
        ...previousPoint,
        timestamp: previousDay,
      });
      previousPoint = points[points.length - 1];
    }

    pushPoint(currentPoint);
  }

  return points;
}

function buildPositionTimeline(
  position: Position,
  points: HistoricalPoint[],
  annualGrowthRate: number,
  spyPoints: HistoricalPoint[],
  getFxRateAt: FxRateResolver,
): PortfolioTimelinePoint[] {
  if (!points.length) {
    return [];
  }

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const normalizedLots: NormalizedLot[] = Array.isArray(position.lots)
    ? position.lots
        .map((lot, index) => ({
          type: lot.type,
          price: Number.isFinite(lot.price) ? lot.price : 0,
          quantity: Number.isFinite(lot.quantity) ? Math.max(lot.quantity, 0) : 0,
          timestamp: new Date(lot.executedAt).getTime(),
          index,
        }))
        .filter((lot) => lot.quantity > 0 && Number.isFinite(lot.timestamp))
        .sort((a, b) => {
          if (a.timestamp === b.timestamp) {
            return a.index - b.index;
          }
          return a.timestamp - b.timestamp;
        })
        .map(({ index: _index, ...lot }) => lot)
    : [];

  if (normalizedLots.length === 0 && position.quantity > 0) {
    const entryTimestamp = new Date(position.entryDate).getTime();
    if (Number.isFinite(entryTimestamp)) {
      normalizedLots.push({
        type: 'BUY',
        price: position.entryPrice,
        quantity: position.quantity,
        timestamp: entryTimestamp,
      });
    }
  }

  if (normalizedLots.length === 0) {
    if (position.quantity <= 0) {
      return points.map((point) => ({
        timestamp: point.timestamp,
        totalPnLUsd: 0,
        totalPnLIls: 0,
        netPnLUsd: 0,
        netPnLIls: 0,
        expectedNetPnLUsd: 0,
        expectedNetPnLIls: 0,
        spyNetPnLUsd: 0,
        spyNetPnLIls: 0,
      }));
    }

    const entryTimestamp = new Date(position.entryDate).getTime();
    const baselineTimestamp = Number.isFinite(entryTimestamp) ? entryTimestamp : points[0]?.timestamp ?? 0;

    const timeline = points.map((point) => {
      const openPnL = (point.close - position.entryPrice) * position.quantity;
      const fxAtPoint = getFxRateAt(point.timestamp);
      const fxAtEntry = getFxRateAt(baselineTimestamp);
      const yearsHeld = Math.max(0, (point.timestamp - baselineTimestamp) / msPerYear);
      const expectedFactor = Math.pow(1 + annualGrowthRate, yearsHeld);
      const expectedPnL = position.entryPrice * position.quantity * (expectedFactor - 1);
      const openPnLIls =
        point.close * position.quantity * fxAtPoint - position.entryPrice * position.quantity * fxAtEntry;
      const expectedPnLIls = position.entryPrice * position.quantity * fxAtEntry * (expectedFactor - 1);

      // SPY Calculation for simple position
      let spyPnL = 0;
      if (spyPoints.length > 0) {
        const entrySpyPoint = spyPoints.find(p => Math.abs(p.timestamp - baselineTimestamp) < 24 * 60 * 60 * 1000) || spyPoints[0];
        const currentSpyPoint = spyPoints.find(p => Math.abs(p.timestamp - point.timestamp) < 24 * 60 * 60 * 1000);
        
        if (entrySpyPoint && currentSpyPoint && entrySpyPoint.close > 0) {
           const spyQuantity = (position.entryPrice * position.quantity) / entrySpyPoint.close;
           spyPnL = (spyQuantity * currentSpyPoint.close) - (position.entryPrice * position.quantity);
        }
      }

      return {
        timestamp: point.timestamp,
        totalPnLUsd: openPnL,
        totalPnLIls: openPnLIls,
        netPnLUsd: openPnL,
        netPnLIls: openPnLIls,
        expectedNetPnLUsd: expectedPnL,
        expectedNetPnLIls: expectedPnLIls,
        spyNetPnLUsd: spyPnL,
        spyNetPnLIls: spyPnL * fxAtPoint,
      };
    });

    if (Number.isFinite(baselineTimestamp) && baselineTimestamp < (timeline[0]?.timestamp ?? baselineTimestamp)) {
      timeline.unshift(buildZeroTimelinePoint(baselineTimestamp));
    }

    return timeline;
  }

  // Create SPY price map for O(1) lookup
  const spyMap = new Map<number, number>();
  spyPoints.forEach(p => {
     // Normalize to midnight for better matching
     const date = new Date(p.timestamp);
     date.setHours(0,0,0,0);
     spyMap.set(date.getTime(), p.close);
  });

  const getSpyPrice = (ts: number): number | null => {
      const date = new Date(ts);
      date.setHours(0,0,0,0);
      const key = date.getTime();
      if (spyMap.has(key)) return spyMap.get(key)!;
      
      // Fallback: find nearest previous
      // Since map is not sorted by key, we might need a sorted array or just accept exact match for now.
      // Given daily resolution, exact match on date should work most of the time.
      // Let's try to find a close match in the array if map fails
      const found = spyPoints.find(p => Math.abs(p.timestamp - ts) < 24 * 60 * 60 * 1000);
      return found ? found.close : null;
  };

  const openLots: Array<{ quantity: number; price: number; timestamp: number; fxAtBuy: number }> = [];
  const timeline: PortfolioTimelinePoint[] = [];
  const firstBuyTimestamp = normalizedLots.find((lot) => lot.type === 'BUY')?.timestamp ?? null;
  const firstPointTimestamp = points[0]?.timestamp ?? null;
  if (
    firstBuyTimestamp !== null &&
    firstPointTimestamp !== null &&
    Number.isFinite(firstBuyTimestamp) &&
    firstBuyTimestamp < firstPointTimestamp
  ) {
    timeline.push(buildZeroTimelinePoint(firstBuyTimestamp));
  }
  let realizedPnL = 0;
  let realizedPnLIls = 0;
  let expectedRealizedPnL = 0;
  let expectedRealizedPnLIls = 0;
  let realizedSpyPnL = 0;
  let lotIndex = 0;

  for (const point of points) {
    const timestamp = point.timestamp;

    while (lotIndex < normalizedLots.length && normalizedLots[lotIndex].timestamp <= timestamp) {
      const lot = normalizedLots[lotIndex];
      lotIndex += 1;

      const quantity = Math.max(lot.quantity, 0);
      if (quantity === 0) {
        continue;
      }

      if (lot.type === 'BUY') {
        openLots.push({
          quantity,
          price: lot.price,
          timestamp: lot.timestamp,
          fxAtBuy: getFxRateAt(lot.timestamp),
        });
        continue;
      }

      const fxAtSell = getFxRateAt(lot.timestamp);
      let remaining = quantity;
      while (remaining > 0 && openLots.length) {
        const current = openLots[0];
        const matched = Math.min(remaining, current.quantity);
        realizedPnL += matched * (lot.price - current.price);
        realizedPnLIls += matched * (lot.price * fxAtSell - current.price * current.fxAtBuy);
        const holdingYears = Math.max(0, (lot.timestamp - current.timestamp) / msPerYear);
        const expectedFactor = Math.pow(1 + annualGrowthRate, holdingYears);
        expectedRealizedPnL += matched * current.price * (expectedFactor - 1);
        expectedRealizedPnLIls += matched * current.price * current.fxAtBuy * (expectedFactor - 1);

        // Realized SPY PnL
        const buySpyPrice = getSpyPrice(current.timestamp);
        const sellSpyPrice = getSpyPrice(lot.timestamp);
        if (buySpyPrice && sellSpyPrice && buySpyPrice > 0) {
            const spyQty = (matched * current.price) / buySpyPrice;
            realizedSpyPnL += (spyQty * sellSpyPrice) - (matched * current.price);
        }

        current.quantity -= matched;
        remaining -= matched;

        if (current.quantity <= 1e-8) {
          openLots.shift();
        }
      }
    }

    const openQuantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
    const costBasis = openLots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);
    const costBasisIls = openLots.reduce((sum, lot) => sum + lot.quantity * lot.price * lot.fxAtBuy, 0);
    const openPnL = openQuantity > 0 ? point.close * openQuantity - costBasis : 0;
    const fxAtPoint = getFxRateAt(timestamp);
    const openPnLIls = openQuantity > 0 ? point.close * openQuantity * fxAtPoint - costBasisIls : 0;
    const netPnL = openPnL + realizedPnL;
    const netPnLIls = openPnLIls + realizedPnLIls;
    const expectedOpenPnL = openLots.reduce((sum, lot) => {
      const holdingYears = Math.max(0, (timestamp - lot.timestamp) / msPerYear);
      const expectedFactor = Math.pow(1 + annualGrowthRate, holdingYears);
      return sum + lot.quantity * lot.price * (expectedFactor - 1);
    }, 0);
    const expectedOpenPnLIls = openLots.reduce((sum, lot) => {
      const holdingYears = Math.max(0, (timestamp - lot.timestamp) / msPerYear);
      const expectedFactor = Math.pow(1 + annualGrowthRate, holdingYears);
      return sum + lot.quantity * lot.price * lot.fxAtBuy * (expectedFactor - 1);
    }, 0);
    const expectedNetPnL = expectedOpenPnL + expectedRealizedPnL;
    const expectedNetPnLIls = expectedOpenPnLIls + expectedRealizedPnLIls;

    // Open SPY PnL
    const openSpyPnL = openLots.reduce((sum, lot) => {
        const buySpyPrice = getSpyPrice(lot.timestamp);
        const currentSpyPrice = getSpyPrice(timestamp);
        if (buySpyPrice && currentSpyPrice && buySpyPrice > 0) {
            const spyQty = (lot.quantity * lot.price) / buySpyPrice;
            return sum + ((spyQty * currentSpyPrice) - (lot.quantity * lot.price));
        }
        return sum;
    }, 0);
    const netSpyPnL = openSpyPnL + realizedSpyPnL;

    timeline.push({
      timestamp,
      totalPnLUsd: openPnL,
      totalPnLIls: openPnLIls,
      netPnLUsd: netPnL,
      netPnLIls,
      expectedNetPnLUsd: expectedNetPnL,
      expectedNetPnLIls,
      spyNetPnLUsd: netSpyPnL,
      spyNetPnLIls: netSpyPnL * fxAtPoint,
    });
  }

  return timeline;
}

export function usePortfolioData() {
  const { settings, settingsReady, refreshTrigger } = useApp();

  const [loading, setLoading] = useState(true);
  const [refreshingCount, setRefreshingCount] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<PositionMetrics[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [openSummary, setOpenSummary] = useState<PortfolioSummary | null>(null);
  const [sparklineData, setSparklineData] = useState<Record<string, HistoricalPoint[]>>({});
  const [portfolioTimeline, setPortfolioTimeline] = useState<PortfolioTimelinePoint[]>([]);
  const [usdToIls, setUsdToIls] = useState(3.7);
  const [historicalIlsNetPnL, setHistoricalIlsNetPnL] = useState(0);
  const [historicalIlsRealizedPnL, setHistoricalIlsRealizedPnL] = useState(0);
  const [realizedSales, setRealizedSales] = useState<RealizedSale[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadSparklines = useCallback(
    async (
      positionsList: Position[],
      getFxRateAt: FxRateResolver,
      options: LoadSparklinesOptions,
    ): Promise<LoadSparklinesResult> => {
      if (positionsList.length === 0) {
        return { sparklineData: {}, portfolioTimeline: [] };
      }

      const spyPoints = options.spyPoints ?? [];
      const results: SparklineResult[] = positionsList.map((position) => {
        const key = position.activationId ?? position.id ?? position.symbol;
        const points = options.candlesByKey[key] ?? [];
        const timeline = buildPositionTimeline(
          position,
          points,
          settings.annualGrowthRate,
          spyPoints,
          getFxRateAt,
        );

        return {
          key,
          symbol: position.symbol,
          points,
          timeline,
          isHistorical: Boolean(position.isHistoricalActivation),
        };
      });

      const sparklineEntries = results.map((result) => [result.key, result.points] as const);
      const sparklineData = Object.fromEntries(sparklineEntries);
      const timelineResults = results.filter((result) => result.timeline.length > 0);

      if (timelineResults.length === 0) {
        return {
          sparklineData,
          portfolioTimeline: [],
        };
      }

      const timestampSet = new Set<number>();
      timelineResults.forEach((result) => {
        result.timeline.forEach((point) => {
          timestampSet.add(point.timestamp);
        });
      });

      const sortedTimestamps = Array.from(timestampSet).sort((a, b) => a - b);

      type SegmentState = {
        timeline: PortfolioTimelinePoint[];
        index: number;
        lastPoint?: PortfolioTimelinePoint;
      };

      const segmentStates: SegmentState[] = timelineResults.map((result) => ({
        timeline: [...result.timeline].sort((a, b) => a.timestamp - b.timestamp),
        index: 0,
        lastPoint: undefined,
      }));

      const aggregatedTimelinePoints: PortfolioTimelinePoint[] = sortedTimestamps.map((timestamp) => {
        let totalPnLUsd = 0;
        let totalPnLIls = 0;
        let netPnLUsd = 0;
        let netPnLIls = 0;
        let expectedNetPnLUsd = 0;
        let expectedNetPnLIls = 0;
        let spyNetPnLUsd = 0;
        let spyNetPnLIls = 0;

        segmentStates.forEach((state) => {
          while (state.index < state.timeline.length && state.timeline[state.index].timestamp <= timestamp) {
            state.lastPoint = state.timeline[state.index];
            state.index += 1;
          }

          if (state.lastPoint && state.lastPoint.timestamp <= timestamp) {
            totalPnLUsd += state.lastPoint.totalPnLUsd;
            totalPnLIls += state.lastPoint.totalPnLIls;
            netPnLUsd += state.lastPoint.netPnLUsd;
            netPnLIls += state.lastPoint.netPnLIls;
            expectedNetPnLUsd += state.lastPoint.expectedNetPnLUsd;
            expectedNetPnLIls += state.lastPoint.expectedNetPnLIls;
            spyNetPnLUsd += state.lastPoint.spyNetPnLUsd;
            spyNetPnLIls += state.lastPoint.spyNetPnLIls;
          }
        });

        return {
          timestamp,
          totalPnLUsd,
          totalPnLIls,
          netPnLUsd,
          netPnLIls,
          expectedNetPnLUsd,
          expectedNetPnLIls,
          spyNetPnLUsd,
          spyNetPnLIls,
        };
      });

      const lastAggregatedPoint = aggregatedTimelinePoints[aggregatedTimelinePoints.length - 1];
      const nowTimestamp = Date.now();
      if (lastAggregatedPoint && lastAggregatedPoint.timestamp < nowTimestamp) {
        aggregatedTimelinePoints.push({
          ...lastAggregatedPoint,
          timestamp: nowTimestamp,
        });
      }

      return {
        sparklineData,
        portfolioTimeline: aggregatedTimelinePoints,
      };
    },
    [settings.annualGrowthRate]
  );

  const loadData = useCallback(
    async ({ background = false, forceQuoteRefresh = false }: LoadOptions = {}) => {
      if (!settingsReady) {
        return;
      }

      try {
      if (background) {
        setRefreshingCount((count) => count + 1);
      } else {
        setLoading(true);
      }

      const params = new URLSearchParams();
      if (forceQuoteRefresh) {
        params.set('forceQuoteRefresh', '1');
      }
      const query = params.toString();
      const response = await fetch(`/api/portfolio/dashboard${query ? `?${query}` : ''}`);
      if (!response.ok) {
        throw new Error(`Dashboard request failed: HTTP ${response.status}`);
      }

      const payload = (await response.json()) as PortfolioDashboardPayload;

      const mappedPositions = Array.isArray(payload.positions) ? payload.positions : [];
      const activationPositions = Array.isArray(payload.activationPositions)
        ? payload.activationPositions
        : mappedPositions.flatMap((position) => expandPositionActivations(position));
      const rate = Number.isFinite(payload.usdToIls) && (payload.usdToIls ?? 0) > 0
        ? (payload.usdToIls as number)
        : 3.7;
      const fxHistoryPoints = Array.isArray(payload.fxHistoryPoints) ? payload.fxHistoryPoints : [];
      const getFxRateAt = buildUsdIlsRateResolver(fxHistoryPoints, rate);
      const batchedQuotes = payload.quotes ?? {};

        const quoteEntries = mappedPositions.map((position) => {
          const normalizedSymbol = position.symbol.trim().toUpperCase();
          const quoteData = batchedQuotes[normalizedSymbol];
          return {
            symbol: position.symbol,
            currentPrice: quoteData?.c ?? position.entryPrice,
            dailyChange: quoteData?.d,
          };
        });

        const quoteMap = new Map<string, { currentPrice: number; dailyChange?: number }>();
        quoteEntries.forEach((entry) => {
          quoteMap.set(entry.symbol, {
            currentPrice: entry.currentPrice,
            dailyChange: entry.dailyChange,
          });
        });

        const positionsBySymbol = new Map<string, Position[]>();
        mappedPositions.forEach((position) => {
          const symbol = position.symbol.trim().toUpperCase();
          positionsBySymbol.set(symbol, [...(positionsBySymbol.get(symbol) ?? []), position]);
        });
        const requiredExitPriceBySymbol = new Map(
          Array.from(positionsBySymbol.entries()).map(([symbol, symbolPositions]) => [
            symbol,
            calculateRequiredExitPrice(symbolPositions, settings.annualGrowthRate),
          ]),
        );

        const calculatedMetrics = activationPositions.map((position) => {
          const quote = quoteMap.get(position.symbol);
          const currentPrice = quote?.currentPrice ?? position.entryPrice;
          const dailyChange = quote?.dailyChange;

          const metrics = calculatePositionMetrics(
            position,
            currentPrice,
            rate,
            settings.annualGrowthRate,
            dailyChange
          );
          return {
            ...metrics,
            requiredExitPrice: position.quantity > 0
              ? requiredExitPriceBySymbol.get(position.symbol.trim().toUpperCase())
              : undefined,
          };
        });
        const portfolioSummary = calculatePortfolioSummary(calculatedMetrics, rate);
        const openMetrics = calculatedMetrics.filter((metric) => metric.position.quantity > 0);
        const openSummaryBase = calculatePortfolioSummary(openMetrics, rate);
        const realizedSalesWithFx = mappedPositions.flatMap((position) =>
          computeRealizedSalesWithFx(position, getFxRateAt),
        );
        const annualGrowthRate = Number.isFinite(settings.annualGrowthRate)
          ? settings.annualGrowthRate
          : 0;

        const realizedTotals = calculateRealizedPortfolioTotals(
          realizedSalesWithFx,
          annualGrowthRate,
          rate,
          getFxRateAt,
        );

        const chronologicalSales = realizedSalesWithFx
          .slice()
          .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());

        const taxSummary = calculateRealizedTaxLiability(
          chronologicalSales.map((sale) => ({
            profitUsd: sale.profitUsd,
            profitIls: sale.profitIls ?? sale.profitUsd * rate,
            timestamp: new Date(sale.sellDate).getTime(),
          }))
        );

        const normalizedOpenSummary = normalizeOpenPortfolioSummary(openSummaryBase);
        const enrichedSummary = enrichPortfolioSummaryWithRealized(portfolioSummary, realizedTotals, taxSummary);

        const { sparklineData: nextSparklineData, portfolioTimeline: nextPortfolioTimeline } =
          await loadSparklines(activationPositions, getFxRateAt, {
            candlesByKey: payload.candlesByKey ?? {},
            spyPoints: payload.spyPoints ?? [],
          });

        const taxTimeline = taxSummary.timeline
          .slice()
          .sort((a, b) => a.timestamp - b.timestamp);

        let currentTaxUsd = 0;
        let currentTaxIls = 0;
        let taxIndex = 0;

        const adjustedTimeline = nextPortfolioTimeline.map((point) => {
          while (taxIndex < taxTimeline.length && taxTimeline[taxIndex].timestamp <= point.timestamp) {
            currentTaxUsd = taxTimeline[taxIndex].cumulativeTaxUsd;
            currentTaxIls = taxTimeline[taxIndex].cumulativeTaxIls;
            taxIndex += 1;
          }

          const netPnLUsdBeforeTax = point.netPnLUsd;
          const netPnLIlsBeforeTax = point.netPnLIls;
          const expectedNetPnLUsdBeforeTax = point.expectedNetPnLUsd;
          const expectedNetPnLIlsBeforeTax = point.expectedNetPnLIls;
          const spyNetPnLUsd = point.spyNetPnLUsd;
          const spyNetPnLIls = point.spyNetPnLIls;

          return {
            ...point,
            netPnLUsd: netPnLUsdBeforeTax - currentTaxUsd,
            netPnLIls: netPnLIlsBeforeTax - currentTaxIls,
            expectedNetPnLUsd: expectedNetPnLUsdBeforeTax,
            expectedNetPnLIls: expectedNetPnLIlsBeforeTax,
            spyNetPnLUsd,
            spyNetPnLIls,
          };
        });

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const startOfTodayMs = startOfToday.getTime();
        const endOfTodayMs = startOfTodayMs + 24 * 60 * 60 * 1000 - 1;

        const timelineWithoutToday = adjustedTimeline.filter(
          (point) => point.timestamp < startOfTodayMs || point.timestamp > endOfTodayMs
        );

        const todayPoint = buildPortfolioTimelinePointFromSummary(
          enrichedSummary,
          Date.now(),
          timelineWithoutToday[timelineWithoutToday.length - 1],
        );

        const finalTimeline = [...timelineWithoutToday, todayPoint].sort(
          (a, b) => a.timestamp - b.timestamp
        );
        const earliestActivityTimestamp =
          nextPortfolioTimeline.length > 0
            ? resolveEarliestPortfolioActivityTimestamp(activationPositions)
            : null;
        const continuousTimeline = buildContinuousTimeline(finalTimeline, earliestActivityTimestamp);

        setPositions(mappedPositions);
        setUsdToIls(rate);
        setMetrics(calculatedMetrics);
        setSummary(enrichedSummary);
        setOpenSummary(normalizedOpenSummary);
        setSparklineData(nextSparklineData);
        setPortfolioTimeline(continuousTimeline);
        setHistoricalIlsNetPnL(
          continuousTimeline[continuousTimeline.length - 1]?.netPnLIls ?? enrichedSummary.totalNetPnLIls
        );
        setHistoricalIlsRealizedPnL(realizedTotals.profitIls);
        setRealizedSales(realizedSalesWithFx);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Error loading portfolio data:', error);
      } finally {
        if (background) {
          setRefreshingCount((count) => Math.max(0, count - 1));
        } else {
          setLoading(false);
        }
      }
    },
    [loadSparklines, settings.annualGrowthRate, settingsReady]
  );

  useEffect(() => {
    if (!settingsReady) {
      return;
    }
    void loadData();
  }, [loadData, refreshTrigger, settingsReady]);

  useEffect(() => {
    if (!settingsReady) {
      return;
    }

    if (!settings.refreshInterval || settings.refreshInterval <= 0) {
      return;
    }

    const intervalMs = settings.refreshInterval * 60 * 1000;
    const intervalId = window.setInterval(() => {
      void loadData({ background: true });
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadData, settings.refreshInterval, settingsReady]);

  return {
    loading,
    refreshing: refreshingCount > 0,
    positions,
    metrics,
    summary,
    openSummary,
    sparklineData,
    portfolioTimeline,
    usdToIls,
    historicalIlsNetPnL,
    historicalIlsRealizedPnL,
    realizedSales,
    lastUpdate,
    reload: () => loadData({ background: true, forceQuoteRefresh: true }),
  };
}
