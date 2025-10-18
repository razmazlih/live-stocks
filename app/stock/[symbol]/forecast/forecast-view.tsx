'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCcw } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { formatCurrency } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { ForecastApiResponse } from '@/types';
import { FORECAST_FEATURE_ENABLED } from '@/lib/forecast-config';

const FORECAST_HORIZONS = [1, 7, 30, 60, 90, 180, 365] as const;

type QuantileChartDatum = Record<string, number | string>;

type QuantileDefinition = {
  chartKey: string;
  label: string;
};

const QUANTILE_COLORS = ['#2563EB', '#0EA5E9', '#6366F1', '#22C55E', '#F97316', '#EC4899', '#A855F7'];

function sanitizeQuantileKey(key: string) {
  return `q_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function ForecastSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="bg-white/70 border border-white/50 shadow">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
      <Card className="bg-white/70 border border-white/50 shadow">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

interface ForecastViewProps {
  symbol: string;
}

export function ForecastView({ symbol }: ForecastViewProps) {
  const featureEnabled = FORECAST_FEATURE_ENABLED;
  const normalizedSymbol = symbol.toUpperCase();
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const isRtl = locale === 'he';
  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const horizonLabel = t.stock.forecastView.horizonLabel;

  const [forecasts, setForecasts] = useState<ForecastApiResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!featureEnabled) {
      return;
    }

    const controller = new AbortController();

    async function loadForecasts() {
      try {
        setLoading(true);
        setError(null);

        const responses = await Promise.all(
          FORECAST_HORIZONS.map(async (horizon) => {
            const response = await fetch(
              `/api/forecast/${horizon}/${encodeURIComponent(normalizedSymbol)}`,
              { signal: controller.signal }
            );

            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }

            const data = (await response.json()) as ForecastApiResponse;
            return {
              ...data,
              horizon: typeof data.horizon === 'number' ? data.horizon : horizon,
            } satisfies ForecastApiResponse;
          })
        );

        if (!controller.signal.aborted) {
          setForecasts(responses.sort((a, b) => a.horizon - b.horizon));
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setForecasts([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadForecasts();

    return () => {
      controller.abort();
    };
  }, [featureEnabled, normalizedSymbol, reloadKey]);

  const handleRefresh = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  const quantileDefinitions = useMemo<QuantileDefinition[]>(() => {
    const entries = new Map<string, string>();

    for (const forecast of forecasts) {
      const quantiles = forecast.price_quantiles ?? {};
      for (const [key] of Object.entries(quantiles)) {
        const chartKey = sanitizeQuantileKey(key);
        if (!entries.has(chartKey)) {
          entries.set(chartKey, key);
        }
      }
    }

    return Array.from(entries.entries()).map(([chartKey, label]) => ({ chartKey, label }));
  }, [forecasts]);

  const quantileChartData = useMemo<QuantileChartDatum[]>(() => {
    return forecasts
      .map((forecast) => {
        const base: QuantileChartDatum = {
          horizon: forecast.horizon,
          label: horizonLabel(forecast.horizon),
        };

        const quantiles = forecast.price_quantiles ?? {};
        for (const [key, value] of Object.entries(quantiles)) {
          const chartKey = sanitizeQuantileKey(key);
          base[chartKey] = value;
        }

        return base;
      })
      .sort((a, b) => (a.horizon as number) - (b.horizon as number));
  }, [forecasts, horizonLabel]);

  const historySeries = useMemo(() => {
    const candidate = forecasts.find(
      (forecast) => Array.isArray(forecast.price_history) && forecast.price_history.length > 0
    );

    if (!candidate?.price_history) {
      return [] as { date: string; label: string; price: number }[];
    }

    return candidate.price_history
      .map((point) => {
        if (!point || typeof point !== 'object') {
          return null;
        }

        const rawDate = 'date' in point && typeof point.date === 'string' ? point.date : null;
        const priceValue =
          typeof point.close === 'number'
            ? point.close
            : typeof point.price === 'number'
              ? point.price
              : null;

        if (!rawDate || priceValue === null) {
          return null;
        }

        const parsed = new Date(rawDate);
        const label = Number.isNaN(parsed.getTime())
          ? rawDate
          : parsed.toLocaleDateString(localeCode, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

        return { date: rawDate, label, price: priceValue };
      })
      .filter((value): value is { date: string; label: string; price: number } => value !== null);
  }, [forecasts, localeCode]);

  const hasForecasts = forecasts.length > 0;
  const hasHistory = historySeries.length > 0;
  const hasQuantiles = quantileDefinitions.length > 0 && quantileChartData.length > 0;

  if (!featureEnabled) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5FAFF] via-[#E6F2FF] to-[#D9E9FF]" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/stock/${symbol}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t.stock.back}
            </Button>
          </Link>

          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t.common.refresh}
          </Button>
        </header>

        <div className="mb-6 space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            {t.stock.forecastView.title} · {normalizedSymbol}
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">{t.stock.forecastView.subtitle}</p>
        </div>

        {loading && !hasForecasts ? (
          <ForecastSkeleton />
        ) : error ? (
          <Card className="bg-white/80 border border-red-200 text-red-700">
            <CardContent className="flex flex-col items-center gap-4 py-10">
              <div className="text-lg font-semibold">{t.stock.forecastView.states.error}</div>
              <div className="text-sm text-red-600/80">{error}</div>
              <Button variant="outline" onClick={handleRefresh}>
                {t.stock.forecastView.states.retry}
              </Button>
            </CardContent>
          </Card>
        ) : !hasForecasts ? (
          <Card className="bg-white/80 border border-slate-200/60 text-center text-slate-600">
            <CardContent className="py-10 text-lg font-semibold">
              {t.stock.forecastView.states.empty}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="bg-white/70 border border-white/50 shadow">
              <CardHeader>
                <CardTitle>{t.stock.forecastView.historyCardTitle}</CardTitle>
                <CardDescription>{t.stock.forecastView.historyCardDescription}</CardDescription>
              </CardHeader>
              <CardContent>
                {hasHistory ? (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={historySeries} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.4)" />
                        <XAxis dataKey="label" tick={{ fill: '#475569' }} tickLine={false} axisLine={false} angle={-15} dy={10} />
                        <YAxis
                          tickFormatter={(value: number) => formatCurrency(value, 'USD', locale)}
                          tick={{ fill: '#475569' }}
                          width={80}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(value: number) => formatCurrency(value, 'USD', locale)}
                          labelFormatter={(label: string) => label}
                        />
                        <Area
                          type="monotone"
                          dataKey="price"
                          stroke="#2563EB"
                          fill="rgba(37, 99, 235, 0.15)"
                          strokeWidth={2}
                          dot={false}
                          name={t.stock.forecast}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t.stock.forecastView.noHistory}</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/70 border border-white/50 shadow">
              <CardHeader>
                <CardTitle>{t.stock.forecastView.quantilesCardTitle}</CardTitle>
                <CardDescription>{t.stock.forecastView.quantilesCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {hasQuantiles ? (
                  <>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={quantileChartData} margin={{ top: 20, right: 20, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.4)" />
                          <XAxis dataKey="label" tick={{ fill: '#475569' }} tickLine={false} axisLine={false} />
                          <YAxis
                            tickFormatter={(value: number) => formatCurrency(value, 'USD', locale)}
                            tick={{ fill: '#475569' }}
                            width={80}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            formatter={(value: number, name: string) => [
                              formatCurrency(value, 'USD', locale),
                              quantileDefinitions.find((definition) => definition.chartKey === name)?.label ?? name,
                            ]}
                            labelFormatter={(label: string) => label}
                          />
                          <Legend />
                          {quantileDefinitions.map((definition, index) => {
                            const color = QUANTILE_COLORS[index % QUANTILE_COLORS.length];
                            return (
                              <Area
                                key={definition.chartKey}
                                type="monotone"
                                dataKey={definition.chartKey}
                                stroke={color}
                                fill={`${color}20`}
                                strokeWidth={2}
                                dot={false}
                                name={definition.label}
                              />
                            );
                          })}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-40">{t.stock.forecastView.table.horizon}</TableHead>
                            {quantileDefinitions.map((definition) => (
                              <TableHead key={definition.chartKey}>{definition.label}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {quantileChartData.map((row) => (
                            <TableRow key={`${row.horizon}`}>
                              <TableCell className="font-medium">{row.label as string}</TableCell>
                              {quantileDefinitions.map((definition) => {
                                const value = row[definition.chartKey];
                                return (
                                  <TableCell key={definition.chartKey} className="whitespace-nowrap">
                                    {typeof value === 'number'
                                      ? formatCurrency(value, 'USD', locale)
                                      : '—'}
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">{t.stock.forecastView.noQuantiles}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
