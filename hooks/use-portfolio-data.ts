'use client';

import { useCallback, useEffect, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import {
  computeRealizedSalesWithFx,
  expandPositionActivations,
  mapPositionPlanRow,
  mapPositionRow,
} from '@/lib/positions';
import {
  calculatePortfolioSummary,
  calculatePositionMetrics,
  mapCandleDataToPoints,
  calculateRealizedTaxLiability,
} from '@/lib/calculations';
import {
  CandleData,
  HistoricalPoint,
  Position,
  PositionMetrics,
  PortfolioSummary,
  PortfolioTimelinePoint,
  PositionPlan,
  RealizedSale,
} from '@/types';
import { buildUsdIlsRateResolver, fetchUsdIlsHistoricalPoints } from '@/lib/services/historical-fx';

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

type NormalizedLot = {
  type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestamp: number;
};

type FxRateResolver = (timestamp: number) => number;

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

    return points.map((point) => {
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
  const [unassignedPlans, setUnassignedPlans] = useState<PositionPlan[]>([]);
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
    ): Promise<LoadSparklinesResult> => {
      if (positionsList.length === 0) {
        return { sparklineData: {}, portfolioTimeline: [] };
      }

      interface IntermediateSparklineResult extends SparklineResult {
        from?: number;
        to?: number;
        position?: Position;
      }

      const results = await Promise.all<IntermediateSparklineResult>(
        positionsList.map(async (position) => {
            let from = 0;
            let to = 0;

            try {
            const key = position.activationId ?? position.id ?? position.symbol;
            const now = Math.floor(Date.now() / 1000);
            const activationStartMsRaw = position.activationStart
              ? new Date(position.activationStart).getTime()
              : undefined;
            const activationEndMsRaw = position.activationEnd
              ? new Date(position.activationEnd).getTime()
              : undefined;
            const activationStartMs =
              typeof activationStartMsRaw === 'number' && Number.isFinite(activationStartMsRaw)
                ? activationStartMsRaw
                : null;
            const activationEndMs =
              typeof activationEndMsRaw === 'number' && Number.isFinite(activationEndMsRaw)
                ? activationEndMsRaw
                : null;
            const activationStartBoundaryMs =
              activationStartMs !== null
                ? (() => {
                    const startOfDay = new Date(activationStartMs);
                    startOfDay.setHours(0, 0, 0, 0);
                    return startOfDay.getTime();
                  })()
                : null;
            const activationEndBoundaryMs =
              activationEndMs !== null
                ? (() => {
                    const endOfDay = new Date(activationEndMs);
                    endOfDay.setHours(23, 59, 59, 999);
                    return endOfDay.getTime();
                  })()
                : null;
            const entryDate = position.entryDate ? new Date(position.entryDate) : null;
            const entryTimestamp = entryDate instanceof Date && !Number.isNaN(entryDate.getTime())
              ? Math.floor(entryDate.getTime() / 1000)
              : null;
            const lotTimestamps = (position.lots ?? [])
              .map((lot) => Math.floor(new Date(lot.executedAt).getTime() / 1000))
              .filter((timestamp): timestamp is number => Number.isFinite(timestamp));
            const earliestLotTimestamp = lotTimestamps.length > 0 ? Math.min(...lotTimestamps) : null;
            const defaultLookback = now - 60 * 60 * 24 * 30;
            let baselineTimestamp = activationStartBoundaryMs !== null
              ? Math.floor(activationStartBoundaryMs / 1000)
              : earliestLotTimestamp ?? entryTimestamp ?? defaultLookback;
            to = activationEndBoundaryMs !== null ? Math.floor(activationEndBoundaryMs / 1000) : now;

            if (!Number.isFinite(baselineTimestamp)) {
              baselineTimestamp = defaultLookback;
            }

            if (baselineTimestamp > to) {
              baselineTimestamp = to - 60 * 60 * 24 * 5;
            }

            from = Math.min(baselineTimestamp, to);
            if (from === to) {
              from = Math.max(0, to - 60 * 60 * 24 * 5);
            }

            // Fetch SPY data if needed (we'll fetch it once globally actually, but here we need the range)
            // Wait, we need to fetch SPY globally first.
            // Let's refactor this to calculate ranges first, then fetch SPY, then fetch positions.
            
            // For now, let's just fetch position candles here as before.
            const response = await fetch(
              `/api/candles?symbol=${encodeURIComponent(position.symbol)}&resolution=D&from=${from}&to=${to}${
                settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''
              }`
            );

            if (!response.ok) {
              console.warn(`Failed to fetch candles for ${position.symbol}: HTTP ${response.status}`);
              return {
                key,
                symbol: position.symbol,
                points: [],
                timeline: [],
                isHistorical: Boolean(position.isHistoricalActivation),
                from, // Return from/to to help with SPY fetch
                to
              };
            }

            const candleData = (await response.json()) as CandleData & { error?: string };

            if (candleData?.error) {
              console.warn(`Candles API error for ${position.symbol}:`, candleData.error);
              return {
                key,
                symbol: position.symbol,
                points: [],
                timeline: [],
                isHistorical: Boolean(position.isHistoricalActivation),
                from,
                to
              };
            }

            const points = mapCandleDataToPoints(candleData);
            const filteredPoints = points.filter((point) => {
              if (activationStartBoundaryMs !== null && point.timestamp < activationStartBoundaryMs) {
                return false;
              }
              if (activationEndBoundaryMs !== null && point.timestamp > activationEndBoundaryMs) {
                return false;
              }
              return true;
            });
            const effectivePoints = filteredPoints.length > 0 ? filteredPoints : points;
            
            return {
              key,
              symbol: position.symbol,
              points: effectivePoints,
              timeline: [], // We will build timeline later after fetching SPY
              isHistorical: Boolean(position.isHistoricalActivation),
              position, // Pass position through
              from,
              to
            };
          } catch (error) {
            console.error(`Failed to load sparkline for ${position.symbol}:`, error);
            return {
              key: position.activationId ?? position.id ?? position.symbol,
              symbol: position.symbol,
              points: [],
              timeline: [],
              isHistorical: Boolean(position.isHistoricalActivation),
              from,
              to
            };
          }
        })
      );

      // Calculate global range for SPY
      const validFroms = results.map((r) => r.from).filter((f): f is number => typeof f === 'number' && f > 0);
      const validTos = results.map((r) => r.to).filter((t): t is number => typeof t === 'number' && t > 0);
      
      const minFrom = validFroms.length > 0 ? Math.min(...validFroms) : 0;
      const maxTo = validTos.length > 0 ? Math.max(...validTos) : 0;
      
      let spyPoints: HistoricalPoint[] = [];
      if (minFrom < Number.MAX_SAFE_INTEGER && maxTo > 0) {
          try {
             const spyResponse = await fetch(
              `/api/candles?symbol=SPY&resolution=D&from=${minFrom}&to=${maxTo}${
                settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''
              }`
            );
            if (spyResponse.ok) {
                const spyData = await spyResponse.json();
                if (!spyData.error) {
                    spyPoints = mapCandleDataToPoints(spyData);
                }
            }
          } catch (e) {
              console.error("Failed to fetch SPY data", e);
          }
      }

      // Now build timelines
      const finalResults = results.map((result) => {
          if (!result.position) return result;
          const timeline = buildPositionTimeline(
            result.position,
            result.points,
            settings.annualGrowthRate,
            spyPoints,
            getFxRateAt,
          );
          return { ...result, timeline };
      });

      const sparklineEntries = finalResults.map((result) => [result.key, result.points] as const);
      const sparklineData = Object.fromEntries(sparklineEntries);
      const timelineResults = finalResults.filter((result) => result.timeline.length > 0);

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
    [settings.annualGrowthRate, settings.finnhubToken]
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

      const supabase = getSupabaseClient();
      const [positionsResult, unattachedPlansResult] = await Promise.all([
        supabase
          .from('positions')
            .select('*, position_lots(*), position_plans(*)')
            .order('symbol'),
          supabase
            .from('position_plans')
            .select('*')
            .is('position_id', null),
        ]);

        if (positionsResult.error) throw positionsResult.error;
        if (unattachedPlansResult.error) throw unattachedPlansResult.error;

        const mappedPositions: Position[] = (positionsResult.data || []).map(mapPositionRow);
        const mappedUnassignedPlans: PositionPlan[] = (unattachedPlansResult.data || []).map(
          mapPositionPlanRow,
        );
        const rateResponse = await fetch('/api/exchange-rate');
        const rateData = await rateResponse.json();
        const rate = rateData.usdToIls || 3.7;

        const trimmedToken = settings.finnhubToken?.trim();

        const activationPositions = mappedPositions.flatMap((position) => expandPositionActivations(position));
        const allTimestamps = mappedPositions.flatMap((position) =>
          (position.lots ?? [])
            .map((lot) => new Date(lot.executedAt).getTime())
            .filter((timestamp) => Number.isFinite(timestamp)),
        );
        const activationBoundaries = activationPositions
          .flatMap((position) => [
            position.activationStart ? new Date(position.activationStart).getTime() : Number.NaN,
            position.activationEnd ? new Date(position.activationEnd).getTime() : Number.NaN,
            position.entryDate ? new Date(position.entryDate).getTime() : Number.NaN,
          ])
          .filter((timestamp) => Number.isFinite(timestamp));
        const nowSeconds = Math.floor(Date.now() / 1000);
        const minFxTimestamp = [...allTimestamps, ...activationBoundaries].reduce<number | null>(
          (min, value) => (min === null ? value : Math.min(min, value)),
          null,
        );
        const fxFrom = Math.max(
          0,
          Math.floor(((minFxTimestamp ?? Date.now() - 60 * 24 * 60 * 60 * 1000) / 1000) - 2 * 24 * 60 * 60),
        );
        const fxTo = nowSeconds;
        const fxHistoryPoints = await fetchUsdIlsHistoricalPoints(fxFrom, fxTo);
        const getFxRateAt = buildUsdIlsRateResolver(fxHistoryPoints, rate);

        const normalizedSymbols = Array.from(
          new Set(mappedPositions.map((position) => position.symbol.trim().toUpperCase()).filter(Boolean)),
        );

        let batchedQuotes: Record<string, { c?: number; d?: number }> = {};
        if (trimmedToken && normalizedSymbols.length > 0) {
          const quoteParams = new URLSearchParams({
            symbols: normalizedSymbols.join(','),
            token: trimmedToken,
          });
          if (forceQuoteRefresh) {
            quoteParams.set('forceRefresh', '1');
          }

          try {
            const quotesResponse = await fetch(`/api/quotes?${quoteParams.toString()}`);
            if (quotesResponse.ok) {
              const payload = (await quotesResponse.json()) as {
                quotes?: Record<string, { c?: number; d?: number }>;
              };
              batchedQuotes = payload.quotes ?? {};
            } else {
              console.warn(`Quotes request failed with status ${quotesResponse.status}`);
            }
          } catch (error) {
            console.error('Failed to fetch batched quotes:', error);
          }
        }

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

        const calculatedMetrics = activationPositions.map((position) => {
          const quote = quoteMap.get(position.symbol);
          const currentPrice = quote?.currentPrice ?? position.entryPrice;
          const dailyChange = quote?.dailyChange;

          return calculatePositionMetrics(
            position,
            currentPrice,
            rate,
            settings.annualGrowthRate,
            dailyChange
          );
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

        const realizedTotals = realizedSalesWithFx.reduce(
          (acc, sale) => {
            const holdingYears = Math.max((sale.holdingPeriodDays ?? 0) / 365.25, 0);
            const expectedFactor = Math.pow(1 + annualGrowthRate, holdingYears);
            const expectedProfitUsd = sale.costBasisUsd * (expectedFactor - 1);

            acc.proceedsUsd += sale.proceedsUsd;
            acc.costUsd += sale.costBasisUsd;
            acc.profitUsd += sale.profitUsd;
            acc.expectedProfitUsd += expectedProfitUsd;
            acc.proceedsIls += sale.proceedsIls ?? sale.proceedsUsd * rate;
            acc.costIls += sale.costBasisIls ?? sale.costBasisUsd * rate;
            acc.profitIls += sale.profitIls ?? sale.profitUsd * rate;
            acc.expectedProfitIls += expectedProfitUsd * getFxRateAt(new Date(sale.sellDate).getTime());
            return acc;
          },
          {
            proceedsUsd: 0,
            costUsd: 0,
            profitUsd: 0,
            expectedProfitUsd: 0,
            proceedsIls: 0,
            costIls: 0,
            profitIls: 0,
            expectedProfitIls: 0,
          }
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

        const openProjectedPnLUsd = Math.max(openSummaryBase.totalProjectedPnLUsd, 0);
        const openProjectedPnLIls = Math.max(openSummaryBase.totalProjectedPnLIls, 0);
        const normalizedOpenSummary: PortfolioSummary = {
          ...openSummaryBase,
          totalProjectedPnLUsd: openProjectedPnLUsd,
          totalProjectedPnLIls: openProjectedPnLIls,
          totalCombinedUsd: openSummaryBase.totalCurrentPnLUsd - openProjectedPnLUsd,
          totalCombinedIls: openSummaryBase.totalCurrentPnLIls - openProjectedPnLIls,
          totalRealizedProfitUsd: 0,
          totalRealizedProfitIls: 0,
          totalTaxesPaidUsd: 0,
          totalTaxesPaidIls: 0,
          totalNetPnLUsd: openSummaryBase.totalCurrentPnLUsd,
          totalNetPnLIls: openSummaryBase.totalCurrentPnLIls,
        };

        const totalCurrentPnLUsd = portfolioSummary.totalCurrentPnLUsd + realizedTotals.profitUsd;
        const totalCurrentPnLIls = portfolioSummary.totalCurrentPnLIls + realizedTotals.profitIls;
        const totalProjectedPnLUsdRaw =
          portfolioSummary.totalProjectedPnLUsd + realizedTotals.expectedProfitUsd;
        const totalProjectedPnLIlsRaw =
          portfolioSummary.totalProjectedPnLIls + realizedTotals.expectedProfitIls;
        const totalProjectedPnLUsd = Math.max(totalProjectedPnLUsdRaw, 0);
        const totalProjectedPnLIls = Math.max(totalProjectedPnLIlsRaw, 0);
        const totalCombinedUsd = totalCurrentPnLUsd - totalProjectedPnLUsd;
        const totalCombinedIls = totalCurrentPnLIls - totalProjectedPnLIls;

        const enrichedSummary: PortfolioSummary = {
          ...portfolioSummary,
          totalCurrentPnLUsd,
          totalCurrentPnLIls,
          totalProjectedPnLUsd,
          totalProjectedPnLIls,
          totalCombinedUsd,
          totalCombinedIls,
          totalRealizedProfitUsd: realizedTotals.profitUsd,
          totalRealizedProfitIls: realizedTotals.profitIls,
          totalTaxesPaidUsd: taxSummary.taxUsd,
          totalTaxesPaidIls: taxSummary.taxIls,
          totalNetPnLUsd: totalCurrentPnLUsd - taxSummary.taxUsd,
          totalNetPnLIls: totalCurrentPnLIls - taxSummary.taxIls,
        };

        const { sparklineData: nextSparklineData, portfolioTimeline: nextPortfolioTimeline } =
          await loadSparklines(activationPositions, getFxRateAt);

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

        const todayPoint: PortfolioTimelinePoint = {
          timestamp: Date.now(),
          totalPnLUsd: enrichedSummary.totalCurrentPnLUsd,
          totalPnLIls: enrichedSummary.totalCurrentPnLIls,
          netPnLUsd: enrichedSummary.totalNetPnLUsd,
          netPnLIls: enrichedSummary.totalNetPnLIls,
          expectedNetPnLUsd: enrichedSummary.totalProjectedPnLUsd,
          expectedNetPnLIls: enrichedSummary.totalProjectedPnLIls,
          spyNetPnLUsd: timelineWithoutToday[timelineWithoutToday.length - 1]?.spyNetPnLUsd ?? 0,
          spyNetPnLIls: timelineWithoutToday[timelineWithoutToday.length - 1]?.spyNetPnLIls ?? 0,
        };

        const finalTimeline = [...timelineWithoutToday, todayPoint].sort(
          (a, b) => a.timestamp - b.timestamp
        );

        setPositions(mappedPositions);
        setUnassignedPlans(mappedUnassignedPlans);
        setUsdToIls(rate);
        setMetrics(calculatedMetrics);
        setSummary(enrichedSummary);
        setOpenSummary(normalizedOpenSummary);
        setSparklineData(nextSparklineData);
        setPortfolioTimeline(finalTimeline);
        setHistoricalIlsNetPnL(finalTimeline[finalTimeline.length - 1]?.netPnLIls ?? enrichedSummary.totalNetPnLIls);
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
    [loadSparklines, settings.annualGrowthRate, settings.finnhubToken, settingsReady]
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
    unassignedPlans,
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
