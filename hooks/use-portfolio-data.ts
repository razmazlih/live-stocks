'use client';

import { createContext, createElement, useContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useApp } from '@/lib/context';
import { useLiveQuotes } from '@/hooks/use-live-quotes';
import { applySessionTicks, repricePortfolio, valuePortfolio, type PortfolioValuation } from '@/lib/portfolio-valuation';
import { isReviewActive, portfolioNow } from '@/lib/demo/review';
import { getMarketClock } from '@/lib/utils/trading-hours';
import { buildMarketOverview, demoMarketBasis, type MarketOverview, type SymbolMarketData } from '@/lib/market-overview';
import { getLocalDemoDashboard } from '@/lib/supabase';
import { expandPositionActivations } from '@/lib/positions';
import { buildPortfolioTimelinePointFromSummary } from '@/lib/calculations';
import {
  HistoricalPoint,
  Position,
  PortfolioTimelinePoint,
  RealizedSale,
} from '@/types';
import { buildPositionTimeline } from '@/lib/portfolio-timeline';

interface SparklineResult {
  key: string;
  points: HistoricalPoint[];
  timeline: PortfolioTimelinePoint[];
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
  valuationTime: number;
}

interface PortfolioDashboardPayload {
  deferredHistory?: boolean;
  marks?: Record<string, SymbolMarketData>;
  asOf?: number;
  marketOverview?: MarketOverview;
  positions?: Position[];
  activationPositions?: Position[];
  usdToIls?: number;
  fxHistoryPoints?: HistoricalPoint[];
  quotes?: Record<string, { c?: number; d?: number; t?: number; pc?: number }>;
  candlesByKey?: Record<string, HistoricalPoint[]>;
  contextCandlesByKey?: Record<string, HistoricalPoint[]>;
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
    commissionUsd: 0,
    commissionIls: 0,
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
  let earliest = Number.POSITIVE_INFINITY;
  for (const position of positions) {
    earliest = Math.min(
      earliest,
      parseTimestamp(position.entryDate) ?? Number.POSITIVE_INFINITY,
      parseTimestamp(position.activationStart) ?? Number.POSITIVE_INFINITY,
    );
    for (const lot of position.lots ?? []) {
      earliest = Math.min(earliest, parseTimestamp(lot.executedAt) ?? Number.POSITIVE_INFINITY);
    }
  }
  return Number.isFinite(earliest) ? earliest : null;
}

