'use client';

import { createContext, createElement, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

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
import { buildPositionTimeline } from '@/lib/portfolio-timeline';
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

function usePortfolioDataState() {
  const { settings, settingsReady, refreshTrigger } = useApp();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);
  const hasDataRef = useRef(false);
  const generationRef = useRef(0);
  const requestRef = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);
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
      const valuationTime = Date.now();
      const results: SparklineResult[] = positionsList.map((position) => {
        const key = position.activationId ?? position.id ?? position.symbol;
        const points = options.candlesByKey[key] ?? [];
        const timeline = buildPositionTimeline(
          position,
          points,
          settings.annualGrowthRate,
          spyPoints,
          getFxRateAt,
          valuationTime,
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
    ({ forceQuoteRefresh = false }: LoadOptions = {}): Promise<void> => {
      if (!settingsReady) return Promise.resolve();
      if (requestRef.current) return requestRef.current.promise;
      const controller = new AbortController();
      const generation = ++generationRef.current;
      const isBackground = hasDataRef.current;
      const promise = (async () => {
      try {
      setError(null);
      if (isBackground) {
        setRefreshingCount((count) => count + 1);
      } else {
        setLoading(true);
      }

      const params = new URLSearchParams();
      if (forceQuoteRefresh) {
        params.set('forceQuoteRefresh', '1');
      }
      const query = params.toString();
      const response = await fetch(`/api/portfolio/dashboard${query ? `?${query}` : ''}`, { signal: controller.signal });
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
        : Number.NaN;
      const fxHistoryPoints = Array.isArray(payload.fxHistoryPoints) ? payload.fxHistoryPoints : [];
      const getFxRateAt = buildUsdIlsRateResolver(fxHistoryPoints, rate, { allowFallback: false });
      const batchedQuotes = payload.quotes ?? {};

        const quoteEntries = mappedPositions.map((position) => {
          const normalizedSymbol = position.symbol.trim().toUpperCase();
          const quoteData = batchedQuotes[normalizedSymbol];
          return {
            symbol: normalizedSymbol,
            currentPrice: typeof quoteData?.c === 'number' && Number.isFinite(quoteData.c) && quoteData.c > 0
              ? quoteData.c
              : Number.NaN,
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
          const quote = quoteMap.get(position.symbol.trim().toUpperCase());
          const currentPrice = quote?.currentPrice ?? Number.NaN;
          const dailyChange = quote?.dailyChange;

          const metrics = calculatePositionMetrics(
            position,
            // Closed activations have no market exposure; missing quotes must not turn zero value into NaN.
            position.quantity <= 0 && !Number.isFinite(currentPrice) ? 0 : currentPrice,
            rate,
            settings.annualGrowthRate,
            dailyChange,
            getFxRateAt,
          );
          return {
            ...metrics,
            currentPrice,
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
            // Keep historical actual P/L on the same realized + unrealized basis as today's summary.
            totalPnLUsd: netPnLUsdBeforeTax,
            totalPnLIls: netPnLIlsBeforeTax,
            netPnLUsd: netPnLUsdBeforeTax - currentTaxUsd,
            netPnLIls: netPnLIlsBeforeTax - currentTaxIls,
            expectedNetPnLUsd: expectedNetPnLUsdBeforeTax,
            expectedNetPnLIls: expectedNetPnLIlsBeforeTax,
            spyNetPnLUsd,
            spyNetPnLIls,
          };
        });

        const startOfTodayMs = toUtcDayStart(Date.now());
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

        if (controller.signal.aborted || generation !== generationRef.current) return;
        hasDataRef.current = true;
        setHasData(true);
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
        if (!controller.signal.aborted && generation === generationRef.current) {
          console.error('Error loading portfolio data:', error);
          setError('portfolio_load_failed');
        }
      } finally {
        if (generation !== generationRef.current) return;
        requestRef.current = null;
        if (isBackground) {
          setRefreshingCount((count) => Math.max(0, count - 1));
        } else {
          setLoading(false);
        }
      }
      })();
      requestRef.current = { controller, promise };
      return promise;
    },
    [loadSparklines, settings.annualGrowthRate, settingsReady]
  );

  useEffect(() => {
    if (!settingsReady) {
      return;
    }
    // An invalidation supersedes the old calculation; route changes do not remount this provider.
    requestRef.current?.controller.abort();
    requestRef.current = null;
    generationRef.current += 1;
    setRefreshingCount(0);
    void loadData();
    return () => {
      requestRef.current?.controller.abort();
      requestRef.current = null;
      generationRef.current += 1;
    };
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

  const reload = useCallback(() => loadData({ background: true, forceQuoteRefresh: true }), [loadData]);

  return {
    loading,
    error,
    hasData,
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
    reload,
  };
}

const PortfolioDataContext = createContext<ReturnType<typeof usePortfolioDataState> | null>(null);

export function PortfolioDataProvider({ children }: { children: ReactNode }) {
  const value = usePortfolioDataState();
  return createElement(PortfolioDataContext.Provider, { value }, children);
}

export function usePortfolioData() {
  const value = useContext(PortfolioDataContext);
  if (!value) throw new Error('usePortfolioData must be used within AppProvider');
  return value;
}
