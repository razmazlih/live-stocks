'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCcw } from 'lucide-react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { formatCurrency } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
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

type ForecastUpstreamPayload = unknown;

type NormalizedForecastModel = {
  modelName: string;
  horizon: number;
  ticker?: string;
  date?: string;
  pUp?: number;
  pDown?: number;
  pricePoint?: number;
  priceP10?: number;
  priceP50?: number;
  priceP90?: number;
  priceQuantiles: Record<string, number>;
  qualityScore?: number;
  flags?: string;
  raw: Record<string, unknown>;
};

type ForecastDataset = {
  horizon: number;
  primary: NormalizedForecastModel;
  models: NormalizedForecastModel[];
};

function coerceNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeQuantiles(candidate: Record<string, unknown>) {
  const candidateQuantiles = candidate['price_quantiles'];
  if (candidateQuantiles && typeof candidateQuantiles === 'object') {
    return candidateQuantiles as Record<string, number>;
  }

  const quantiles: Record<string, number> = {};
  const pricePoint = coerceNumber(candidate['price_point']);
  const priceP50 = coerceNumber(candidate['price_p50']);
  const priceP10 = coerceNumber(candidate['price_p10']);
  const priceP90 = coerceNumber(candidate['price_p90']);

  if (pricePoint !== undefined) {
    quantiles.price_point = pricePoint;
  }

  if (priceP50 !== undefined) {
    quantiles.price_p50 = priceP50;
  }

  if (priceP10 !== undefined) {
    quantiles.price_p10 = priceP10;
  }

  if (priceP90 !== undefined) {
    quantiles.price_p90 = priceP90;
  }

  return quantiles;
}

