'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import { computeRealizedSales, mapPositionRow } from '@/lib/positions';
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
} from '@/types';

interface SparklineResult {
  symbol: string;
  points: HistoricalPoint[];
  timeline: PortfolioTimelinePoint[];
}

interface LoadSparklinesResult {
  sparklineData: Record<string, HistoricalPoint[]>;
  portfolioTimeline: PortfolioTimelinePoint[];
}

interface LoadOptions {
  background?: boolean;
}

type NormalizedLot = {
  type: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  timestamp: number;
};

function buildPositionTimeline(
  position: Position,
  points: HistoricalPoint[],
  annualGrowthRate: number
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
      }));
    }

    const entryTimestamp = new Date(position.entryDate).getTime();
    const baselineTimestamp = Number.isFinite(entryTimestamp) ? entryTimestamp : points[0]?.timestamp ?? 0;

    return points.map((point) => {
      const openPnL = (point.close - position.entryPrice) * position.quantity;
      const yearsHeld = Math.max(0, (point.timestamp - baselineTimestamp) / msPerYear);
      const expectedFactor = Math.pow(1 + annualGrowthRate, yearsHeld);
      const expectedPnL = position.entryPrice * position.quantity * (expectedFactor - 1);
      return {
        timestamp: point.timestamp,
        totalPnLUsd: openPnL,
        totalPnLIls: 0,
        netPnLUsd: openPnL,
        netPnLIls: 0,
        expectedNetPnLUsd: expectedPnL,
        expectedNetPnLIls: 0,
      };
    });
  }

  const openLots: Array<{ quantity: number; price: number; timestamp: number }> = [];
  const timeline: PortfolioTimelinePoint[] = [];
  let realizedPnL = 0;
  let expectedRealizedPnL = 0;
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
        openLots.push({ quantity, price: lot.price, timestamp: lot.timestamp });
        continue;
      }

      let remaining = quantity;
      while (remaining > 0 && openLots.length) {
        const current = openLots[0];
        const matched = Math.min(remaining, current.quantity);
        realizedPnL += matched * (lot.price - current.price);
        const holdingYears = Math.max(0, (lot.timestamp - current.timestamp) / msPerYear);
        const expectedFactor = Math.pow(1 + annualGrowthRate, holdingYears);
        expectedRealizedPnL += matched * current.price * (expectedFactor - 1);
        current.quantity -= matched;
        remaining -= matched;

        if (current.quantity <= 1e-8) {
          openLots.shift();
        }
      }
    }

    const openQuantity = openLots.reduce((sum, lot) => sum + lot.quantity, 0);
    const costBasis = openLots.reduce((sum, lot) => sum + lot.quantity * lot.price, 0);
    const openPnL = openQuantity > 0 ? point.close * openQuantity - costBasis : 0;
    const netPnL = openPnL + realizedPnL;
    const expectedOpenPnL = openLots.reduce((sum, lot) => {
      const holdingYears = Math.max(0, (timestamp - lot.timestamp) / msPerYear);
      const expectedFactor = Math.pow(1 + annualGrowthRate, holdingYears);
      return sum + lot.quantity * lot.price * (expectedFactor - 1);
    }, 0);
    const expectedNetPnL = expectedOpenPnL + expectedRealizedPnL;

    timeline.push({
      timestamp,
      totalPnLUsd: openPnL,
      totalPnLIls: 0,
      netPnLUsd: netPnL,
      netPnLIls: 0,
      expectedNetPnLUsd: expectedNetPnL,
      expectedNetPnLIls: 0,
    });
  }

  return timeline;
}

