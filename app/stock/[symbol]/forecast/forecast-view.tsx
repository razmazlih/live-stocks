'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCcw } from 'lucide-react';
import type { TooltipProps } from 'recharts';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';

import { formatCurrency, mapCandleDataToPoints } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { FORECAST_FEATURE_ENABLED } from '@/lib/forecast-config';
import { CandleData, HistoricalPoint } from '@/types';

const FORECAST_HORIZONS = [1, 7, 30, 60, 90, 180, 365] as const;
const HISTORICAL_LOOKBACK_DAYS = 30;
const DAY_SECONDS = 60 * 60 * 24;
const HISTORICAL_PRICE_KEY = '__historicalPrice';
const HORIZON_LABEL_KEY = '__horizonLabel';
const DATA_TYPE_KEY = '__timelineType';

type QuantileChartDatum = Record<string, number | string>;

type QuantileDefinition = {
  chartKey: string;
  label: string;
};

const QUANTILE_COLORS = ['var(--color-primary-500)', 'var(--color-primary-300)', 'var(--color-purple-400)', 'var(--color-green-500)', 'var(--color-orange-500)', 'var(--color-pink-500)', 'var(--color-purple-300)'];

const CONFIDENCE_BASE_KEY = '__confidenceBase';
const CONFIDENCE_RANGE_KEY = '__confidenceRange';
const CONFIDENCE_LOWER_KEY = '__confidenceLower';
const CONFIDENCE_UPPER_KEY = '__confidenceUpper';

const QUANTILE_SORT_PRIORITY = [
  'price_point',
  'price_p50',
  'price_median',
  'price_mean',
  'price_p90',
  'price_p75',
  'price_p10',
  'price_p25',
];

type AggregatedForecastResult = {
  quantiles: Record<string, number>;
  probability?: number;
};

