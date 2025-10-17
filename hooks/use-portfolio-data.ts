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

export function usePortfolioData() {
  const { settings, refreshTrigger } = useApp();

  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState<Position[]>([]);
  const [metrics, setMetrics] = useState<PositionMetrics[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
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
            const timeline = points.map<PortfolioTimelinePoint>((point) => ({
              timestamp: point.timestamp,
              totalPnLUsd: (point.close - position.entryPrice) * position.quantity,
              totalPnLIls: 0,
              netPnLUsd: 0,
              netPnLIls: 0,
            }));

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
      const aggregatedTimeline = new Map<number, number>();
      results.forEach((result) => {
        result.timeline.forEach((point) => {
          aggregatedTimeline.set(
            point.timestamp,
            (aggregatedTimeline.get(point.timestamp) ?? 0) + point.totalPnLUsd
          );
        });
      });

      const sortedTimeline = Array.from(aggregatedTimeline.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([timestamp, totalPnLUsd]) => ({
          timestamp,
          totalPnLUsd,
          totalPnLIls: 0,
          netPnLUsd: totalPnLUsd,
          netPnLIls: 0,
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
        if (!background) {
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

        const metricsPromises = mappedPositions.map(async (position) => {
          try {
            const quoteResponse = await fetch(
              `/api/quote?symbol=${position.symbol}${
              settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''
            }`
          );
          const quoteData = await quoteResponse.json();

          const currentPrice = quoteData.c || position.entryPrice;
          const dailyChange = quoteData.d;

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
        const realizedSales = mappedPositions.flatMap((position) => computeRealizedSales(position));
        const realizedTotals = realizedSales.reduce(
          (acc, sale) => {
            acc.proceedsUsd += sale.proceedsUsd;
            acc.costUsd += sale.costBasisUsd;
            acc.profitUsd += sale.profitUsd;
            acc.proceedsIls += sale.proceedsUsd * rate;
            acc.costIls += sale.costBasisUsd * rate;
            acc.profitIls += sale.profitUsd * rate;
            return acc;
          },
          {
            proceedsUsd: 0,
            costUsd: 0,
            profitUsd: 0,
            proceedsIls: 0,
            costIls: 0,
            profitIls: 0,
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

        const enrichedSummary: PortfolioSummary = {
          ...portfolioSummary,
          totalRealizedProfitUsd: realizedTotals.profitUsd,
          totalRealizedProfitIls: realizedTotals.profitIls,
          totalTaxesPaidUsd: taxSummary.taxUsd,
          totalTaxesPaidIls: taxSummary.taxIls,
          totalNetPnLUsd: portfolioSummary.totalCurrentPnLUsd + realizedTotals.profitUsd - taxSummary.taxUsd,
          totalNetPnLIls: portfolioSummary.totalCurrentPnLIls + realizedTotals.profitIls - taxSummary.taxIls,
        };

        const { sparklineData: nextSparklineData, portfolioTimeline: nextPortfolioTimeline } =
          await loadSparklines(mappedPositions);

        const realizedTimeline = (() => {
          let cumulativeRealizedUsd = 0;
          let cumulativeRealizedIls = 0;

          return chronologicalSales
            .map((sale) => {
              const timestamp = new Date(sale.sellDate).getTime();
              if (Number.isNaN(timestamp)) {
                return null;
              }

              cumulativeRealizedUsd += sale.profitUsd;
              cumulativeRealizedIls += sale.profitUsd * rate;

              return {
                timestamp,
                realizedUsd: cumulativeRealizedUsd,
                realizedIls: cumulativeRealizedIls,
              };
            })
            .filter((point): point is { timestamp: number; realizedUsd: number; realizedIls: number } => point !== null);
        })();

        const taxTimeline = taxSummary.timeline.filter(
          (point): point is { timestamp: number; taxUsd: number; taxIls: number; cumulativeProfitUsd: number } =>
            typeof point.timestamp === 'number'
        );

        const openTimeline = nextPortfolioTimeline.map((point) => ({
          ...point,
          totalPnLIls: point.totalPnLIls || point.totalPnLUsd * rate,
        }));

        const combinedTimestamps = Array.from(
          new Set([
            ...openTimeline.map((point) => point.timestamp),
            ...realizedTimeline.map((point) => point.timestamp),
            ...taxTimeline.map((point) => point.timestamp),
          ])
        ).sort((a, b) => a - b);

        let openIndex = 0;
        let realizedIndex = 0;
        let taxIndex = 0;
        let currentOpenUsd = 0;
        let currentOpenIls = 0;
        let currentRealizedUsd = 0;
        let currentRealizedIls = 0;
        let currentTaxUsd = 0;
        let currentTaxIls = 0;

        const adjustedTimeline = combinedTimestamps.map((timestamp) => {
          while (openIndex < openTimeline.length && openTimeline[openIndex].timestamp <= timestamp) {
            currentOpenUsd = openTimeline[openIndex].totalPnLUsd;
            currentOpenIls = openTimeline[openIndex].totalPnLIls;
            openIndex += 1;
          }

          while (realizedIndex < realizedTimeline.length && realizedTimeline[realizedIndex].timestamp <= timestamp) {
            currentRealizedUsd = realizedTimeline[realizedIndex].realizedUsd;
            currentRealizedIls = realizedTimeline[realizedIndex].realizedIls;
            realizedIndex += 1;
          }

          while (taxIndex < taxTimeline.length && taxTimeline[taxIndex].timestamp <= timestamp) {
            currentTaxUsd = taxTimeline[taxIndex].taxUsd;
            currentTaxIls = taxTimeline[taxIndex].taxIls;
            taxIndex += 1;
          }

          return {
            timestamp,
            totalPnLUsd: currentOpenUsd,
            totalPnLIls: currentOpenIls,
            netPnLUsd: currentOpenUsd + currentRealizedUsd - currentTaxUsd,
            netPnLIls: currentOpenIls + currentRealizedIls - currentTaxIls,
          };
        });

        setPositions(mappedPositions);
        setUsdToIls(rate);
        setMetrics(calculatedMetrics);
        setSummary(enrichedSummary);
        setSparklineData(nextSparklineData);
        setPortfolioTimeline(adjustedTimeline);
        setLastUpdate(new Date());
      } catch (error) {
        console.error('Error loading portfolio data:', error);
      } finally {
        if (!background) {
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
    positions,
    metrics,
    summary,
    sparklineData,
    portfolioTimeline,
    usdToIls,
    lastUpdate,
    reload: () => loadData(),
  };
}