export function usePortfolioData() {
  const { settings, refreshTrigger } = useApp();

  const [loading, setLoading] = useState(true);
  const [refreshingCount, setRefreshingCount] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<PositionMetrics[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [openSummary, setOpenSummary] = useState<PortfolioSummary | null>(null);
  const [sparklineData, setSparklineData] = useState<Record<string, HistoricalPoint[]>>({});
  const [portfolioTimeline, setPortfolioTimeline] = useState<PortfolioTimelinePoint[]>([]);
  const [usdToIls, setUsdToIls] = useState(3.7);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const loadSparklines = useCallback(
    async (positionsList: Position[]): Promise<LoadSparklinesResult> => {
      if (positionsList.length === 0) {
        return { sparklineData: {}, portfolioTimeline: [] };
      }

      const results = await Promise.all<SparklineResult>(
        positionsList.map(async (position) => {
          try {
            const now = Math.floor(Date.now() / 1000);
            const entryDate = position.entryDate ? new Date(position.entryDate) : null;
            const entryTimestamp = entryDate instanceof Date && !Number.isNaN(entryDate.getTime())
              ? Math.floor(entryDate.getTime() / 1000)
              : now - 60 * 60 * 24 * 30;
            const from = Math.min(entryTimestamp, now);

            const response = await fetch(
              `/api/candles?symbol=${encodeURIComponent(position.symbol)}&resolution=D&from=${from}&to=${now}${
                settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''
              }`
            );

            if (!response.ok) {
              console.warn(`Failed to fetch candles for ${position.symbol}: HTTP ${response.status}`);
              return {
                symbol: position.symbol,
                points: [],
                timeline: [],
              };
            }

            const candleData = (await response.json()) as CandleData & { error?: string };

            if (candleData?.error) {
              console.warn(`Candles API error for ${position.symbol}:`, candleData.error);
              return {
                symbol: position.symbol,
                points: [],
                timeline: [],
              };
            }

            const points = mapCandleDataToPoints(candleData);
            const timeline = buildPositionTimeline(position, points, settings.annualGrowthRate);

            return {
              symbol: position.symbol,
              points,
              timeline,
            };
          } catch (error) {
            console.error(`Failed to load sparkline for ${position.symbol}:`, error);
            return {
              symbol: position.symbol,
              points: [],
              timeline: [],
            };
          }
        })
      );

      const sparklineEntries = results.map((result) => [result.symbol, result.points] as const);
      const aggregatedTimeline = new Map<
        number,
        { totalPnLUsd: number; netPnLUsd: number; expectedNetPnLUsd: number }
      >();
      results.forEach((result) => {
        result.timeline.forEach((point) => {
          const current =
            aggregatedTimeline.get(point.timestamp) ?? { totalPnLUsd: 0, netPnLUsd: 0, expectedNetPnLUsd: 0 };
          current.totalPnLUsd += point.totalPnLUsd;
          current.netPnLUsd += point.netPnLUsd;
          current.expectedNetPnLUsd += point.expectedNetPnLUsd;
          aggregatedTimeline.set(point.timestamp, current);
        });
      });

      const sortedTimeline = Array.from(aggregatedTimeline.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([timestamp, values]) => ({
          timestamp,
          totalPnLUsd: values.totalPnLUsd,
          totalPnLIls: 0,
          netPnLUsd: values.netPnLUsd,
          netPnLIls: 0,
          expectedNetPnLUsd: values.expectedNetPnLUsd,
          expectedNetPnLIls: 0,
        }));
      const sparklineData = Object.fromEntries(sparklineEntries);

      return {
        sparklineData,
        portfolioTimeline: sortedTimeline,
      };
    },
    [settings.finnhubToken]
  );

  const loadData = useCallback(
    async ({ background = false }: LoadOptions = {}) => {
      try {
        if (background) {
          setRefreshingCount((count) => count + 1);
        } else {
          setLoading(true);
        }

        const { data: positionsData, error: positionsError } = await supabase
          .from('positions')
          .select('*, position_lots(*)')
          .order('symbol');

        if (positionsError) throw positionsError;

        const mappedPositions: Position[] = (positionsData || []).map(mapPositionRow);
        const rateResponse = await fetch('/api/exchange-rate');
        const rateData = await rateResponse.json();
        const rate = rateData.usdToIls || 3.7;

        const trimmedToken = settings.finnhubToken?.trim();

        const metricsPromises = mappedPositions.map(async (position) => {
          try {
            let quoteData: { c?: number; d?: number; error?: string } | null = null;

            if (trimmedToken) {
              const quoteResponse = await fetch(
                `/api/quote?symbol=${encodeURIComponent(position.symbol)}&token=${encodeURIComponent(trimmedToken)}`
              );

              if (quoteResponse.ok) {
                const parsed = (await quoteResponse.json()) as { c?: number; d?: number; error?: string };
                if (!parsed.error) {
                  quoteData = parsed;
                } else {
                  console.warn(`Quote API error for ${position.symbol}:`, parsed.error);
                }
              } else {
                console.warn(`Quote request failed with status ${quoteResponse.status} for ${position.symbol}`);
              }
            }

            const currentPrice = quoteData?.c ?? position.entryPrice;
            const dailyChange = quoteData?.d;

            return calculatePositionMetrics(
              position,
              currentPrice,
              rate,
              settings.annualGrowthRate,
              dailyChange
            );
          } catch (error) {
            console.error(`Failed to fetch quote for ${position.symbol}:`, error);
            return calculatePositionMetrics(
              position,
              position.entryPrice,
              rate,
              settings.annualGrowthRate
            );
          }
        });

        const calculatedMetrics = await Promise.all(metricsPromises);
        const portfolioSummary = calculatePortfolioSummary(calculatedMetrics, rate);
        const openMetrics = calculatedMetrics.filter((metric) => metric.position.quantity > 0);
        const openSummaryBase = calculatePortfolioSummary(openMetrics, rate);
        const realizedSales = mappedPositions.flatMap((position) => computeRealizedSales(position));
        const annualGrowthRate = Number.isFinite(settings.annualGrowthRate)
          ? settings.annualGrowthRate
          : 0;

        const realizedTotals = realizedSales.reduce(
          (acc, sale) => {
            const holdingYears = Math.max((sale.holdingPeriodDays ?? 0) / 365.25, 0);
            const expectedFactor = Math.pow(1 + annualGrowthRate, holdingYears);
            const expectedProfitUsd = sale.costBasisUsd * (expectedFactor - 1);

            acc.proceedsUsd += sale.proceedsUsd;
            acc.costUsd += sale.costBasisUsd;
            acc.profitUsd += sale.profitUsd;
            acc.expectedProfitUsd += expectedProfitUsd;
            acc.proceedsIls += sale.proceedsUsd * rate;
            acc.costIls += sale.costBasisUsd * rate;
            acc.profitIls += sale.profitUsd * rate;
            acc.expectedProfitIls += expectedProfitUsd * rate;
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

        const chronologicalSales = realizedSales
          .slice()
          .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());

        const taxSummary = calculateRealizedTaxLiability(
          chronologicalSales.map((sale) => ({
            profitUsd: sale.profitUsd,
            profitIls: sale.profitUsd * rate,
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
          await loadSparklines(mappedPositions);

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

          const totalPnLIls = point.totalPnLUsd * rate;
          const netPnLUsdBeforeTax = point.netPnLUsd;
          const netPnLIlsBeforeTax = netPnLUsdBeforeTax * rate;
          const expectedNetPnLUsdBeforeTax = point.expectedNetPnLUsd;
          const expectedNetPnLIlsBeforeTax = expectedNetPnLUsdBeforeTax * rate;

          return {
            ...point,
            totalPnLIls,
            netPnLUsd: netPnLUsdBeforeTax - currentTaxUsd,
            netPnLIls: netPnLIlsBeforeTax - currentTaxIls,
            expectedNetPnLUsd: expectedNetPnLUsdBeforeTax,
            expectedNetPnLIls: expectedNetPnLIlsBeforeTax,
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
          timestamp: startOfTodayMs,
          totalPnLUsd: enrichedSummary.totalCurrentPnLUsd,
          totalPnLIls: enrichedSummary.totalCurrentPnLIls,
          netPnLUsd: enrichedSummary.totalNetPnLUsd,
          netPnLIls: enrichedSummary.totalNetPnLIls,
          expectedNetPnLUsd: enrichedSummary.totalProjectedPnLUsd,
          expectedNetPnLIls: enrichedSummary.totalProjectedPnLIls,
        };

        const finalTimeline = [...timelineWithoutToday, todayPoint].sort(
          (a, b) => a.timestamp - b.timestamp
        );

        setPositions(mappedPositions);
        setUsdToIls(rate);
        setMetrics(calculatedMetrics);
        setSummary(enrichedSummary);
        setOpenSummary(normalizedOpenSummary);
        setSparklineData(nextSparklineData);
        setPortfolioTimeline(finalTimeline);
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
    [loadSparklines, settings.annualGrowthRate, settings.finnhubToken]
  );

  useEffect(() => {
    void loadData();
  }, [loadData, refreshTrigger]);

  useEffect(() => {
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
  }, [loadData, settings.refreshInterval]);

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
    lastUpdate,
    reload: () => loadData({ background: true }),
  };
}
