'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import {
  calculateAnnualizedVolatility,
  calculateCagr,
  calculateCorrelationMatrix,
  calculateEqualWeightRebalance,
  calculateExpectedShortfall,
  calculateHerfindahlIndex,
  calculateMaxDrawdown,
  calculatePortfolioSummary,
  calculatePositionMetrics,
  calculateReturnDistribution,
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateValueAtRisk,
  calculateBeta,
  formatCurrency,
  formatPercent,
  mapCandleDataToPoints,
} from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import type {
  CandleData,
  HistoricalPoint,
  Position,
  PositionAnalytics,
  PortfolioAnalytics,
  PortfolioSummary,
  RebalanceSuggestion,
  CurrencyExposure,
  WhatIfScenario,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const DAY_SECONDS = 60 * 60 * 24;
const ANALYSIS_WINDOW_DAYS = 400;
const BENCHMARK_SYMBOL = '^GSPC';

type CandleResponse = CandleData & { error?: string };

type ReturnSeries = {
  map: Map<string, number>;
  array: number[];
};

type HistoricalBundle = {
  points: HistoricalPoint[];
  returns: ReturnSeries;
};

function computeReturnSeries(points: HistoricalPoint[]): ReturnSeries {
  const map = new Map<string, number>();
  const array: number[] = [];

  if (!points.length) {
    return { map, array };
  }

  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1]?.close ?? 0;
    const current = points[i]?.close ?? 0;

    if (!Number.isFinite(previous) || previous <= 0 || !Number.isFinite(current) || current <= 0) {
      continue;
    }

    const change = current / previous - 1;
    const dateKey = new Date(points[i].timestamp).toISOString().slice(0, 10);

    map.set(dateKey, change);
    array.push(change);
  }

  return { map, array };
}

