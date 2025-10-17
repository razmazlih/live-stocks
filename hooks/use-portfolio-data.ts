'use client';

import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useApp } from '@/lib/context';
import { computeRealizedSales, mapPositionRow } from '@/lib/positions';
import {
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateRealizedTax,
  mapCandleDataToPoints,
  RealizedTaxEvent,
} from '@/lib/calculations';
import {
  CandleData,
  HistoricalPoint,
  Position,
  PositionMetrics,
  PortfolioSummary,
  PortfolioTimelinePoint,
  RealizedSale,
} from '@/types';

interface PositionTimelinePoint {
  timestamp: number;
  openValueUsd: number;
  openCostUsd: number;
}

interface SparklineResult {
  symbol: string;
  points: HistoricalPoint[];
  timeline: PositionTimelinePoint[];
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
    async (
      positionsList: Position[],
      realizedSales: RealizedSale[],
      usdToIlsRate: number,
      taxEvents: RealizedTaxEvent[]
    ): Promise<LoadSparklinesResult> => {
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
            const timeline = points.map<PositionTimelinePoint>((point) => ({
              timestamp: point.timestamp,
              openValueUsd: point.close * position.quantity,
              openCostUsd: position.entryPrice * position.quantity,
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
      const aggregatedOpenTimeline = new Map<
        number,
        { openValueUsd: number; openCostUsd: number; openPnLUsd: number }
      >();

      results.forEach((result) => {
        result.timeline.forEach((point) => {
          const current =
            aggregatedOpenTimeline.get(point.timestamp) ??
            { openValueUsd: 0, openCostUsd: 0, openPnLUsd: 0 };

          current.openValueUsd += point.openValueUsd;
          current.openCostUsd += point.openCostUsd;
          current.openPnLUsd += point.openValueUsd - point.openCostUsd;

          aggregatedOpenTimeline.set(point.timestamp, current);
        });
      });

      const realizedEvents = new Map<
        number,
        {
          proceedsUsd: number;
          proceedsIls: number;
          profitUsd: number;
          profitIls: number;
          taxesUsd: number;
          taxesIls: number;
        }
      >();

      realizedSales
        .map((sale) => ({
          ...sale,
          timestamp: new Date(sale.sellDate).getTime(),
        }))
        .filter((sale) => Number.isFinite(sale.timestamp))
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
        .forEach((sale) => {
          const timestamp = sale.timestamp ?? 0;
          const current =
            realizedEvents.get(timestamp) ??
            {
              proceedsUsd: 0,
              proceedsIls: 0,
              profitUsd: 0,
              profitIls: 0,
              taxesUsd: 0,
              taxesIls: 0,
            };

          current.proceedsUsd += sale.proceedsUsd;
          current.proceedsIls += sale.proceedsUsd * usdToIlsRate;
          current.profitUsd += sale.profitUsd;
          current.profitIls += sale.profitUsd * usdToIlsRate;

          realizedEvents.set(timestamp, current);
        });

      taxEvents.forEach((event) => {
        const current =
          realizedEvents.get(event.timestamp) ??
          {
            proceedsUsd: 0,
            proceedsIls: 0,
            profitUsd: 0,
            profitIls: 0,
            taxesUsd: 0,
            taxesIls: 0,
          };

        current.taxesUsd += event.taxUsdDelta;
        current.taxesIls += event.taxIlsDelta;

        realizedEvents.set(event.timestamp, current);
      });

      const allTimestamps = new Set<number>();
      aggregatedOpenTimeline.forEach((_, timestamp) => {
        allTimestamps.add(timestamp);
      });
      realizedEvents.forEach((_, timestamp) => {
        allTimestamps.add(timestamp);
      });

      const sortedTimeline = Array.from(allTimestamps).sort((a, b) => a - b);

      let lastOpenValueUsd = 0;
      let lastOpenPnLUsd = 0;
      let cumulativeProceedsUsd = 0;
      let cumulativeProceedsIls = 0;
      let cumulativeProfitUsd = 0;
      let cumulativeProfitIls = 0;
      let cumulativeTaxesUsd = 0;
      let cumulativeTaxesIls = 0;

      const portfolioTimeline: PortfolioTimelinePoint[] = sortedTimeline.map((timestamp) => {
        const openPoint = aggregatedOpenTimeline.get(timestamp);

        if (openPoint) {
          lastOpenValueUsd = openPoint.openValueUsd;
          lastOpenPnLUsd = openPoint.openPnLUsd;
        }

        const realizedPoint = realizedEvents.get(timestamp);

        if (realizedPoint) {
          cumulativeProceedsUsd += realizedPoint.proceedsUsd;
          cumulativeProceedsIls += realizedPoint.proceedsIls;
          cumulativeProfitUsd += realizedPoint.profitUsd;
          cumulativeProfitIls += realizedPoint.profitIls;
          cumulativeTaxesUsd += realizedPoint.taxesUsd;
          cumulativeTaxesIls += realizedPoint.taxesIls;
        }

        const openValueIls = lastOpenValueUsd * usdToIlsRate;
        const totalValueUsd = lastOpenValueUsd + cumulativeProceedsUsd - cumulativeTaxesUsd;
        const totalValueIls = openValueIls + cumulativeProceedsIls - cumulativeTaxesIls;
        const totalPnLUsd = lastOpenPnLUsd + cumulativeProfitUsd - cumulativeTaxesUsd;

        return {
          timestamp,
          totalPnLUsd,
          openValueUsd: lastOpenValueUsd,
          openValueIls,
          realizedProceedsUsd: cumulativeProceedsUsd,
          realizedProceedsIls: cumulativeProceedsIls,
          realizedProfitUsd: cumulativeProfitUsd,
          realizedProfitIls: cumulativeProfitIls,
          taxesPaidUsd: cumulativeTaxesUsd,
          taxesPaidIls: cumulativeTaxesIls,
          totalValueUsd,
          totalValueIls,
        };
      });

      const sparklineData = Object.fromEntries(sparklineEntries);

      return {
        sparklineData,
        portfolioTimeline,
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
        const realizedSales = mappedPositions.flatMap((position) => computeRealizedSales(position));

        const realizedTotals = realizedSales.reduce(
          (acc, sale) => {
            acc.proceedsUsd += sale.proceedsUsd;
            acc.proceedsIls += sale.proceedsUsd * rate;
            acc.profitUsd += sale.profitUsd;
            acc.profitIls += sale.profitUsd * rate;
            return acc;
          },
          { proceedsUsd: 0, proceedsIls: 0, profitUsd: 0, profitIls: 0 }
        );

        const taxResult = calculateRealizedTax(realizedSales, rate);

        const portfolioSummary = calculatePortfolioSummary(calculatedMetrics, rate, {
          proceedsUsd: realizedTotals.proceedsUsd,
          proceedsIls: realizedTotals.proceedsIls,
          profitUsd: realizedTotals.profitUsd,
          profitIls: realizedTotals.profitIls,
          taxesPaidUsd: taxResult.totalTaxUsd,
          taxesPaidIls: taxResult.totalTaxIls,
        });

        const { sparklineData: nextSparklineData, portfolioTimeline: nextPortfolioTimeline } =
          await loadSparklines(mappedPositions, realizedSales, rate, taxResult.events);

        setPositions(mappedPositions);
        setUsdToIls(rate);
        setMetrics(calculatedMetrics);
        setSummary(portfolioSummary);
        setSparklineData(nextSparklineData);
        setPortfolioTimeline(nextPortfolioTimeline);
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