function sanitizeQuantileKey(key: string) {
  return `q_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

function getModelWeight(model: NormalizedForecastModel) {
  const score = model.qualityScore;
  if (typeof score === 'number' && Number.isFinite(score) && score > 0) {
    return score;
  }

  return 1;
}

function aggregateForecastModels(models: NormalizedForecastModel[]): AggregatedForecastResult | null {
  if (models.length === 0) {
    return null;
  }

  const quantileKeys = new Set<string>();

  for (const model of models) {
    const quantiles = model.priceQuantiles ?? {};
    for (const key of Object.keys(quantiles)) {
      quantileKeys.add(key);
    }
  }

  const quantiles: Record<string, number> = {};

  for (const key of Array.from(quantileKeys)) {
    let weightedSum = 0;
    let weightSum = 0;

    for (const model of models) {
      const value = model.priceQuantiles?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        const weight = getModelWeight(model);
        weightedSum += value * weight;
        weightSum += weight;
      }
    }

    if (weightSum > 0) {
      quantiles[key] = weightedSum / weightSum;
    }
  }

  let probability: number | undefined;
  let probabilitySum = 0;
  let probabilityWeightSum = 0;

  for (const model of models) {
    if (typeof model.pUp === 'number' && Number.isFinite(model.pUp)) {
      const weight = getModelWeight(model);
      probabilitySum += model.pUp * weight;
      probabilityWeightSum += weight;
    }
  }

  if (probabilityWeightSum > 0) {
    probability = probabilitySum / probabilityWeightSum;
  }

  if (Object.keys(quantiles).length === 0 && typeof probability !== 'number') {
    return null;
  }

  return { quantiles, probability };
}

function findQuantileValueFromMap(quantiles: Record<string, number>, candidates: string[]) {
  for (const candidate of candidates) {
    const value = quantiles[candidate];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function getQuantileSortValue(label: string) {
  const normalized = label.toLowerCase();
  const exactIndex = QUANTILE_SORT_PRIORITY.findIndex((token) => normalized === token);
  if (exactIndex !== -1) {
    return exactIndex;
  }

  const partialIndex = QUANTILE_SORT_PRIORITY.findIndex((token) => normalized.includes(token));
  if (partialIndex !== -1) {
    return QUANTILE_SORT_PRIORITY.length + partialIndex;
  }

  return QUANTILE_SORT_PRIORITY.length * 2 + normalized.length;
}

function findQuantileChartKey(definitions: QuantileDefinition[], candidates: string[]) {
  const lowered = candidates.map((candidate) => candidate.toLowerCase());

  for (const candidate of lowered) {
    const match = definitions.find((definition) => definition.label.toLowerCase() === candidate);
    if (match) {
      return match.chartKey;
    }
  }

  for (const candidate of lowered) {
    const match = definitions.find((definition) => definition.label.toLowerCase().includes(candidate));
    if (match) {
      return match.chartKey;
    }
  }

  return null;
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
      <Card className="bg-[color:var(--color-neutral-white)]/70 border border-[color:var(--color-neutral-white)]/50 shadow">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72 w-full" />
        </CardContent>
      </Card>
      <Card className="bg-[color:var(--color-neutral-white)]/70 border border-[color:var(--color-neutral-white)]/50 shadow">
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

interface ForecastChartTooltipProps extends TooltipProps<number, string> {
  formatPrice: (value: number) => string;
  formatProbability: (value: number) => string;
  formatLabel: (value: number | string) => string;
  labels: {
    confidence: string;
    median: string;
    pricePoint: string;
    probability: string;
    historical: string;
  };
  medianKey: string | null;
  pricePointKey: string | null;
}

function ForecastChartTooltip({
  active,
  payload,
  label,
  formatPrice,
  formatProbability,
  formatLabel,
  labels,
  medianKey,
  pricePointKey,
}: ForecastChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const source = payload[0]?.payload as QuantileChartDatum | undefined;

  if (!source) {
    return null;
  }

  const resolvedLabel =
    typeof source.label === 'string' && source.label.length > 0
      ? source.label
      : formatLabel(label ?? '');

  const lower =
    typeof source[CONFIDENCE_LOWER_KEY] === 'number' ? (source[CONFIDENCE_LOWER_KEY] as number) : null;
  const upper =
    typeof source[CONFIDENCE_UPPER_KEY] === 'number' ? (source[CONFIDENCE_UPPER_KEY] as number) : null;

  const items: { key: string; label: string; value: string; color: string }[] = [];

  if (typeof source[HISTORICAL_PRICE_KEY] === 'number') {
    items.push({
      key: 'historical',
      label: labels.historical,
      value: formatPrice(source[HISTORICAL_PRICE_KEY] as number),
      color: 'var(--color-primary-800)',
    });
  }

  if (lower !== null && upper !== null) {
    items.push({
      key: 'confidence',
      label: labels.confidence,
      value: `${formatPrice(lower)} – ${formatPrice(upper)}`,
      color: 'var(--color-primary-500)',
    });
  }

  if (medianKey && typeof source[medianKey] === 'number') {
    items.push({
      key: 'median',
      label: labels.median,
      value: formatPrice(source[medianKey] as number),
      color: 'var(--color-primary-700)',
    });
  }

  if (pricePointKey && pricePointKey !== medianKey && typeof source[pricePointKey] === 'number') {
    items.push({
      key: 'pricePoint',
      label: labels.pricePoint,
      value: formatPrice(source[pricePointKey] as number),
      color: 'var(--color-primary-300)',
    });
  }

  const probabilityValue =
    typeof source.probability === 'number' ? formatProbability(source.probability as number) : null;

  if (items.length === 0 && !probabilityValue) {
    return null;
  }

  return (
    <div className="rounded-xl border border-[color:var(--color-slate-200)]/70 bg-[color:var(--color-neutral-white)]/95 p-3 shadow-xl backdrop-blur">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{resolvedLabel}</p>
      <div className="mt-2 space-y-1">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-500">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
            <span className="font-semibold text-slate-900">{item.value}</span>
          </div>
        ))}
        {probabilityValue ? (
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-500">
              <span className="h-2 w-2 rounded-full bg-[var(--color-orange-500)]" />
              {labels.probability}
            </span>
            <span className="font-semibold text-slate-900">{probabilityValue}</span>
          </div>
        ) : null}
      </div>
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
  const [historicalPoints, setHistoricalPoints] = useState<HistoricalPoint[]>([]);
  const [historicalLoading, setHistoricalLoading] = useState(true);

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

  useEffect(() => {
    if (!featureEnabled) {
      return;
    }

    const controller = new AbortController();

    async function loadHistory() {
      try {
        setHistoricalLoading(true);

        const now = Math.floor(Date.now() / 1000);
        const from = now - HISTORICAL_LOOKBACK_DAYS * DAY_SECONDS;
        const url = `/api/candles?symbol=${encodeURIComponent(normalizedSymbol)}&resolution=D&from=${from}&to=${now}`;
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload = (await response.json()) as CandleData & { error?: string };

        if (payload.error) {
          throw new Error(payload.error);
        }

        const points = mapCandleDataToPoints(payload);

        if (!controller.signal.aborted) {
          setHistoricalPoints(points);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        console.warn('Failed to load historical price data:', err);
        if (!controller.signal.aborted) {
          setHistoricalPoints([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setHistoricalLoading(false);
        }
      }
    }

    loadHistory();

    return () => {
      controller.abort();
    };
  }, [featureEnabled, normalizedSymbol]);

  const primaryModels = useMemo(
    () => forecastSets.map((dataset) => dataset.primary),
    [forecastSets]
  );

  const { quantileDefinitions, quantileChartData } = useMemo(() => {
    const definitionEntries = new Map<string, string>();
    const rows: QuantileChartDatum[] = [];

    for (const dataset of forecastSets) {
      const aggregated = aggregateForecastModels(dataset.models);
      if (!aggregated) {
        continue;
      }

      const base: QuantileChartDatum = {
        horizon: dataset.horizon,
        label: horizonLabel(dataset.horizon),
        [HORIZON_LABEL_KEY]: horizonLabel(dataset.horizon),
      };

      for (const [key, value] of Object.entries(aggregated.quantiles)) {
        const chartKey = sanitizeQuantileKey(key);
        base[chartKey] = value;

        if (!definitionEntries.has(chartKey)) {
          definitionEntries.set(chartKey, key);
        }
      }

      if (typeof aggregated.probability === 'number') {
        base.probability = aggregated.probability;
      }

      const lower = findQuantileValueFromMap(aggregated.quantiles, [
        'price_p10',
        'price_p20',
        'price_point',
        'price_p50',
      ]);
      const upper = findQuantileValueFromMap(aggregated.quantiles, [
        'price_p90',
        'price_p80',
        'price_point',
        'price_p50',
      ]);

      if (typeof lower === 'number' && typeof upper === 'number' && upper >= lower) {
        base[CONFIDENCE_BASE_KEY] = lower;
        base[CONFIDENCE_RANGE_KEY] = upper - lower;
        base[CONFIDENCE_LOWER_KEY] = lower;
        base[CONFIDENCE_UPPER_KEY] = upper;
      }

      rows.push(base);
    }

    rows.sort((a, b) => (a.horizon as number) - (b.horizon as number));

    const definitions = Array.from(definitionEntries.entries())
      .map(([chartKey, label]) => ({ chartKey, label }))
      .sort((a, b) => getQuantileSortValue(a.label) - getQuantileSortValue(b.label));

    return { quantileDefinitions: definitions, quantileChartData: rows };
  }, [forecastSets, horizonLabel]);

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

  const groupedRows = useMemo(() => {
    const groups = new Map<
      number,
      {
        horizon: number;
        horizonLabel: string;
        rows: {
          id: string;
          horizon: number;
          horizonLabel: string;
          modelName: string;
          ticker?: string;
          date?: string;
          dateLabel: string | null;
          pUp?: number;
          pDown?: number;
          pricePoint?: number;
          priceP10?: number;
          priceP50?: number;
          priceP90?: number;
          qualityScore?: number;
          flags?: string;
        }[];
      }
    >();

    for (const row of tableRows) {
      const existing = groups.get(row.horizon);

      if (existing) {
        existing.rows.push(row);
        continue;
      }

      groups.set(row.horizon, {
        horizon: row.horizon,
        horizonLabel: row.horizonLabel,
        rows: [row],
      });
    }

    return Array.from(groups.values()).sort((a, b) => a.horizon - b.horizon);
  }, [tableRows]);

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

  const pricePointChartKey = useMemo(
    () => findQuantileChartKey(quantileDefinitions, ['price_point', 'point']),
    [quantileDefinitions]
  );

  const medianChartKey = useMemo(
    () => findQuantileChartKey(quantileDefinitions, ['price_p50', 'median']),
    [quantileDefinitions]
  );

  const hasConfidenceBand = useMemo(
    () =>
      quantileChartData.some(
        (row) =>
          typeof row[CONFIDENCE_BASE_KEY] === 'number' &&
          typeof row[CONFIDENCE_RANGE_KEY] === 'number'
      ),
    [quantileChartData]
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
  const hasHistorical = historicalPoints.length > 0;

  const chartDateFormatter = useCallback(
    (timestamp: number | string) => {
      if (typeof timestamp !== 'number') {
        return String(timestamp ?? '');
      }

      const date = new Date(timestamp);
      return date.toLocaleDateString(localeCode, {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
      });
    },
    [localeCode]
  );

  const timelineChartData = useMemo(() => {
    const rows: Array<QuantileChartDatum & { timestamp: number }> = [];

    for (const point of historicalPoints) {
      rows.push({
        timestamp: point.timestamp,
        label: chartDateFormatter(point.timestamp),
        [DATA_TYPE_KEY]: 'historical',
        [HISTORICAL_PRICE_KEY]: point.close,
      });
    }

    const lastHistoricalTimestamp = historicalPoints[historicalPoints.length - 1]?.timestamp ?? Date.now();

    for (const entry of quantileChartData) {
      const horizonDays = typeof entry.horizon === 'number' ? entry.horizon : 0;
      const targetTimestamp = lastHistoricalTimestamp + horizonDays * DAY_SECONDS * 1000;
      const horizonLabelValue =
        typeof entry[HORIZON_LABEL_KEY] === 'string' ? (entry[HORIZON_LABEL_KEY] as string) : undefined;
      const displayLabel = horizonLabelValue
        ? `${chartDateFormatter(targetTimestamp)} · ${horizonLabelValue}`
        : chartDateFormatter(targetTimestamp);

      rows.push({
        ...entry,
        timestamp: targetTimestamp,
        label: displayLabel,
        [DATA_TYPE_KEY]: 'forecast',
      });
    }

    return rows.sort((a, b) => a.timestamp - b.timestamp);
  }, [chartDateFormatter, historicalPoints, quantileChartData]);

  const hasChartData = timelineChartData.length > 0;
  const hasProbabilitySeries = timelineChartData.some((row) => typeof row.probability === 'number');

  // Determine exactly which price series are rendered, to compute a strict domain
  const priceSeriesKeys = useMemo(() => {
    const keys = new Set<string>();
    if (hasHistorical) keys.add(HISTORICAL_PRICE_KEY);
    if (hasConfidenceBand) {
      keys.add(CONFIDENCE_LOWER_KEY);
      keys.add(CONFIDENCE_UPPER_KEY);
    }
    if (medianChartKey) keys.add(medianChartKey);
    if (pricePointChartKey && pricePointChartKey !== medianChartKey) keys.add(pricePointChartKey);
    // If neither median nor pricePoint are rendered, fall back to all quantile lines
    if (!medianChartKey && !pricePointChartKey) {
      for (const def of quantileDefinitions) keys.add(def.chartKey);
    }
    return Array.from(keys);
  }, [hasHistorical, hasConfidenceBand, medianChartKey, pricePointChartKey, quantileDefinitions]);

  // Compute strict domain from the actually-rendered price series only
  const priceDomain = useMemo<[number, number] | null>(() => {
    if (timelineChartData.length === 0 || priceSeriesKeys.length === 0) return null;

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const row of timelineChartData) {
      for (const key of priceSeriesKeys) {
        const v = (row as Record<string, unknown>)[key];
        if (typeof v === 'number' && Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }

    if (min === Number.POSITIVE_INFINITY || max === Number.NEGATIVE_INFINITY) return null;

    if (min === max) {
      const pad = Math.max(1, Math.abs(min) * 0.01);
      return [min - pad, max + pad];
    }
    return [min, max];
  }, [timelineChartData, priceSeriesKeys]);

  // Use functional domain to force Recharts to respect the exact min/max on every render
  const yAxisDomainFn = useMemo(
    () =>
      [
        (dataMin: number) => (priceDomain ? priceDomain[0] : dataMin),
        (dataMax: number) => (priceDomain ? priceDomain[1] : dataMax),
      ] as unknown as [number | 'auto', number | 'auto'],
    [priceDomain]
  );

  const showSkeleton = (loading && !hasForecasts) || (historicalLoading && !hasHistorical);

  const renderTooltip = useCallback(
    (props: TooltipProps<number, string>) => (
      <ForecastChartTooltip
        {...props}
        formatPrice={(value: number) => formatCurrency(value, 'USD', locale)}
        formatProbability={(value: number) => percentageFormatter.format(value)}
        formatLabel={chartDateFormatter}
        labels={{
          confidence: t.stock.forecastView.chart.confidenceBand,
          median: t.stock.forecastView.chart.medianLine,
          pricePoint: t.stock.forecastView.chart.pricePointLine,
          probability: t.stock.forecastView.chart.probabilityLine,
          historical: t.stock.forecastView.chart.historicalLine,
        }}
        medianKey={medianChartKey}
        pricePointKey={pricePointChartKey}
      />
    ),
    [chartDateFormatter, locale, medianChartKey, percentageFormatter, pricePointChartKey, t]
  );

  if (!featureEnabled) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-primary-100)] via-[var(--color-primary-200)] to-[var(--color-primary-002)]" dir={isRtl ? 'rtl' : 'ltr'}>
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

        {showSkeleton ? (
          <ForecastSkeleton />
        ) : error ? (
          <Card className="bg-[color:var(--color-neutral-white)]/80 border border-red-200 text-red-700">
            <CardContent className="flex flex-col items-center gap-4 py-10">
              <div className="text-lg font-semibold">{t.stock.forecastView.states.error}</div>
              <div className="text-sm text-[color:var(--color-red-600)]/80">{error}</div>
              <Button variant="outline" onClick={handleRefresh}>
                {t.stock.forecastView.states.retry}
              </Button>
            </CardContent>
          </Card>
        ) : !hasForecasts ? (
          <Card className="bg-[color:var(--color-neutral-white)]/80 border border-[color:var(--color-slate-200)]/60 text-center text-slate-600">
            <CardContent className="py-10 text-lg font-semibold">
              {t.stock.forecastView.states.empty}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {summaryForecast && summaryMetadata && (
              <Card className="bg-[color:var(--color-neutral-white)]/80 border border-[color:var(--color-neutral-white)]/60 shadow-lg backdrop-blur">
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
                    <div className="rounded-lg bg-[color:var(--color-slate-50)]/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.pricePoint}</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {typeof summaryPricePoint === 'number'
                          ? formatCurrency(summaryPricePoint, 'USD', locale)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[color:var(--color-slate-50)]/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.priceP10}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {typeof summaryPriceP10 === 'number'
                          ? formatCurrency(summaryPriceP10, 'USD', locale)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[color:var(--color-slate-50)]/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.priceP90}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {typeof summaryPriceP90 === 'number'
                          ? formatCurrency(summaryPriceP90, 'USD', locale)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[color:var(--color-slate-50)]/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.probabilityUp}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {typeof summaryProbabilityUp === 'number'
                          ? percentageFormatter.format(summaryProbabilityUp)
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[color:var(--color-slate-50)]/70 p-4 shadow-sm">
                      <p className="text-sm text-slate-500">{t.stock.forecastView.summary.quality}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">
                        {typeof summaryQuality === 'number' ? qualityFormatter.format(summaryQuality) : '—'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="bg-[color:var(--color-neutral-white)]/80 border border-[color:var(--color-neutral-white)]/60 shadow">
              <CardHeader>
                <CardTitle>{t.stock.forecastView.quantilesCardTitle}</CardTitle>
                <CardDescription>{t.stock.forecastView.quantilesCardDescription}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {hasChartData ? (
                  <div className="space-y-3">
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={timelineChartData} margin={{ top: 20, right: 28, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="var(--color-primary-300)" stopOpacity={0.05} />
                            </linearGradient>
                            <linearGradient id="historicalGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-primary-800)" stopOpacity={0.18} />
                              <stop offset="100%" stopColor="var(--color-primary-800)" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="6 8" stroke="rgba(var(--color-slate-400-rgb), 0.35)" />
                          <XAxis
                            dataKey="timestamp"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(value: number) => chartDateFormatter(value)}
                            tick={{ fill: 'var(--color-slate-600)' }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={24}
                          />
                          <YAxis
                            yAxisId="price"
                            tickFormatter={(value: number) => formatCurrency(value, 'USD', locale)}
                            tick={{ fill: 'var(--color-slate-600)' }}
                            width={90}
                            axisLine={false}
                            tickLine={false}
                            domain={yAxisDomainFn}
                            allowDataOverflow
                          />
                          {hasProbabilitySeries ? (
                            <YAxis
                              yAxisId="probability"
                              orientation={isRtl ? 'left' : 'right'}
                              tickFormatter={(value: number) => percentageFormatter.format(value)}
                              tick={{ fill: 'var(--color-slate-600)' }}
                              width={70}
                              axisLine={false}
                              tickLine={false}
                              domain={[0, 1]}
                            />
                          ) : null}
                          <Tooltip
                            content={renderTooltip}
                            cursor={{ stroke: 'rgba(var(--color-slate-400-rgb), 0.45)', strokeDasharray: '4 4' }}
                          />
                          <Legend wrapperStyle={{ paddingTop: 12 }} />
                          {hasHistorical ? (
                            <Area
                              type="monotone"
                              dataKey={HISTORICAL_PRICE_KEY}
                              stroke="var(--color-primary-800)"
                              strokeWidth={2.5}
                              fill="url(#historicalGradient)"
                              yAxisId="price"
                              name={t.stock.forecastView.chart.historicalLine}
                              dot={false}
                              activeDot={{ r: 4 }}
                            />
                          ) : null}
                          {hasConfidenceBand ? (
                            <>
                              <Area
                                type="monotone"
                                dataKey={CONFIDENCE_BASE_KEY}
                              stackId="confidence"
                              stroke="none"
                              fill="transparent"
                              yAxisId="price"
                              activeDot={false}
                              isAnimationActive={false}
                            />
                            <Area
                              type="monotone"
                              dataKey={CONFIDENCE_RANGE_KEY}
                              stackId="confidence"
                              stroke="none"
                              fill="url(#confidenceGradient)"
                              yAxisId="price"
                              activeDot={false}
                              name={t.stock.forecastView.chart.confidenceBand}
                            />
                          </>
                        ) : null}
                        {medianChartKey ? (
                          <Line
                            type="monotone"
                            dataKey={medianChartKey}
                            yAxisId="price"
                            stroke="var(--color-primary-500)"
                            strokeWidth={3}
                            dot={{ r: 3, strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                            name={t.stock.forecastView.chart.medianLine}
                          />
                        ) : null}
                        {pricePointChartKey && pricePointChartKey !== medianChartKey ? (
                          <Line
                            type="monotone"
                            dataKey={pricePointChartKey}
                            yAxisId="price"
                            stroke="var(--color-primary-300)"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            dot={{ r: 2, strokeWidth: 0 }}
                            activeDot={{ r: 4 }}
                            name={t.stock.forecastView.chart.pricePointLine}
                          />
                        ) : null}
                        {!medianChartKey && !pricePointChartKey
                          ? quantileDefinitions.map((definition, index) => {
                              const color = QUANTILE_COLORS[index % QUANTILE_COLORS.length];
                              return (
                                <Line
                                  key={definition.chartKey}
                                  type="monotone"
                                  dataKey={definition.chartKey}
                                  yAxisId="price"
                                  stroke={color}
                                  strokeWidth={2}
                                  dot={{ r: 2 }}
                                  activeDot={{ r: 4 }}
                                  name={definition.label}
                                />
                              );
                            })
                          : null}
                        {hasProbabilitySeries ? (
                          <Line
                            type="monotone"
                            dataKey="probability"
                            yAxisId="probability"
                            stroke="var(--color-orange-500)"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                            activeDot={{ r: 5 }}
                            name={t.stock.forecastView.chart.probabilityLine}
                          />
                          ) : null}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-slate-500">
                      {t.stock.forecastView.chart.weightedNote}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t.stock.forecastView.noQuantiles}</p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-[color:var(--color-neutral-white)]/80 border border-[color:var(--color-neutral-white)]/60 shadow">
              <CardHeader>
                <CardTitle>{t.stock.forecastView.table.title}</CardTitle>
                <CardDescription>{t.stock.forecastView.table.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                {groupedRows.length > 0 ? (
                  <div className="space-y-6">
                    {groupedRows.map((group) => (
                      <div
                        key={group.horizon}
                        className="space-y-4 rounded-2xl border border-[color:var(--color-neutral-white)]/60 bg-[color:var(--color-neutral-white)]/70 p-4 shadow-sm ring-1 ring-[color:var(--color-neutral-black)]/5"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {t.stock.forecastView.table.horizon}
                            </p>
                            <p className="text-lg font-semibold text-slate-900">{group.horizonLabel}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                              {group.rows.length}
                            </span>
                            <span className="text-xs font-medium text-slate-500">
                              {t.stock.forecastView.table.model}
                            </span>
                          </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                          {group.rows.map((row) => {
                            const flagTokens =
                              typeof row.flags === 'string'
                                ? row.flags
                                    .split(',')
                                    .map((token) => token.trim())
                                    .filter((token) => token.length > 0)
                                : [];

                            const pricePointLabel =
                              typeof row.pricePoint === 'number'
                                ? formatCurrency(row.pricePoint, 'USD', locale)
                                : '—';
                            const priceP10Label =
                              typeof row.priceP10 === 'number'
                                ? formatCurrency(row.priceP10, 'USD', locale)
                                : '—';
                            const priceP50Label =
                              typeof row.priceP50 === 'number'
                                ? formatCurrency(row.priceP50, 'USD', locale)
                                : '—';
                            const priceP90Label =
                              typeof row.priceP90 === 'number'
                                ? formatCurrency(row.priceP90, 'USD', locale)
                                : '—';

                            const probabilityUpLabel =
                              typeof row.pUp === 'number' ? percentageFormatter.format(row.pUp) : '—';
                            const probabilityDownLabel =
                              typeof row.pDown === 'number' ? percentageFormatter.format(row.pDown) : '—';

                            return (
                              <div
                                key={row.id}
                                className="flex h-full flex-col justify-between rounded-xl border border-[color:var(--color-neutral-white)]/70 bg-[color:var(--color-neutral-white)]/80 p-4 shadow-sm"
                              >
                                <div className="space-y-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                      <p className="text-base font-semibold text-slate-900">{row.modelName}</p>
                                      {row.ticker ? (
                                        <p className="text-xs uppercase tracking-wide text-slate-400">{row.ticker}</p>
                                      ) : null}
                                      {row.dateLabel ? (
                                        <p className="text-xs text-slate-500">{row.dateLabel}</p>
                                      ) : null}
                                    </div>
                                    {typeof row.qualityScore === 'number' ? (
                                      <div className="text-right">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                          {t.stock.forecastView.table.quality}
                                        </p>
                                        <p className="text-sm font-semibold text-slate-900">
                                          {qualityFormatter.format(row.qualityScore)}
                                        </p>
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="space-y-3">
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
                                        <span>{t.stock.forecastView.table.probabilityUp}</span>
                                        <span className="text-slate-700">{probabilityUpLabel}</span>
                                      </div>
                                      {typeof row.pUp === 'number' ? (
                                        <Progress
                                          value={row.pUp * 100}
                                          className="h-2 bg-emerald-100 [&>div]:bg-emerald-500"
                                        />
                                      ) : null}
                                    </div>
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
                                        <span>{t.stock.forecastView.table.probabilityDown}</span>
                                        <span className="text-slate-700">{probabilityDownLabel}</span>
                                      </div>
                                      {typeof row.pDown === 'number' ? (
                                        <Progress
                                          value={row.pDown * 100}
                                          className="h-2 bg-rose-100 [&>div]:bg-rose-500"
                                        />
                                      ) : null}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {t.stock.forecastView.table.pricePoint}
                                      </p>
                                      <p className="font-medium text-slate-900">{pricePointLabel}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {t.stock.forecastView.table.priceP10}
                                      </p>
                                      <p className="font-medium text-slate-900">{priceP10Label}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {t.stock.forecastView.table.priceP50}
                                      </p>
                                      <p className="font-medium text-slate-900">{priceP50Label}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        {t.stock.forecastView.table.priceP90}
                                      </p>
                                      <p className="font-medium text-slate-900">{priceP90Label}</p>
                                    </div>
                                  </div>
                                </div>

                                {flagTokens.length > 0 ? (
                                  <div className="mt-4 space-y-2">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      {t.stock.forecastView.table.flags}
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {flagTokens.map((token) => (
                                        <Badge key={token} variant="outline" className="text-xs uppercase tracking-wide">
                                          {token}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
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