export default function AnalysisPage() {
  const { locale, settings, refreshTrigger } = useApp();
  const { t } = useTranslation(locale);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [positionAnalytics, setPositionAnalytics] = useState<PositionAnalytics[]>([]);
  const [portfolioAnalytics, setPortfolioAnalytics] = useState<PortfolioAnalytics | null>(null);
  const [rebalanceSuggestions, setRebalanceSuggestions] = useState<RebalanceSuggestion[]>([]);
  const [currencyExposure, setCurrencyExposure] = useState<CurrencyExposure | null>(null);
  const [rateAdjustment, setRateAdjustment] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [historicalLoading, setHistoricalLoading] = useState(false);

  const fetchHistorical = useCallback(
    async (symbol: string): Promise<HistoricalBundle> => {
      const now = Math.floor(Date.now() / 1000);
      const from = now - ANALYSIS_WINDOW_DAYS * DAY_SECONDS;
      const url = `/api/candles?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${now}${settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        return { points: [], returns: { map: new Map(), array: [] } };
      }

      const data = (await response.json()) as CandleResponse;
      if (data.error) {
        return { points: [], returns: { map: new Map(), array: [] } };
      }

      const points = mapCandleDataToPoints(data);
      const returns = computeReturnSeries(points);
      return { points, returns };
    },
    [settings.finnhubToken]
  );

  const handleRateChange = (value: number[]) => {
    const adjustment = value[0] ?? 0;
    setRateAdjustment(adjustment);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setHistoricalLoading(true);

      try {
        const { data: positionsData, error: positionsError } = await supabase
          .from('positions')
          .select('*')
          .order('symbol');

        if (positionsError) {
          throw positionsError;
        }

        const mappedPositions: Position[] = (positionsData || []).map((p) => ({
          id: p.id,
          symbol: p.symbol,
          display: p.display,
          imageUrl: p.image_url,
          entryPrice: parseFloat(p.entry_price.toString()),
          quantity: parseFloat(p.quantity.toString()),
          entryDate: p.entry_date,
        }));

        if (cancelled) {
          return;
        }

        setPositions(mappedPositions);

        if (!mappedPositions.length) {
          setSummary(null);
          setPositionAnalytics([]);
          setPortfolioAnalytics(null);
          setRebalanceSuggestions([]);
          setCurrencyExposure(null);
          setHistoricalLoading(false);
          setLoading(false);
          return;
        }

        const rateResponse = await fetch('/api/exchange-rate');
        const rateData = await rateResponse.json();
        const usdToIls = rateData.usdToIls || 3.7;

        const metricsPromises = mappedPositions.map(async (position) => {
          try {
            const quoteResponse = await fetch(
              `/api/quote?symbol=${position.symbol}${settings.finnhubToken ? `&token=${settings.finnhubToken}` : ''}`
            );
            const quoteData = await quoteResponse.json();

            const currentPrice = quoteData.c || position.entryPrice;
            const dailyChange = quoteData.d;

            return calculatePositionMetrics(
              position,
              currentPrice,
              usdToIls,
              settings.annualGrowthRate,
              dailyChange
            );
          } catch (error) {
            console.error(`Failed to fetch quote for ${position.symbol}:`, error);
            return calculatePositionMetrics(
              position,
              position.entryPrice,
              usdToIls,
              settings.annualGrowthRate
            );
          }
        });

        const calculatedMetrics = await Promise.all(metricsPromises);
        if (cancelled) {
          return;
        }

        const portfolioSummary = calculatePortfolioSummary(calculatedMetrics, usdToIls);
        setSummary(portfolioSummary);

        const historicalResults = await Promise.all(
          mappedPositions.map(async (position) => {
            try {
              return [position.symbol, await fetchHistorical(position.symbol)] as const;
            } catch (error) {
              console.error(`Failed to fetch historical data for ${position.symbol}:`, error);
              return [position.symbol, { points: [], returns: { map: new Map(), array: [] } }] as const;
            }
          })
        );

        const benchmarkHistorical = await fetchHistorical(BENCHMARK_SYMBOL);

        if (cancelled) {
          return;
        }

        const historicalMap = new Map<string, HistoricalBundle>(historicalResults);

        const advancedAnalytics: PositionAnalytics[] = calculatedMetrics.map((metric) => {
          const bundle = historicalMap.get(metric.position.symbol);
          const points = bundle?.points ?? [];
          const returnsArray = bundle?.returns.array ?? [];

          const cagr = calculateCagr(
            metric.position.entryPrice,
            metric.currentPrice,
            metric.yearsHeld
          );
          const maxDrawdown = calculateMaxDrawdown(points.map((point) => point.close));

          const volatility30 = calculateAnnualizedVolatility(returnsArray.slice(-30));
          const volatility90 = calculateAnnualizedVolatility(returnsArray.slice(-90));
          const distribution = calculateReturnDistribution(returnsArray);
          const varPercent = calculateValueAtRisk(returnsArray, 0.95);
          const esPercent = calculateExpectedShortfall(returnsArray, 0.95);

          return {
            symbol: metric.position.symbol,
            display: metric.position.display,
            cagr,
            maxDrawdown,
            annualizedVolatility30: volatility30,
            annualizedVolatility90: volatility90,
            meanDailyReturn: distribution.mean,
            medianDailyReturn: distribution.median,
            stdDevDailyReturn: distribution.stdDev,
            minDailyReturn: distribution.min,
            maxDailyReturn: distribution.max,
            percentile5: distribution.percentile5,
            percentile95: distribution.percentile95,
            valueAtRisk95: varPercent * metric.currentValue,
            expectedShortfall95: esPercent * metric.currentValue,
            observations: returnsArray.length,
          };
        });

        setPositionAnalytics(advancedAnalytics);

        const weights = calculatedMetrics.map((metric) => metric.currentValue);
        const totalValue = weights.reduce((sum, value) => sum + value, 0);
        const normalizedWeights = totalValue > 0 ? weights.map((value) => value / totalValue) : [];

        const returnSeries = calculatedMetrics.map((metric) => {
          const bundle = historicalMap.get(metric.position.symbol);
          return bundle?.returns ?? { map: new Map(), array: [] };
        });

        let commonDates: string[] | null = null;
        const orderedMaps = returnSeries.map((series) => {
          const dates = Array.from(series.map.keys()).sort();
          if (commonDates === null) {
            commonDates = dates;
          } else {
            const dateSet = new Set(dates);
            commonDates = commonDates.filter((date) => dateSet.has(date));
          }
          return series.map;
        });

        if (!commonDates || !commonDates.length) {
          setPortfolioAnalytics({
            sharpeRatio: undefined,
            sortinoRatio: undefined,
            annualizedVolatility: undefined,
            valueAtRisk95: undefined,
            expectedShortfall95: undefined,
            beta: undefined,
            correlationMatrix: null,
            herfindahlIndex: calculateHerfindahlIndex(normalizedWeights),
          });
        } else {
          const alignedSeries = orderedMaps.map((seriesMap) =>
            commonDates!.map((date) => seriesMap.get(date) ?? 0)
          );

          const correlationMatrix = calculateCorrelationMatrix(alignedSeries);

          const portfolioReturns: number[] = commonDates!.map((_, index) => {
            return alignedSeries.reduce((sum, series, seriesIndex) => {
              const weight = normalizedWeights[seriesIndex] ?? 0;
              return sum + weight * (series[index] ?? 0);
            }, 0);
          });

          const varPercent = calculateValueAtRisk(portfolioReturns, 0.95);
          const esPercent = calculateExpectedShortfall(portfolioReturns, 0.95);

          const portfolioReturnMap = new Map<string, number>();
          commonDates.forEach((date, index) => {
            portfolioReturnMap.set(date, portfolioReturns[index]);
          });

          const benchmarkReturnsMap = benchmarkHistorical.returns.map;
          const betaDates = commonDates.filter((date) => benchmarkReturnsMap.has(date));
          const portfolioForBeta = betaDates.map((date) => portfolioReturnMap.get(date) ?? 0);
          const benchmarkForBeta = betaDates.map((date) => benchmarkReturnsMap.get(date) ?? 0);
          const beta = betaDates.length ? calculateBeta(portfolioForBeta, benchmarkForBeta) : undefined;

          setPortfolioAnalytics({
            sharpeRatio: calculateSharpeRatio(portfolioReturns),
            sortinoRatio: calculateSortinoRatio(portfolioReturns),
            annualizedVolatility: calculateAnnualizedVolatility(portfolioReturns),
            valueAtRisk95: varPercent * totalValue,
            expectedShortfall95: esPercent * totalValue,
            beta,
            correlationMatrix: {
              symbols: calculatedMetrics.map((metric) => metric.position.symbol),
              values: correlationMatrix,
            },
            herfindahlIndex: calculateHerfindahlIndex(normalizedWeights),
          });
        }

        const rebalance = calculateEqualWeightRebalance(calculatedMetrics).sort(
          (a, b) => Math.abs(b.deltaWeight) - Math.abs(a.deltaWeight)
        );
        setRebalanceSuggestions(rebalance);

        const exposures = calculatedMetrics.map((metric) => ({
          symbol: metric.position.symbol,
          display: metric.position.display,
          usdValue: metric.currentValue,
          ilsValue: metric.currentValue * usdToIls,
          weight: totalValue > 0 ? metric.currentValue / totalValue : 0,
        }));

        setCurrencyExposure({
          baseCurrency: settings.currency,
          usdValue: totalValue,
          ilsValue: totalValue * usdToIls,
          exposureByPosition: exposures,
        });

        setLastUpdated(new Date());
      } catch (err) {
        console.error('Failed to load analysis data:', err);
        if (!cancelled) {
          setError(locale === 'he' ? 'שגיאה בטעינת הנתונים' : 'Failed to load analysis data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setHistoricalLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [fetchHistorical, locale, refreshTrigger, settings.annualGrowthRate, settings.currency, settings.finnhubToken]);

  const simulatedScenario = useMemo(() => {
    if (!summary) {
      return null;
    }
    const baseRate = summary.usdToIlsRate;
    const adjustmentFactor = 1 + rateAdjustment / 100;
    const adjustedRate = baseRate * adjustmentFactor;
    const totalUsd = summary.totalValue;

    return {
      usdIlsRate: adjustedRate,
      totalValueUsd: totalUsd,
      totalValueIls: totalUsd * adjustedRate,
    } satisfies WhatIfScenario;
  }, [rateAdjustment, summary]);

  const renderPercent = (value?: number) => {
    if (value === undefined || !Number.isFinite(value)) {
      return '—';
    }
    return formatPercent(value * 100, locale);
  };

  const renderNumber = (value?: number, fractionDigits = 2) => {
    if (value === undefined || !Number.isFinite(value)) {
      return '—';
    }
    return new Intl.NumberFormat(locale === 'he' ? 'he-IL' : 'en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  };

  const renderCurrency = (value?: number, currency: 'USD' | 'ILS' = 'USD') => {
    if (value === undefined || !Number.isFinite(value)) {
      return '—';
    }
    return formatCurrency(value, currency, locale);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5FAFF] via-[#E6F2FF] to-[#D9E9FF]">
      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-[#0F172A]">{t.analysis.title}</h1>
              <p className="text-sm text-[#475569]">
                {t.analysis.subtitle} • {t.analysis.updated}{' '}
                {lastUpdated.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRateAdjustment(0)}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading || historicalLoading ? 'animate-spin' : ''}`} />
          </Button>
        </header>

        {loading ? (
          <div className="backdrop-blur-sm bg-white/85 rounded-2xl border border-white/50 shadow-xl p-8 text-center text-gray-500">
            {t.common.loading}
          </div>
        ) : error ? (
          <div className="backdrop-blur-sm bg-white/85 rounded-2xl border border-white/50 shadow-xl p-8 text-center text-red-500">
            {error}
          </div>
        ) : !positions.length || !summary ? (
          <div className="backdrop-blur-sm bg-white/85 rounded-2xl border border-white/50 shadow-xl p-8 text-center text-gray-500">
            {t.analysis.noData}
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="bg-white/85 border border-white/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {t.analysis.overviewTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-[#E0EAFF]">
                    <div className="text-sm text-gray-600">{t.analysis.totalValueUsd}</div>
                    <div className="text-2xl font-semibold text-[#0F172A]">
                      {renderCurrency(summary.totalValue, 'USD')}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#E0F7F0]">
                    <div className="text-sm text-gray-600">{t.analysis.totalValueIls}</div>
                    <div className="text-2xl font-semibold text-[#0F172A]">
                      {renderCurrency(summary.totalValue * summary.usdToIlsRate, 'ILS')}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-[#FFEDEB]">
                    <div className="text-sm text-gray-600">{t.analysis.totalPnLUsd}</div>
                    <div className={`text-2xl font-semibold ${summary.totalCurrentPnLUsd >= 0 ? 'text-[#4AA956]' : 'text-[#D22E2E]'}`}>
                      {renderCurrency(summary.totalCurrentPnLUsd, 'USD')}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/85 border border-white/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {t.analysis.portfolioMetricsTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {portfolioAnalytics ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <MetricCard
                      label={t.analysis.metrics.sharpe}
                      value={renderNumber(portfolioAnalytics.sharpeRatio)}
                    />
                    <MetricCard
                      label={t.analysis.metrics.sortino}
                      value={renderNumber(portfolioAnalytics.sortinoRatio)}
                    />
                    <MetricCard
                      label={t.analysis.metrics.volatility}
                      value={renderPercent(portfolioAnalytics.annualizedVolatility)}
                    />
                    <MetricCard
                      label={t.analysis.metrics.var}
                      value={renderCurrency(portfolioAnalytics.valueAtRisk95, 'USD')}
                    />
                    <MetricCard
                      label={t.analysis.metrics.es}
                      value={renderCurrency(portfolioAnalytics.expectedShortfall95, 'USD')}
                    />
                    <MetricCard
                      label={t.analysis.metrics.beta}
                      value={renderNumber(portfolioAnalytics.beta)}
                    />
                    <MetricCard
                      label={t.analysis.metrics.hhi}
                      value={renderNumber(portfolioAnalytics.herfindahlIndex)}
                    />
                  </div>
                ) : (
                  <div className="text-center text-sm text-gray-500">{t.analysis.noAnalytics}</div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/85 border border-white/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {t.analysis.positionAnalyticsTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.analysis.columns.position}</TableHead>
                      <TableHead>{t.analysis.columns.cagr}</TableHead>
                      <TableHead>{t.analysis.columns.maxDrawdown}</TableHead>
                      <TableHead>{t.analysis.columns.vol30}</TableHead>
                      <TableHead>{t.analysis.columns.vol90}</TableHead>
                      <TableHead>{t.analysis.columns.meanReturn}</TableHead>
                      <TableHead>{t.analysis.columns.var}</TableHead>
                      <TableHead>{t.analysis.columns.es}</TableHead>
                      <TableHead>{t.analysis.columns.observations}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positionAnalytics.map((analytics) => (
                      <TableRow key={analytics.symbol}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{analytics.display}</span>
                            <Badge variant="secondary" className="text-xs">
                              {analytics.symbol}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{renderPercent(analytics.cagr)}</TableCell>
                        <TableCell>{renderPercent(analytics.maxDrawdown)}</TableCell>
                        <TableCell>{renderPercent(analytics.annualizedVolatility30)}</TableCell>
                        <TableCell>{renderPercent(analytics.annualizedVolatility90)}</TableCell>
                        <TableCell>{renderPercent(analytics.meanDailyReturn)}</TableCell>
                        <TableCell>{renderCurrency(analytics.valueAtRisk95, 'USD')}</TableCell>
                        <TableCell>{renderCurrency(analytics.expectedShortfall95, 'USD')}</TableCell>
                        <TableCell>{analytics.observations}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="bg-white/85 border border-white/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {t.analysis.distributionTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.analysis.columns.position}</TableHead>
                      <TableHead>{t.analysis.columns.meanReturn}</TableHead>
                      <TableHead>{t.analysis.columns.medianReturn}</TableHead>
                      <TableHead>{t.analysis.columns.stdDevReturn}</TableHead>
                      <TableHead>{t.analysis.columns.minReturn}</TableHead>
                      <TableHead>{t.analysis.columns.maxReturn}</TableHead>
                      <TableHead>{t.analysis.columns.percentile5}</TableHead>
                      <TableHead>{t.analysis.columns.percentile95}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {positionAnalytics.map((analytics) => (
                      <TableRow key={`${analytics.symbol}-distribution`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{analytics.display}</span>
                            <Badge variant="secondary" className="text-xs">
                              {analytics.symbol}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{renderPercent(analytics.meanDailyReturn)}</TableCell>
                        <TableCell>{renderPercent(analytics.medianDailyReturn)}</TableCell>
                        <TableCell>{renderPercent(analytics.stdDevDailyReturn)}</TableCell>
                        <TableCell>{renderPercent(analytics.minDailyReturn)}</TableCell>
                        <TableCell>{renderPercent(analytics.maxDailyReturn)}</TableCell>
                        <TableCell>{renderPercent(analytics.percentile5)}</TableCell>
                        <TableCell>{renderPercent(analytics.percentile95)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {portfolioAnalytics?.correlationMatrix && portfolioAnalytics.correlationMatrix.values.length > 1 && (
              <Card className="bg-white/85 border border-white/50 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {t.analysis.correlationTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-auto">
                    <table className="min-w-full text-sm text-gray-700">
                      <thead>
                        <tr>
                          <th className="p-2 text-left text-gray-500">{t.analysis.columns.position}</th>
                          {portfolioAnalytics.correlationMatrix.symbols.map((symbol) => (
                            <th key={symbol} className="p-2 text-left text-gray-500">
                              {symbol}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {portfolioAnalytics.correlationMatrix.values.map((row, rowIndex) => (
                          <tr key={portfolioAnalytics.correlationMatrix?.symbols[rowIndex] ?? rowIndex}>
                            <td className="p-2 font-medium text-gray-900">
                              {portfolioAnalytics.correlationMatrix?.symbols[rowIndex]}
                            </td>
                            {row.map((value, columnIndex) => (
                              <td
                                key={`${rowIndex}-${columnIndex}`}
                                className={`p-2 ${rowIndex === columnIndex ? 'bg-[#E0EAFF]/60' : ''}`}
                              >
                                {renderNumber(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-white/85 border border-white/50 shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-gray-900">
                  {t.analysis.rebalanceTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rebalanceSuggestions.length === 0 ? (
                  <div className="text-center text-sm text-gray-500">{t.analysis.noRebalance}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.analysis.columns.position}</TableHead>
                        <TableHead>{t.analysis.columns.currentWeight}</TableHead>
                        <TableHead>{t.analysis.columns.targetWeight}</TableHead>
                        <TableHead>{t.analysis.columns.deltaWeight}</TableHead>
                        <TableHead>{t.analysis.columns.action}</TableHead>
                        <TableHead>{t.analysis.columns.units}</TableHead>
                        <TableHead>{t.analysis.columns.currentValue}</TableHead>
                        <TableHead>{t.analysis.columns.targetValue}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rebalanceSuggestions.map((suggestion) => (
                        <TableRow key={suggestion.symbol}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">
                                {suggestion.display ?? suggestion.symbol}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {suggestion.symbol}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>{renderPercent(suggestion.currentWeight)}</TableCell>
                          <TableCell>{renderPercent(suggestion.targetWeight)}</TableCell>
                          <TableCell>{renderPercent(suggestion.deltaWeight)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                suggestion.action === 'buy'
                                  ? 'default'
                                  : suggestion.action === 'sell'
                                    ? 'destructive'
                                    : 'outline'
                              }
                            >
                              {t.analysis.actions[suggestion.action]}
                            </Badge>
                          </TableCell>
                          <TableCell>{renderNumber(suggestion.unitsToTrade)}</TableCell>
                          <TableCell>{renderCurrency(suggestion.currentValue, 'USD')}</TableCell>
                          <TableCell>{renderCurrency(suggestion.targetValue, 'USD')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {currencyExposure && (
              <Card className="bg-white/85 border border-white/50 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-gray-900">
                    {t.analysis.currencyExposureTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <MetricCard
                      label={t.analysis.exposure.totalUsd}
                      value={renderCurrency(currencyExposure.usdValue, 'USD')}
                    />
                    <MetricCard
                      label={t.analysis.exposure.totalIls}
                      value={renderCurrency(currencyExposure.ilsValue, 'ILS')}
                    />
                    <MetricCard
                      label={t.analysis.exposure.currentRate}
                      value={renderNumber(summary.usdToIlsRate, 4)}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{t.analysis.whatIfTitle}</span>
                      <span className="text-sm text-gray-500">{t.analysis.whatIfHelper}</span>
                    </div>
                    <Slider
                      min={-20}
                      max={20}
                      step={1}
                      value={[rateAdjustment]}
                      onValueChange={handleRateChange}
                    />
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <MetricCard
                        label={t.analysis.whatIfRate}
                        value={renderNumber(simulatedScenario?.usdIlsRate)}
                      />
                      <MetricCard
                        label={t.analysis.whatIfUsd}
                        value={renderCurrency(simulatedScenario?.totalValueUsd, 'USD')}
                      />
                      <MetricCard
                        label={t.analysis.whatIfIls}
                        value={renderCurrency(simulatedScenario?.totalValueIls, 'ILS')}
                      />
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t.analysis.columns.position}</TableHead>
                        <TableHead>{t.analysis.exposure.usd}</TableHead>
                        <TableHead>{t.analysis.exposure.ils}</TableHead>
                        <TableHead>{t.analysis.exposure.weight}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currencyExposure.exposureByPosition.map((item) => (
                        <TableRow key={item.symbol}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{item.display}</span>
                              <Badge variant="secondary" className="text-xs">
                                {item.symbol}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>{renderCurrency(item.usdValue, 'USD')}</TableCell>
                          <TableCell>{renderCurrency(item.ilsValue, 'ILS')}</TableCell>
                          <TableCell>{renderPercent(item.weight)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="p-4 rounded-xl border border-slate-200 bg-white/60 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-semibold text-[#0F172A]">{value}</div>
    </div>
  );
}