function isForecastCandidate(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function normalizeForecastModel(candidate: Record<string, unknown>, fallbackHorizon: number): NormalizedForecastModel | null {
  const horizonValue = coerceNumber(candidate['horizon']) ?? fallbackHorizon;
  const priceQuantiles = normalizeQuantiles(candidate);

  const pUp = coerceNumber(candidate['p_up']);
  const pDown = coerceNumber(candidate['p_down']) ?? (typeof pUp === 'number' ? Math.max(0, Math.min(1, 1 - pUp)) : undefined);

  const modelRaw = typeof candidate['model'] === 'string' ? candidate['model'].trim() : '';
  const modelName = modelRaw.length > 0 ? modelRaw : 'Model';

  return {
    modelName,
    horizon: horizonValue,
    ticker: typeof candidate['ticker'] === 'string' ? candidate['ticker'] : undefined,
    date: typeof candidate['date'] === 'string' ? candidate['date'] : undefined,
    pUp,
    pDown,
    pricePoint: coerceNumber(candidate['price_point']),
    priceP10: coerceNumber(candidate['price_p10']),
    priceP50: coerceNumber(candidate['price_p50']),
    priceP90: coerceNumber(candidate['price_p90']),
    priceQuantiles,
    qualityScore: coerceNumber(candidate['quality_score']),
    flags: typeof candidate['flags'] === 'string' ? candidate['flags'] : undefined,
    raw: candidate,
  };
}

function selectPreferredForecast(models: NormalizedForecastModel[]) {
  const sortedByQuality = [...models].sort((a, b) => {
    const aScore = a.qualityScore ?? Number.NEGATIVE_INFINITY;
    const bScore = b.qualityScore ?? Number.NEGATIVE_INFINITY;
    return bScore - aScore;
  });

  const unfiltered = sortedByQuality.find((model) => {
    const flags = model.flags?.toLowerCase() ?? '';
    return !flags.includes('filtered');
  });

  return unfiltered ?? sortedByQuality[0];
}

function resolveForecastPayload(payload: ForecastUpstreamPayload, fallbackHorizon: number): ForecastDataset | null {
  const entries = Array.isArray(payload) ? payload : [payload];
  const models = entries
    .filter(isForecastCandidate)
    .map((entry) => normalizeForecastModel(entry, fallbackHorizon))
    .filter((entry): entry is NormalizedForecastModel => entry !== null);

  if (models.length === 0) {
    return null;
  }

  const primary = selectPreferredForecast(models);
  const horizon = primary?.horizon ?? models[0].horizon ?? fallbackHorizon;

  return {
    horizon,
    primary,
    models,
  };
}

function getQuantileValue(model: NormalizedForecastModel | null | undefined, key: string) {
  if (!model) {
    return undefined;
  }

  const value = model.priceQuantiles?.[key];
  return typeof value === 'number' ? value : undefined;
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

  const [forecastSets, setForecastSets] = useState<ForecastDataset[]>([]);
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

            const rawPayload = (await response.json()) as ForecastUpstreamPayload;
            const forecast = resolveForecastPayload(rawPayload, horizon);

            if (!forecast) {
              throw new Error('Forecast service returned an unexpected payload.');
            }

            return forecast;
          })
        );

        if (!controller.signal.aborted) {
          setForecastSets(responses.sort((a, b) => a.horizon - b.horizon));
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setForecastSets([]);
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

  const primaryModels = useMemo(
    () => forecastSets.map((dataset) => dataset.primary),
    [forecastSets]
  );

  const quantileDefinitions = useMemo<QuantileDefinition[]>(() => {
    const entries = new Map<string, string>();

    for (const forecast of primaryModels) {
      const quantiles = forecast.priceQuantiles ?? {};
      for (const [key] of Object.entries(quantiles)) {
        const chartKey = sanitizeQuantileKey(key);
        if (!entries.has(chartKey)) {
          entries.set(chartKey, key);
        }
      }
    }

    return Array.from(entries.entries()).map(([chartKey, label]) => ({ chartKey, label }));
  }, [primaryModels]);

  const quantileChartData = useMemo<QuantileChartDatum[]>(() => {
    return primaryModels
      .map((forecast) => {
        const base: QuantileChartDatum = {
          horizon: forecast.horizon,
          label: horizonLabel(forecast.horizon),
        };

        const quantiles = forecast.priceQuantiles ?? {};
        for (const [key, value] of Object.entries(quantiles)) {
          const chartKey = sanitizeQuantileKey(key);
          base[chartKey] = value;
        }

        if (typeof forecast.pUp === 'number') {
          base.probability = forecast.pUp;
        }

        return base;
      })
      .sort((a, b) => (a.horizon as number) - (b.horizon as number));
  }, [primaryModels, horizonLabel]);

  const tableRows = useMemo(() => {
    return forecastSets.flatMap((dataset) =>
      dataset.models.map((model, index) => {
        const parsedDate = model.date ? new Date(model.date) : null;

        return {
          id: `${dataset.horizon}-${model.modelName}-${index}`,
          horizon: dataset.horizon,
          horizonLabel: horizonLabel(dataset.horizon),
          modelName: model.modelName,
          ticker: model.ticker,
          date: model.date,
          dateLabel:
            parsedDate && !Number.isNaN(parsedDate.getTime())
              ? parsedDate.toLocaleDateString(localeCode, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : model.date ?? null,
          pUp: model.pUp,
          pDown: model.pDown,
          pricePoint:
            model.pricePoint ??
            model.priceP50 ??
            getQuantileValue(model, 'price_point') ??
            getQuantileValue(model, 'price_p50'),
          priceP10: model.priceP10 ?? getQuantileValue(model, 'price_p10'),
          priceP50: model.priceP50 ?? getQuantileValue(model, 'price_p50'),
          priceP90: model.priceP90 ?? getQuantileValue(model, 'price_p90'),
          qualityScore: model.qualityScore,
          flags: model.flags,
        };
      })
    );
  }, [forecastSets, horizonLabel, localeCode]);

  const summaryForecast = useMemo(() => {
    if (forecastSets.length === 0) {
      return null;
    }

    const sorted = [...forecastSets].sort((a, b) => a.horizon - b.horizon);
    return sorted[0]?.primary ?? null;
  }, [forecastSets]);

  const summaryMetadata = useMemo(() => {
    if (!summaryForecast) {
      return null;
    }

    const parsedDate = summaryForecast.date ? new Date(summaryForecast.date) : null;
    const dateLabel =
      parsedDate && !Number.isNaN(parsedDate.getTime())
        ? parsedDate.toLocaleDateString(localeCode, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : summaryForecast.date ?? null;

    return {
      horizonLabel: horizonLabel(summaryForecast.horizon),
      dateLabel,
      modelName: summaryForecast.modelName,
      ticker: summaryForecast.ticker,
    };
  }, [summaryForecast, horizonLabel, localeCode]);

  const percentageFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeCode, {
        style: 'percent',
        maximumFractionDigits: 1,
      }),
    [localeCode]
  );

  const qualityFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeCode, {
        maximumFractionDigits: 2,
      }),
    [localeCode]
  );

  const summaryPricePoint =
    summaryForecast?.pricePoint ??
    summaryForecast?.priceP50 ??
    getQuantileValue(summaryForecast, 'price_point') ??
    getQuantileValue(summaryForecast, 'price_p50') ??
    null;

  const summaryPriceP10 =
    summaryForecast?.priceP10 ?? getQuantileValue(summaryForecast, 'price_p10') ?? null;

  const summaryPriceP90 =
    summaryForecast?.priceP90 ?? getQuantileValue(summaryForecast, 'price_p90') ?? null;

  const summaryProbabilityUp = summaryForecast?.pUp ?? null;
  const summaryQuality = summaryForecast?.qualityScore ?? null;

  const hasForecasts = forecastSets.length > 0;
  const hasQuantiles = quantileDefinitions.length > 0 && quantileChartData.length > 0;
  const hasProbabilitySeries = quantileChartData.some((row) => typeof row.probability === 'number');

  if (!featureEnabled) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F5FAFF] via-[#E6F2FF] to-[#D9E9FF]" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href={`/`}>
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
            {summaryForecast && summaryMetadata && (
              <Card className="bg-white/80 border border-white/60 shadow-lg backdrop-blur">
                <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle>{t.stock.forecastView.summaryCardTitle}</CardTitle>
                    <CardDescription>
                      {t.stock.forecastView.summaryCardDescription(
                        summaryMetadata.modelName,
                        summaryMetadata.horizonLabel
                      )}
                    </CardDescription>
                    {summaryMetadata.dateLabel ? (
                      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                        {t.stock.forecastView.summaryCardGenerated} {summaryMetadata.dateLabel}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      {summaryMetadata.horizonLabel}
                    </Badge>
                    <Badge variant="outline">{summaryMetadata.modelName}</Badge>
                    {summaryForecast.flags ? (
                      <Badge variant="outline" className="border-amber-300 text-amber-600">
                        {summaryForecast.flags}
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="rounded-lg bg-slate-50/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.pricePoint}</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {typeof summaryPricePoint === 'number'
                          ? formatCurrency(summaryPricePoint, 'USD', locale)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.priceP10}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {typeof summaryPriceP10 === 'number'
                          ? formatCurrency(summaryPriceP10, 'USD', locale)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.priceP90}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {typeof summaryPriceP90 === 'number'
                          ? formatCurrency(summaryPriceP90, 'USD', locale)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.probabilityUp}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {typeof summaryProbabilityUp === 'number'
                          ? percentageFormatter.format(summaryProbabilityUp)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-50/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.quality}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {typeof summaryQuality === 'number' ? qualityFormatter.format(summaryQuality) : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-white/80 border border-white/60 shadow">
              <CardHeader>
                <CardTitle>{t.stock.forecastView.quantilesCardTitle}</CardTitle>
                <CardDescription>{t.stock.forecastView.quantilesCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {hasQuantiles ? (
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={quantileChartData} margin={{ top: 20, right: 28, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.35)" />
                        <XAxis dataKey="label" tick={{ fill: '#475569' }} tickLine={false} axisLine={false} />
                        <YAxis
                          yAxisId="price"
                          tickFormatter={(value: number) => formatCurrency(value, 'USD', locale)}
                          tick={{ fill: '#475569' }}
                          width={80}
                          axisLine={false}
                          tickLine={false}
                        />
                        {hasProbabilitySeries ? (
                          <YAxis
                            yAxisId="probability"
                            orientation={isRtl ? 'left' : 'right'}
                            tickFormatter={(value: number) => percentageFormatter.format(value)}
                            tick={{ fill: '#475569' }}
                            width={70}
                            axisLine={false}
                            tickLine={false}
                            domain={[0, 1]}
                          />
                        ) : null}
                        <Tooltip
                          formatter={(value: number, _name: string, entry) => {
                            const dataKey = entry?.dataKey?.toString();
                            if (dataKey === 'probability') {
                              return [
                                percentageFormatter.format(value),
                                t.stock.forecastView.chart.probabilityLine,
                              ];
                            }
                            const definition = quantileDefinitions.find((definition) => definition.chartKey === dataKey);
                            return [
                              formatCurrency(value, 'USD', locale),
                              definition?.label ?? dataKey ?? '',
                            ];
                          }}
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
                              fill={`${color}1f`}
                              strokeWidth={2}
                              dot={false}
                              yAxisId="price"
                              name={definition.label}
                            />
                          );
                        })}
                        {hasProbabilitySeries ? (
                          <Line
                            type="monotone"
                            dataKey="probability"
                            yAxisId="probability"
                            stroke="#F97316"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                            name={t.stock.forecastView.chart.probabilityLine}
                          />
                        ) : null}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t.stock.forecastView.noQuantiles}</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/80 border border-white/60 shadow">
              <CardHeader>
                <CardTitle>{t.stock.forecastView.table.title}</CardTitle>
                <CardDescription>{t.stock.forecastView.table.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                {tableRows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-40">{t.stock.forecastView.table.horizon}</TableHead>
                          <TableHead>{t.stock.forecastView.table.model}</TableHead>
                          <TableHead>{t.stock.forecastView.table.probabilityUp}</TableHead>
                          <TableHead>{t.stock.forecastView.table.probabilityDown}</TableHead>
                          <TableHead>{t.stock.forecastView.table.pricePoint}</TableHead>
                          <TableHead>{t.stock.forecastView.table.priceP10}</TableHead>
                          <TableHead>{t.stock.forecastView.table.priceP50}</TableHead>
                          <TableHead>{t.stock.forecastView.table.priceP90}</TableHead>
                          <TableHead>{t.stock.forecastView.table.quality}</TableHead>
                          <TableHead>{t.stock.forecastView.table.flags}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableRows.map((row) => {
                          const flagTokens =
                            typeof row.flags === 'string'
                              ? row.flags
                                  .split(',')
                                  .map((token) => token.trim())
                                  .filter((token) => token.length > 0)
                              : [];

                          return (
                            <TableRow key={row.id}>
                              <TableCell className="font-medium">{row.horizonLabel}</TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium text-slate-900">{row.modelName}</span>
                                  {row.dateLabel ? (
                                    <span className="text-xs text-slate-500">{row.dateLabel}</span>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>
                                {typeof row.pUp === 'number' ? percentageFormatter.format(row.pUp) : '—'}
                              </TableCell>
                              <TableCell>
                                {typeof row.pDown === 'number' ? percentageFormatter.format(row.pDown) : '—'}
                              </TableCell>
                              <TableCell>
                                {typeof row.pricePoint === 'number'
                                  ? formatCurrency(row.pricePoint, 'USD', locale)
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                {typeof row.priceP10 === 'number'
                                  ? formatCurrency(row.priceP10, 'USD', locale)
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                {typeof row.priceP50 === 'number'
                                  ? formatCurrency(row.priceP50, 'USD', locale)
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                {typeof row.priceP90 === 'number'
                                  ? formatCurrency(row.priceP90, 'USD', locale)
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                {typeof row.qualityScore === 'number'
                                  ? qualityFormatter.format(row.qualityScore)
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                {flagTokens.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {flagTokens.map((token) => (
                                      <Badge key={token} variant="outline" className="text-xs uppercase tracking-wide">
                                        {token}
                                      </Badge>
                                    ))}
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t.stock.forecastView.states.empty}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
