'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
  Customized,
  ReferenceArea,
} from 'recharts';
import type { TooltipProps } from 'recharts';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';

import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import {
  formatCurrency,
  formatDate,
  formatPercent,
  mapCandleDataToPoints,
} from '@/lib/calculations';
import type { ForecastResponse, HistoricalPoint, Locale } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const SECONDS_IN_DAY = 24 * 60 * 60;
const LOOKBACK_DAYS = 60;

interface ChartDatum {
  timestamp: number;
  open: number;
  close: number;
  high: number;
  low: number;
  type: 'actual' | 'forecast';
  label: string;
  horizonDays?: number;
  predictedReturn?: number;
  pUp?: number;
  pDown?: number;
}

interface ForecastViewProps {
  symbol: string;
}

type TranslationShape = ReturnType<typeof useTranslation>['t'];

type ForecastTooltipProps = TooltipProps<number, string> & {
  locale: Locale;
  t: TranslationShape;
};

function ForecastTooltipContent({ active, payload, locale, t }: ForecastTooltipProps) {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0]?.payload as ChartDatum | undefined;
  if (!item) {
    return null;
  }

  const isForecast = item.type === 'forecast';
  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';

  return (
    <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs text-slate-600 shadow-lg backdrop-blur">
      <div className="font-semibold text-slate-900">
        {new Date(item.timestamp).toLocaleDateString(localeCode, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <span>{t.forecast.tooltip.open}</span>
        <span className="font-medium text-slate-900">{formatCurrency(item.open, 'USD', locale)}</span>
        <span>{t.forecast.tooltip.high}</span>
        <span className="font-medium text-slate-900">{formatCurrency(item.high, 'USD', locale)}</span>
        <span>{t.forecast.tooltip.low}</span>
        <span className="font-medium text-slate-900">{formatCurrency(item.low, 'USD', locale)}</span>
        <span>{isForecast ? t.forecast.tooltip.predicted : t.forecast.tooltip.close}</span>
        <span className={cn('font-medium', isForecast ? 'text-blue-600' : 'text-slate-900')}>
          {formatCurrency(item.close, 'USD', locale)}
        </span>
        {isForecast ? (
          <>
            <span>{t.forecast.tooltip.probabilityUp}</span>
            <span className="font-medium text-emerald-600">
              {formatPercent((item.pUp ?? 0) * 100, locale)}
            </span>
            <span>{t.forecast.tooltip.probabilityDown}</span>
            <span className="font-medium text-rose-600">
              {formatPercent((item.pDown ?? 0) * 100, locale)}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

interface CandlestickSeriesProps {
  data: ChartDatum[];
  xAxisMap?: Record<string, { scale?: (value: number) => number }>;
  yAxisMap?: Record<string, { scale?: (value: number) => number }>;
  offset?: { left?: number; top?: number };
  chartWidth?: number;
}

function CandlestickSeries({ data, xAxisMap = {}, yAxisMap = {}, offset = {}, chartWidth = 0 }: CandlestickSeriesProps) {
  if (!data.length) {
    return null;
  }

  const xAxisKey = Object.keys(xAxisMap)[0];
  const yAxisKey = Object.keys(yAxisMap)[0];
  const xScale = xAxisKey ? xAxisMap[xAxisKey]?.scale : undefined;
  const yScale = yAxisKey ? yAxisMap[yAxisKey]?.scale : undefined;

  if (typeof xScale !== 'function' || typeof yScale !== 'function') {
    return null;
  }

  const left = offset.left ?? 0;
  const top = offset.top ?? 0;

  return (
    <g>
      {data.map((entry, index) => {
        const xValue = xScale(entry.timestamp);
        if (!Number.isFinite(xValue)) {
          return null;
        }

        const spacing = (() => {
          if (index < data.length - 1) {
            const next = xScale(data[index + 1]?.timestamp ?? 0);
            if (Number.isFinite(next)) {
              return Math.abs(next - xValue);
            }
          }
          if (index > 0) {
            const prev = xScale(data[index - 1]?.timestamp ?? 0);
            if (Number.isFinite(prev)) {
              return Math.abs(xValue - prev);
            }
          }
          return chartWidth / Math.max(1, data.length);
        })();

        const candleWidth = Math.max(6, Math.min(18, spacing * 0.6));
        const centerX = left + xValue;

        const openY = yScale(entry.open);
        const closeY = yScale(entry.close);
        const highY = yScale(entry.high);
        const lowY = yScale(entry.low);

        if (
          !Number.isFinite(openY) ||
          !Number.isFinite(closeY) ||
          !Number.isFinite(highY) ||
          !Number.isFinite(lowY)
        ) {
          return null;
        }

        const adjustedOpenY = top + (openY as number);
        const adjustedCloseY = top + (closeY as number);
        const adjustedHighY = top + (highY as number);
        const adjustedLowY = top + (lowY as number);

        const bodyTop = Math.min(adjustedOpenY, adjustedCloseY);
        const bodyBottom = Math.max(adjustedOpenY, adjustedCloseY);
        const bodyHeight = Math.max(1, bodyBottom - bodyTop);

        const isForecast = entry.type === 'forecast';
        const isUp = entry.close >= entry.open;
        const color = isForecast ? '#2563EB' : isUp ? '#16a34a' : '#dc2626';
        const strokeDasharray = isForecast ? '4 2' : undefined;
        const strokeOpacity = isForecast ? 0.9 : 1;
        const fillOpacity = isForecast ? 0.18 : 0.85;

        return (
          <g key={`${entry.timestamp}-${entry.type}`}>
            <line
              x1={centerX}
              x2={centerX}
              y1={Math.min(adjustedHighY, adjustedLowY)}
              y2={Math.max(adjustedHighY, adjustedLowY)}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray={strokeDasharray}
              strokeOpacity={strokeOpacity}
            />
            <rect
              x={centerX - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={bodyHeight}
              fill={color}
              fillOpacity={fillOpacity}
              stroke={color}
              strokeWidth={1}
              strokeDasharray={strokeDasharray}
              strokeOpacity={strokeOpacity}
              rx={isForecast ? 3 : 1.5}
            />
          </g>
        );
      })}
    </g>
  );
}

export function ForecastView({ symbol }: ForecastViewProps) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);

  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [history, setHistory] = useState<HistoricalPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - LOOKBACK_DAYS * SECONDS_IN_DAY;

        const [forecastResponse, candlesResponse] = await Promise.all([
          fetch(`/api/forecast?ticker=${encodeURIComponent(symbol)}`),
          fetch(
            `/api/candles?symbol=${encodeURIComponent(symbol)}&resolution=D&from=${from}&to=${now}`
          ),
        ]);

        if (!forecastResponse.ok) {
          const maybeJson = await forecastResponse.json().catch(() => null);
          throw new Error(maybeJson?.error || `Forecast request failed (${forecastResponse.status})`);
        }

        const forecastJson = (await forecastResponse.json()) as ForecastResponse & { error?: string };
        if (forecastJson.error) {
          throw new Error(forecastJson.error);
        }

        let historicalPoints: HistoricalPoint[] = [];
        if (candlesResponse.ok) {
          const candleJson = await candlesResponse.json();
          if (!candleJson?.error) {
            historicalPoints = mapCandleDataToPoints(candleJson);
          } else {
            console.warn('Candles API error:', candleJson.error);
          }
        } else {
          console.warn('Candles request failed with status', candlesResponse.status);
        }

        if (!active) {
          return;
        }

        setForecast(forecastJson);
        setHistory(historicalPoints);
      } catch (err) {
        console.error('Failed to load forecast data:', err);
        if (active) {
          setForecast(null);
          setHistory([]);
          setError(err instanceof Error ? err.message : null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [symbol, reloadKey]);

  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';

  const historySlice = useMemo(() => {
    if (!history.length) {
      return [] as HistoricalPoint[];
    }
    return history.slice(-30);
  }, [history]);

  const chartData = useMemo<ChartDatum[]>(() => {
    const points: ChartDatum[] = historySlice.map((point) => {
      const open = point.open ?? point.close;
      const high = point.high ?? Math.max(open, point.close);
      const low = point.low ?? Math.min(open, point.close);
      return {
        timestamp: point.timestamp,
        open,
        close: point.close,
        high,
        low,
        type: 'actual',
        label: new Date(point.timestamp).toISOString(),
      } satisfies ChartDatum;
    });

    if ((!points.length || !Number.isFinite(points[points.length - 1]?.close)) && forecast) {
      const asOfTimestamp = new Date(forecast.as_of_date).getTime();
      if (Number.isFinite(asOfTimestamp) && Number.isFinite(forecast.close_last)) {
        points.push({
          timestamp: asOfTimestamp,
          open: forecast.close_last,
          close: forecast.close_last,
          high: forecast.close_last,
          low: forecast.close_last,
          type: 'actual',
          label: forecast.as_of_date,
        });
      }
    }

    if (!forecast?.horizons?.length) {
      return points;
    }

    let previousClose = points.length ? points[points.length - 1]?.close ?? forecast.close_last : forecast.close_last;
    const asOfTimestamp = new Date(forecast.as_of_date).getTime();

    const futurePoints = forecast.horizons.map((horizon) => {
      const targetTimestamp = new Date(horizon.target_date).getTime();
      const fallbackTimestamp = Number.isFinite(asOfTimestamp)
        ? asOfTimestamp + horizon.horizon_days * SECONDS_IN_DAY * 1000
        : Date.now() + horizon.horizon_days * SECONDS_IN_DAY * 1000;
      const timestamp = Number.isFinite(targetTimestamp) ? targetTimestamp : fallbackTimestamp;
      const open = previousClose;
      const close = horizon.pred_close;
      const high = Math.max(open, close);
      const low = Math.min(open, close);
      previousClose = close;
      return {
        timestamp,
        open,
        close,
        high,
        low,
        type: 'forecast' as const,
        label: horizon.target_date,
        horizonDays: horizon.horizon_days,
        predictedReturn: horizon.pred_return,
        pUp: horizon.p_up,
        pDown: horizon.p_down,
      } satisfies ChartDatum;
    });

    return [...points, ...futurePoints];
  }, [forecast, historySlice]);

  const forecastStart = useMemo(() => {
    return chartData.find((item) => item.type === 'forecast')?.timestamp ?? null;
  }, [chartData]);

  const yDomain = useMemo(() => {
    if (!chartData.length) {
      return undefined;
    }

    const lows = chartData.map((item) => item.low);
    const highs = chartData.map((item) => item.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const padding = Math.max(1, (max - min) * 0.08);
    return [Math.max(0, min - padding), max + padding];
  }, [chartData]);

  const probabilitySummary = useMemo(() => {
    if (!forecast?.horizons?.length) {
      return null;
    }

    const horizons = forecast.horizons;
    const topUp = horizons.reduce((acc, item) => (item.p_up > acc.p_up ? item : acc), horizons[0]);
    const topDown = horizons.reduce((acc, item) => (item.p_down > acc.p_down ? item : acc), horizons[0]);

    return { topUp, topDown };
  }, [forecast?.horizons]);

  const horizonRows = forecast?.horizons ?? [];
  const summaryError = error ?? t.forecast.errorDescription;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#EEF5FF]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#E4F1FF] via-[#F8FBFF] to-[#E3EEFF]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
      <div className="relative">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <Badge className="border border-blue-100 bg-blue-50 px-3 py-1 text-blue-600 shadow-sm">{symbol}</Badge>
                {forecast ? (
                  <span>
                    {t.forecast.summary.asOf}:{' '}
                    <span className="font-semibold text-slate-700">
                      {formatDate(forecast.as_of_date, locale)}
                    </span>
                  </span>
                ) : null}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{t.forecast.title}</h1>
                <p className="mt-1 text-sm text-slate-600 sm:text-base">{t.forecast.subtitle(symbol)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="gap-2 text-blue-600 hover:text-blue-700"
              >
                <Link href="/">
                  <ArrowLeft className="h-4 w-4" />
                  {t.forecast.back}
                </Link>
              </Button>
              <Button
                size="sm"
                className="gap-2 bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                onClick={() => setReloadKey((key) => key + 1)}
                disabled={loading}
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                {t.forecast.reload}
              </Button>
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-[420px] w-full rounded-3xl" />
          ) : error ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-rose-200 bg-rose-50/80 p-6 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-rose-100 p-2 text-rose-600">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-rose-700">{t.forecast.errorTitle}</h2>
                    <p className="mt-1 text-sm text-rose-600">{summaryError}</p>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => setReloadKey((key) => key + 1)}
              >
                <RefreshCw className="h-4 w-4" />
                {t.forecast.reload}
              </Button>
            </div>
          ) : !forecast ? (
            <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm text-slate-600 shadow-sm">
              {t.forecast.empty}
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2 border border-white/60 bg-white/80 shadow-xl">
                  <CardHeader className="gap-2">
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      {t.forecast.chart.title}
                    </CardTitle>
                    <p className="text-sm text-slate-500">{t.forecast.chart.subtitle}</p>
                  </CardHeader>
                  <CardContent>
                    {chartData.length === 0 ? (
                      <div className="flex h-72 items-center justify-center text-sm text-slate-500">
                        {t.stock.historyUnavailable}
                      </div>
                    ) : (
                      <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                            {forecastStart ? (
                              <ReferenceArea
                                yAxisId="price"
                                xAxisId="time"
                                x1={forecastStart}
                                x2={chartData[chartData.length - 1]?.timestamp}
                                fill="rgba(37, 99, 235, 0.08)"
                                stroke={false}
                              />
                            ) : null}
                            <XAxis
                              dataKey="timestamp"
                              xAxisId="time"
                              type="number"
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) =>
                                new Date(value as number).toLocaleDateString(localeCode, {
                                  month: 'short',
                                  day: '2-digit',
                                })
                              }
                            />
                            <YAxis
                              yAxisId="price"
                              tickLine={false}
                              axisLine={false}
                              domain={yDomain as [number, number] | undefined}
                              tickFormatter={(value) => formatCurrency(value as number, 'USD', locale)}
                            />
                            <Tooltip
                              content={<ForecastTooltipContent locale={locale} t={t} />}
                              cursor={{ stroke: 'rgba(148, 163, 184, 0.35)' }}
                            />
                            <Line
                              type="monotone"
                              dataKey="close"
                              stroke="transparent"
                              yAxisId="price"
                              xAxisId="time"
                              dot={false}
                              activeDot={{ r: 4, stroke: '#2563EB', strokeWidth: 1.5, fill: '#fff' }}
                            />
                            <Customized component={<CandlestickSeries data={chartData} />} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <p className="mt-4 text-xs text-slate-500">{t.forecast.chart.helper}</p>
                  </CardContent>
                </Card>

                <Card className="border border-white/60 bg-white/80 shadow-xl">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold text-slate-900">
                      {t.forecast.summary.lastClose}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <dl className="space-y-3 text-sm text-slate-600">
                      <div className="flex items-center justify-between">
                        <dt>{t.forecast.summary.lastClose}</dt>
                        <dd className="text-base font-semibold text-slate-900">
                          {formatCurrency(forecast.close_last, 'USD', locale)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>{t.forecast.summary.asOf}</dt>
                        <dd className="text-base font-semibold text-slate-900">
                          {formatDate(forecast.as_of_date, locale)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>{t.forecast.summary.forecastDays}</dt>
                        <dd className="text-base font-semibold text-slate-900">
                          {forecast.horizons.length}
                        </dd>
                      </div>
                    </dl>

                    {probabilitySummary ? (
                      <div className="space-y-3">
                        <div className="rounded-2xl bg-emerald-50/70 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                            {t.forecast.probability.highestUp}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-emerald-700">
                            {formatPercent(probabilitySummary.topUp.p_up * 100, locale)}
                          </p>
                          <p className="text-xs text-emerald-700">
                            {formatDate(probabilitySummary.topUp.target_date, locale)} · {t.forecast.horizons.horizon}:{' '}
                            {probabilitySummary.topUp.horizon_days}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-rose-50/70 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                            {t.forecast.probability.highestDown}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-rose-700">
                            {formatPercent(probabilitySummary.topDown.p_down * 100, locale)}
                          </p>
                          <p className="text-xs text-rose-700">
                            {formatDate(probabilitySummary.topDown.target_date, locale)} · {t.forecast.horizons.horizon}:{' '}
                            {probabilitySummary.topDown.horizon_days}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <Card className="border border-white/60 bg-white/85 shadow-xl">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    {t.forecast.horizons.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>{t.forecast.horizons.date}</TableHead>
                        <TableHead>{t.forecast.horizons.horizon}</TableHead>
                        <TableHead>{t.forecast.horizons.predictedClose}</TableHead>
                        <TableHead>{t.forecast.horizons.expectedReturn}</TableHead>
                        <TableHead>{t.forecast.horizons.probabilityUp}</TableHead>
                        <TableHead>{t.forecast.horizons.probabilityDown}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {horizonRows.map((row) => (
                        <TableRow key={`${row.target_date}-${row.horizon_days}`}>
                          <TableCell className="font-medium text-slate-800">
                            {formatDate(row.target_date, locale)}
                          </TableCell>
                          <TableCell>{row.horizon_days}</TableCell>
                          <TableCell>{formatCurrency(row.pred_close, 'USD', locale)}</TableCell>
                          <TableCell>{formatPercent(row.pred_return * 100, locale)}</TableCell>
                          <TableCell className="text-emerald-600">
                            {formatPercent(row.p_up * 100, locale)}
                          </TableCell>
                          <TableCell className="text-rose-600">
                            {formatPercent(row.p_down * 100, locale)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