function buildContinuousTimeline(
  timeline: PortfolioTimelinePoint[],
  earliestActivityTimestamp: number | null,
): PortfolioTimelinePoint[] {
  const sortedTimeline = timeline
    .filter((point) => Number.isFinite(point.timestamp))
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

type PortfolioScope = 'overview' | 'performance' | 'idle';

async function fetchDashboard(part: 'core' | 'market' | 'history', signal: AbortSignal, options?: URLSearchParams) {
  const params = new URLSearchParams(options);
  params.set('part', part);
  const response = await fetch('/api/portfolio/dashboard?' + params, { signal });
  if (!response.ok) throw new Error('Dashboard ' + part + ' request failed: HTTP ' + response.status);
  return await response.json() as PortfolioDashboardPayload;
}

function usePortfolioDataState(scope: PortfolioScope) {
  const { settings, settingsReady, refreshTrigger } = useApp();

  const [marketOverview, setMarketOverview] = useState<MarketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasData, setHasData] = useState(false);
  const hasDataRef = useRef(false);
  const generationRef = useRef(0);
  const requestRef = useRef<{ controller: AbortController; promise: Promise<void> } | null>(null);
  const [refreshingCount, setRefreshingCount] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [valuation, setValuation] = useState<PortfolioValuation | null>(null);
  const [marketBasis, setMarketBasis] = useState<{ marks: Record<string, SymbolMarketData>; asOf: number; fxHistoryPoints: HistoricalPoint[] } | null>(null);
  const [contextSparklineData, setContextSparklineData] = useState<Record<string, HistoricalPoint[]>>({});
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
      const valuationTime = options.valuationTime;
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
          points,
          timeline,
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
        let commissionUsd = 0;
        let commissionIls = 0;
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
            commissionUsd += state.lastPoint.commissionUsd ?? 0;
            commissionIls += state.lastPoint.commissionIls ?? 0;
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
          commissionUsd,
          commissionIls,
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
      if (!settingsReady || scope === 'idle') return Promise.resolve();
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
      const isCurrent = () => !controller.signal.aborted && generation === generationRef.current;
      const localRequest = getLocalDemoDashboard(controller.signal);
      const localPayload = localRequest ? await localRequest : null;
      const payload: PortfolioDashboardPayload = localPayload ?? await fetchDashboard('core', controller.signal, params);
      if (!isCurrent()) return;

      const valuationTime = payload.asOf ?? Date.now();
      const mappedPositions = Array.isArray(payload.positions) ? payload.positions : [];
      const activationPositions = Array.isArray(payload.activationPositions)
        ? payload.activationPositions
        : mappedPositions.flatMap((position) => expandPositionActivations(position));
      const rate = Number.isFinite(payload.usdToIls) && (payload.usdToIls ?? 0) > 0
        ? (payload.usdToIls as number)
        : Number.NaN;
      const fxHistoryPoints = Array.isArray(payload.fxHistoryPoints) ? payload.fxHistoryPoints : [];
      const batchedQuotes = payload.quotes ?? {};

      const nextValuation = valuePortfolio({ positions: mappedPositions, activationPositions, quotes: batchedQuotes,
        fxHistoryPoints, rate, valuationTime }, settings.annualGrowthRate);
      const { getFxRateAt, summary: enrichedSummary, realizedTotals, taxSummary, sales: realizedSalesWithFx } = nextValuation;
      const annualGrowthRate = nextValuation.growthRate;
      setValuation(nextValuation);

      hasDataRef.current = true;
      setHasData(true);
      setPositions(mappedPositions);
      setUsdToIls(rate);
      setHistoricalIlsRealizedPnL(realizedTotals.profitIls);
      setHistoricalIlsNetPnL(enrichedSummary.totalNetPnLIls);
      setRealizedSales(realizedSalesWithFx);
      setLastUpdate(new Date(payload.asOf ?? Date.now()));
      setLoading(false);

      const loadMarket = async () => {
        if (scope !== 'overview') return;
        if (localPayload) {
          const basis = demoMarketBasis(mappedPositions, localPayload.quotes, valuationTime, rate);
          setMarketBasis({ ...basis, asOf: valuationTime });
          setMarketOverview(buildMarketOverview(mappedPositions, basis.marks, valuationTime, { annualGrowthRate, usdToIls: rate, fxHistoryPoints: basis.fxHistoryPoints }));
        } else if (payload.deferredHistory && mappedPositions.length) {
          const accounting = { annualGrowthRate, usdToIls: rate, fxHistoryPoints };
          // While marks arrive, keep the closing value pending and retain the correct session layout.
          setMarketOverview(previous => previous ?? buildMarketOverview(mappedPositions, {}, valuationTime, accounting));
          const result = await fetchDashboard('market', controller.signal);
          if (isCurrent() && result.marks && result.asOf) {
            setMarketBasis({ marks: result.marks, asOf: result.asOf, fxHistoryPoints });
            setMarketOverview(buildMarketOverview(mappedPositions, result.marks, result.asOf, accounting));
          }
        } else {
          setMarketBasis(null);
          setMarketOverview(payload.marketOverview ?? null);
        }
      };
      const loadHistory = async () => {
        const history = payload.deferredHistory && mappedPositions.length
          ? await fetchDashboard('history', controller.signal)
          : payload;
        if (!isCurrent()) return;
        const { sparklineData: nextSparklineData, portfolioTimeline: nextPortfolioTimeline } =
          await loadSparklines(activationPositions, getFxRateAt, {
            candlesByKey: history.candlesByKey ?? {},
            spyPoints: history.spyPoints ?? [],
            valuationTime,
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

        const startOfTodayMs = toUtcDayStart(valuationTime);
        const endOfTodayMs = startOfTodayMs + 24 * 60 * 60 * 1000 - 1;

        const timelineWithoutToday = adjustedTimeline.filter(
          (point) => point.timestamp < startOfTodayMs || point.timestamp > endOfTodayMs
        );

        const todayPoint = buildPortfolioTimelinePointFromSummary(
          enrichedSummary,
          valuationTime,
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

        if (!isCurrent()) return;
        setSparklineData(nextSparklineData);
        setContextSparklineData(history.contextCandlesByKey ?? {});
        setPortfolioTimeline(continuousTimeline);
        setHistoricalIlsNetPnL(continuousTimeline.at(-1)?.netPnLIls ?? enrichedSummary.totalNetPnLIls);
      };
      await Promise.all([
        loadMarket().catch(() => { /* Known observations retain their original session date and source time. */ }),
        loadHistory().catch(() => { /* Keep the previous chart on a temporary history outage. */ }),
      ]);
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
    [loadSparklines, settings.annualGrowthRate, settingsReady, scope]
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
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void loadData({ background: true });
    };
    const intervalId = window.setInterval(refreshVisible, intervalMs);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);

    return () => {
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('focus', refreshVisible);
      window.clearInterval(intervalId);
    };
  }, [loadData, settings.refreshInterval, settingsReady]);

  useEffect(() => {
    if (!settingsReady || scope !== 'overview' || isReviewActive()) return;
    let timer: number | undefined;
    let next = getMarketClock().nextTransition;
    const reschedule = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (next === null) return;
      if (Date.now() >= next) {
        requestRef.current?.controller.abort();
        requestRef.current = null;
        generationRef.current += 1;
        setRefreshingCount(0);
        const clock = getMarketClock();
        setMarketBasis(null);
        setMarketOverview(previous => {
          if (!previous) return null;
          const closeDate = clock.closing?.date ?? previous.closeDate;
          const sameClose = closeDate === previous.closeDate;
          return { ...previous, phase: clock.phase === 'overnight' ? 'closed' : clock.phase,
            nextTransition: clock.nextTransition, closeDate, regularCloseAt: clock.closing?.close ?? null,
            closingSummary: sameClose ? previous.closingSummary : null,
            closeConfirmed: sameClose && previous.closeConfirmed, extended: [], extendedCovered: 0,
            daily: { ...previous.daily, provisional: true, previousSession: clock.phase === 'regular' && previous.sessionDate !== clock.date } };
        });
        next = clock.nextTransition;
        void loadData({ background: true });
      }
      if (next !== null) timer = window.setTimeout(reschedule, Math.max(25, next - Date.now()));
    };
    reschedule();
    document.addEventListener('visibilitychange', reschedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', reschedule);
    };
  }, [loadData, scope, settingsReady]);

  const reload = useCallback(() => loadData({ background: true, forceQuoteRefresh: true }), [loadData]);

  const symbols = useMemo(() => scope === 'idle' ? [] : positions.filter(p => p.quantity > 0).map(p => p.symbol), [positions, scope]);
  const { ticks, status: streamStatus } = useLiveQuotes(symbols, 'holding');
  const latestTick = useMemo(() => Object.values(ticks).reduce((max, tick) => Math.max(max, tick.timestamp), 0), [ticks]);
  const basisTime = Math.max(valuation?.basis.valuationTime ?? 0, marketBasis?.asOf ?? 0);
  const asOf = useMemo(() => Math.max(portfolioNow(), basisTime, latestTick), [basisTime, latestTick]);
  const priced = useMemo(() => valuation && latestTick ? repricePortfolio(valuation, ticks, asOf) : valuation,
    [valuation, latestTick, ticks, asOf]);
  const liveMarks = useMemo(() => marketBasis && latestTick ? applySessionTicks(marketBasis.marks, ticks, asOf) : marketBasis?.marks,
    [marketBasis, latestTick, ticks, asOf]);
  const observedMarket = useMemo(() => {
    if (!marketBasis || !valuation || !liveMarks || liveMarks === marketBasis.marks) return marketOverview;
    const observed = buildMarketOverview(positions, liveMarks, asOf, { annualGrowthRate: valuation.growthRate, usdToIls, fxHistoryPoints: marketBasis.fxHistoryPoints });
    if (observed.phase === 'regular' && Object.values(ticks).some(tick => tick.stale)) {
      return { ...observed, daily: { ...observed.daily, delayed: true } };
    }
    return observed;
  }, [marketBasis, valuation, liveMarks, marketOverview, positions, asOf, ticks, usdToIls]);
  const previewTarget = useCallback((annualGrowthRate: number) => {
    if (!valuation) return null;
    if (observedMarket && ((observedMarket.phase !== 'regular' && observedMarket.phase !== 'unknown') || observedMarket.daily.previousSession)) {
      if (!marketBasis || !liveMarks) return null;
      return buildMarketOverview(positions, liveMarks, asOf, { annualGrowthRate, usdToIls,
        fxHistoryPoints: marketBasis.fxHistoryPoints }).closingSummary;
    }
    return valuePortfolio(valuation.basis, annualGrowthRate).summary;
  }, [valuation, observedMarket, positions, liveMarks, asOf, marketBasis, usdToIls]);
  const liveTimeline = useMemo(() => {
    if (!priced || priced === valuation || !portfolioTimeline.length) return portfolioTimeline;
    const last = portfolioTimeline[portfolioTimeline.length - 1];
    if (last.timestamp !== priced.basis.valuationTime) return portfolioTimeline;
    return [...portfolioTimeline.slice(0, -1), buildPortfolioTimelinePointFromSummary(priced.summary, last.timestamp, last)];
  }, [priced, valuation, portfolioTimeline]);
  return {
    marketOverview: observedMarket,
    streamStatus, previewTarget,
    loading,
    error,
    hasData,
    refreshing: refreshingCount > 0,
    positions,
    metrics: priced?.metrics ?? [],
    summary: priced?.summary ?? null,
    openSummary: priced?.openSummary ?? null,
    sparklineData,
    contextSparklineData,
    portfolioTimeline: liveTimeline,
    usdToIls,
    historicalIlsNetPnL: priced && priced !== valuation ? priced.summary.totalNetPnLIls : historicalIlsNetPnL,
    historicalIlsRealizedPnL,
    realizedSales,
    lastUpdate,
    reload,
  };
}

const PortfolioDataContext = createContext<ReturnType<typeof usePortfolioDataState> | null>(null);

export function PortfolioDataProvider({ children, scope = 'overview' }: { children: ReactNode; scope?: PortfolioScope }) {
  const value = usePortfolioDataState(scope);
  return createElement(PortfolioDataContext.Provider, { value }, children);
}

export function usePortfolioData() {
  const value = useContext(PortfolioDataContext);
  if (!value) throw new Error('usePortfolioData must be used within AppProvider');
  return value;
}
