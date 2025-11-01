'use client';

import { LineChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Fragment, useId, useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

interface PortfolioOverviewChartProps {
  data: PortfolioTimelinePoint[];
  summary: PortfolioSummary;
}

type TooltipValueType = number | string;

type ChartPoint = PortfolioTimelinePoint & {
  netValue: number;
  netValueIls: number;
  expectedValueUsd: number;
  expectedValueIls: number;
  forecastValueUsd: number;
  forecastValueIls: number;
  deltaUsd: number;
  deltaIls: number;
  trendState: 'loss' | 'under' | 'above';
};

type GradientStop = {
  offset: number;
  color: string;
};

const trendStateColors: Record<ChartPoint['trendState'], string> = {
  loss: 'var(--color-red-450)',
  under: 'var(--color-primary-300)',
  above: 'var(--color-green-500)',
};

const resolveTrendState = (
  netValue: number,
  forecastValue: number
): ChartPoint['trendState'] => {
  if (!Number.isFinite(netValue) || !Number.isFinite(forecastValue)) {
    return 'above';
  }

  if (netValue <= 0) {
    return 'loss';
  }

  if (netValue < forecastValue) {
    return 'under';
  }

  return 'above';
};

const ActiveNetLineDot = ({
  cx,
  cy,
  payload,
}: {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
}) => {
  if (typeof cx !== 'number' || typeof cy !== 'number') {
    return null;
  }

  const point = payload as ChartPoint | undefined;
  const color = point ? trendStateColors[point.trendState] : trendStateColors.above;

  return (
    <circle cx={cx} cy={cy} r={6.5} strokeWidth={2.5} stroke={color} fill="var(--color-neutral-white)" />
  );
};

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value: TooltipValueType; payload: ChartPoint }[];
  label?: TooltipValueType;
  formatUsd: (value: number) => string;
  formatIls: (value: number) => string;
  labelFormatter: (label: TooltipValueType) => string;
  labels: {
    at: string;
    net: string;
    forecast: string;
    change: string;
    projection: string;
    usd: string;
    ils: string;
  };
}

const formatSignedCurrency = (value: number, formatter: (value: number) => string) => {
  if (value === 0) {
    return formatter(0);
  }

  const formatted = formatter(Math.abs(value));
  return value > 0 ? `+${formatted}` : `-${formatted}`;
};

const resolveForecastGapVisuals = (
  value: number
): { text: string; badge: string; border: string; background: string; icon: JSX.Element } => {
  if (value > 0) {
    return {
      text: 'text-emerald-600',
      badge: 'bg-emerald-100 text-emerald-600 ring-1 ring-inset ring-[color:var(--color-emerald-200)]/70',
      border: 'border-overlay-emerald-100',
      background: 'from-emerald-500/10 via-emerald-400/5 to-white',
      icon: <ArrowUpRight className="h-4 w-4" />,
    };
  }

  if (value < 0) {
    return {
      text: 'text-rose-600',
      badge: 'bg-rose-100 text-rose-600 ring-1 ring-inset ring-[color:var(--color-rose-200)]/70',
      border: 'border-overlay-rose-100',
      background: 'from-rose-500/10 via-rose-400/5 to-white',
      icon: <ArrowDownRight className="h-4 w-4" />,
    };
  }

  return {
    text: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-[color:var(--color-slate-200)]/70',
    border: 'border-overlay-slate-200',
    background: 'from-slate-500/5 via-slate-400/5 to-white',
    icon: <Minus className="h-4 w-4" />,
  };
};

const ChartTooltip = ({
  active,
  payload,
  label,
  formatUsd,
  formatIls,
  labelFormatter,
  labels,
}: ChartTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload?.find((entry) => entry && entry.payload)?.payload as ChartPoint | undefined;

  if (!point) {
    return null;
  }

  const changeUsd = point.deltaUsd;
  const changeIls = point.deltaIls;
  const projectionGapUsd = point.netValue - point.expectedValueUsd;
  const projectionGapIls = point.netValueIls - point.expectedValueIls;
  const forecastUsd = point.forecastValueUsd ?? point.expectedValueUsd;
  const forecastIls = point.forecastValueIls ?? point.expectedValueIls;

  const projectionClass = projectionGapUsd >= 0 ? 'text-emerald-600' : 'text-rose-600';

  const netUsd = point.netValue;
  const netIls = point.netValueIls;

  const changeRows = [
    {
      key: 'change',
      label: labels.change,
      usd: changeUsd,
      ils: changeIls,
    },
  ];

  return (
    <div className="w-72 rounded-2xl border border-slate-200 bg-[var(--color-neutral-white)]/95 p-4 text-xs shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span>{labels.at}</span>
        <span className="text-slate-500">{labelFormatter(label ?? '')}</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-gradient-to-br from-rose-500/10 via-indigo-500/10 to-emerald-500/15 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">{labels.net}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatUsd(netUsd)}</p>
          <p className="text-[11px] text-slate-500">{formatIls(netIls)}</p>
        </div>
        <div className="rounded-xl border border-[color:var(--color-amber-200)]/70 bg-gradient-to-br from-amber-400/15 via-amber-300/10 to-white/85 p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">{labels.forecast}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatUsd(forecastUsd)}</p>
          <p className="text-[11px] text-slate-500">{formatIls(forecastIls)}</p>
          <div className="mt-2 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-overlay-amber-500">{labels.projection}</p>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-medium">{labels.usd}</span>
              <span className={`font-semibold ${projectionClass}`}>
                {formatSignedCurrency(projectionGapUsd, formatUsd)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-medium">{labels.ils}</span>
              <span className={`font-semibold ${projectionClass}`}>
                {formatSignedCurrency(projectionGapIls, formatIls)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {changeRows.map((row) => {
          const changeClass = row.usd >= 0 ? 'text-emerald-600' : 'text-rose-600';

          return (
            <div
              key={row.key}
              className="rounded-xl border border-[color:var(--color-slate-200)]/70 bg-overlay-neutral-white p-3 shadow-sm"
            >
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>{row.label}</span>
                <span className={`text-xs font-semibold ${changeClass}`}>
                  {formatSignedCurrency(row.usd, formatUsd)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span className="font-medium">{labels.ils}</span>
                <span className={`font-semibold ${changeClass}`}>
                  {formatSignedCurrency(row.ils, formatIls)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export function PortfolioOverviewChart({ data, summary }: PortfolioOverviewChartProps) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const gradientReactId = useId();
  const netLineGradientId = useMemo(
    () => `portfolio-overview-gradient-${gradientReactId.replace(/[:]/g, '-')}`,
    [gradientReactId]
  );

  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const usdFormatter = (value: number) => formatCurrency(value, 'USD', locale);
  const ilsFormatter = (value: number) => formatCurrency(value, 'ILS', locale);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [localeCode]
  );
  const tooltipDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [localeCode]
  );
  const compactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeCode, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [localeCode]
  );

  const chartPoints = useMemo<ChartPoint[]>(() => {
    if (!data.length) {
      return [];
    }

    const sortedPoints = [...data].sort((a, b) => a.timestamp - b.timestamp);

    return sortedPoints.map((point, index) => {
      const netValue =
        typeof point.netPnLUsd === 'number' ? point.netPnLUsd : point.totalPnLUsd ?? 0;
      const netValueIls =
        typeof point.netPnLIls === 'number'
          ? point.netPnLIls
          : netValue * summary.usdToIlsRate;
      const expectedValueUsd =
        typeof point.expectedNetPnLUsd === 'number'
          ? point.expectedNetPnLUsd
          : netValue;
      const expectedValueIls =
        typeof point.expectedNetPnLIls === 'number'
          ? point.expectedNetPnLIls
          : expectedValueUsd * summary.usdToIlsRate;
      const forecastValueUsd = expectedValueUsd;
      const forecastValueIls = expectedValueIls;
      const previousPoint = index > 0 ? sortedPoints[index - 1] : undefined;
      const previousNetUsd = previousPoint
        ? typeof previousPoint.netPnLUsd === 'number'
          ? previousPoint.netPnLUsd
          : previousPoint.totalPnLUsd ?? netValue
        : netValue;
      const deltaUsd = netValue - previousNetUsd;
      const deltaIls = deltaUsd * summary.usdToIlsRate;

      const forecastBaselineUsd = Number.isFinite(forecastValueUsd)
        ? forecastValueUsd
        : expectedValueUsd;
      const trendState = resolveTrendState(netValue, forecastBaselineUsd);

      return {
        ...point,
        netValue,
        netValueIls,
        expectedValueUsd,
        expectedValueIls,
        forecastValueUsd,
        forecastValueIls,
        deltaUsd,
        deltaIls,
        trendState,
      };
    });
  }, [data, summary.usdToIlsRate]);

  const netLineGradientStops = useMemo<GradientStop[]>(() => {
    if (chartPoints.length === 0) {
      return [];
    }

    if (chartPoints.length === 1) {
      const color = trendStateColors[chartPoints[0].trendState];
      return [
        { offset: 0, color },
        { offset: 100, color },
      ];
    }

    const firstPoint = chartPoints[0];
    const lastPoint = chartPoints[chartPoints.length - 1];
    const minTimestamp = firstPoint.timestamp;
    const maxTimestamp = lastPoint.timestamp;
    const range = maxTimestamp - minTimestamp || 1;

    const interpolate = (start: number, end: number, alpha: number) => start + (end - start) * alpha;
    const clampOffset = (timestamp: number) => {
      const normalized = ((timestamp - minTimestamp) / range) * 100;
      const clamped = Math.max(0, Math.min(100, normalized));
      const precise = Number.isFinite(clamped) ? Number(clamped.toFixed(3)) : 0;
      return precise;
    };

    const classifyAt = (prev: ChartPoint, current: ChartPoint, alpha: number) => {
      const boundedAlpha = Math.max(0, Math.min(1, alpha));
      const netValue = interpolate(prev.netValue, current.netValue, boundedAlpha);
      const forecastValue = interpolate(prev.forecastValueUsd, current.forecastValueUsd, boundedAlpha);
      return resolveTrendState(netValue, forecastValue);
    };

    const appendStop = (stops: GradientStop[], timestamp: number, color: string) => {
      const offset = clampOffset(timestamp);
      const lastStop = stops[stops.length - 1];

      if (lastStop && lastStop.offset === offset) {
        if (lastStop.color !== color) {
          stops.push({ offset, color });
        }
        return;
      }

      stops.push({ offset, color });
    };

    const stops: GradientStop[] = [];
    let activeColor = trendStateColors[firstPoint.trendState];
    appendStop(stops, minTimestamp, activeColor);

    for (let index = 1; index < chartPoints.length; index += 1) {
      const prev = chartPoints[index - 1];
      const current = chartPoints[index];
      const segmentDuration = current.timestamp - prev.timestamp;
      const candidateEvents: number[] = [];

      const netDelta = current.netValue - prev.netValue;
      if (netDelta !== 0) {
        const zeroAlpha = (0 - prev.netValue) / netDelta;
        if (zeroAlpha > 0 && zeroAlpha < 1) {
          candidateEvents.push(zeroAlpha);
        }
      }

      const forecastDelta =
        current.netValue - current.forecastValueUsd - (prev.netValue - prev.forecastValueUsd);
      if (forecastDelta !== 0) {
        const prevGap = prev.netValue - prev.forecastValueUsd;
        const forecastAlpha = -prevGap / forecastDelta;
        if (forecastAlpha > 0 && forecastAlpha < 1) {
          candidateEvents.push(forecastAlpha);
        }
      }

      candidateEvents
        .sort((a, b) => a - b)
        .forEach((eventAlpha) => {
          const beforeState = classifyAt(prev, current, Math.max(eventAlpha - 1e-4, 0));
          const afterState = classifyAt(prev, current, Math.min(eventAlpha + 1e-4, 1));

          if (beforeState === afterState) {
            return;
          }

          const eventTimestamp = prev.timestamp + segmentDuration * eventAlpha;
          appendStop(stops, eventTimestamp, activeColor);

          activeColor = trendStateColors[afterState];
          appendStop(stops, eventTimestamp, activeColor);
        });

      const currentColor = trendStateColors[current.trendState];
      if (currentColor !== activeColor) {
        appendStop(stops, current.timestamp, activeColor);
        activeColor = currentColor;
        appendStop(stops, current.timestamp, activeColor);
      }
    }

    appendStop(stops, maxTimestamp, activeColor);

    if (stops[0]?.offset !== 0) {
      stops.unshift({ offset: 0, color: stops[0]?.color ?? activeColor });
    }

    if (stops[stops.length - 1]?.offset !== 100) {
      stops.push({ offset: 100, color: stops[stops.length - 1]?.color ?? activeColor });
    }

    return stops;
  }, [chartPoints]);

  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (!chartPoints.length) {
      return undefined;
    }

    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    chartPoints.forEach((point) => {
      minValue = Math.min(
        minValue,
        point.netValue,
        point.expectedValueUsd,
        point.forecastValueUsd,
        point.totalPnLUsd
      );
      maxValue = Math.max(
        maxValue,
        point.netValue,
        point.expectedValueUsd,
        point.forecastValueUsd,
        point.totalPnLUsd
      );
    });

    minValue = Math.min(minValue, 0);
    maxValue = Math.max(maxValue, 0);

    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return undefined;
    }

    if (minValue === maxValue) {
      const pad = Math.max(Math.abs(minValue) * 0.25, 1);
      return [minValue - pad, maxValue + pad];
    }

    const pad = (maxValue - minValue) * 0.12;
    return [minValue - pad, maxValue + pad];
  }, [chartPoints]);

  const trendPoint = chartPoints[chartPoints.length - 1];
  const openPnLUsd = summary.totalCurrentPnLUsd - summary.totalRealizedProfitUsd;
  const openPnLIls = summary.totalCurrentPnLIls - summary.totalRealizedProfitIls;
  const realizedPnLUsd = summary.totalRealizedProfitUsd;
  const realizedPnLIls = summary.totalRealizedProfitIls;
  const taxesUsd = summary.totalTaxesPaidUsd;
  const taxesIls = summary.totalTaxesPaidIls;
  const netPnLUsd = summary.totalNetPnLUsd;
  const netPnLIls = summary.totalNetPnLIls;
  const projectedPnLUsd = summary.totalProjectedPnLUsd;
  const projectedPnLIls = summary.totalProjectedPnLIls;
  const netForecastGapUsd = netPnLUsd - projectedPnLUsd;
  const netForecastGapIls = netPnLIls - projectedPnLIls;
  const forecastGapVisuals = resolveForecastGapVisuals(netForecastGapUsd);

  const { bestPoint, worstPoint } = useMemo(() => {
    if (!chartPoints.length) {
      return { bestPoint: null, worstPoint: null };
    }

    return chartPoints.reduce(
      (acc, point) => {
        if (!acc.bestPoint || point.netValue > acc.bestPoint.netValue) {
          acc.bestPoint = point;
        }

        if (!acc.worstPoint || point.netValue < acc.worstPoint.netValue) {
          acc.worstPoint = point;
        }

        return acc;
      },
      { bestPoint: null as ChartPoint | null, worstPoint: null as ChartPoint | null }
    );
  }, [chartPoints]);

  const trendTone = trendPoint?.netValue ?? netPnLUsd;
  const toneClass = trendTone > 0 ? 'text-emerald-600' : trendTone < 0 ? 'text-rose-600' : 'text-slate-600';
  const badgeClass =
    trendTone > 0
      ? 'bg-emerald-50 text-emerald-600'
      : trendTone < 0
      ? 'bg-rose-50 text-rose-600'
      : 'bg-slate-100 text-slate-600';

  const formattedBestDate = bestPoint ? dateFormatter.format(new Date(bestPoint.timestamp)) : '—';
  const formattedWorstDate = worstPoint ? dateFormatter.format(new Date(worstPoint.timestamp)) : '—';

  const formattedBestValueUsd = bestPoint ? usdFormatter(bestPoint.netValue) : '—';
  const formattedBestValueIls = bestPoint ? ilsFormatter(bestPoint.netValueIls) : '—';
  const formattedWorstValueUsd = worstPoint ? usdFormatter(worstPoint.netValue) : '—';
  const formattedWorstValueIls = worstPoint ? ilsFormatter(worstPoint.netValueIls) : '—';

  return (
    <Card className="relative z-[11] border-[color:var(--color-neutral-white)]/50 bg-gradient-to-br from-white/98 via-white/92 to-slate-100/70 shadow-xl glass-blur-sm">
      <CardHeader className="space-y-2 border-b border-[color:var(--color-neutral-white)]/60 bg-[var(--color-neutral-white)]/70">
        <CardTitle className="text-lg font-semibold text-slate-900">
          {t.dashboard.portfolioOverviewTitle}
        </CardTitle>
        <p className="text-sm text-slate-500">{t.dashboard.portfolioOverviewDescription}</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6 pt-6">
          <div className="rounded-3xl border border-overlay-slate-200 bg-[var(--color-neutral-white)]/85 p-6 shadow-lg">
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              <div className="space-y-4">
                <div className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                  <span className="h-2.5 w-2.5 rounded-full bg-current" />
                  {toneClass === 'text-emerald-600'
                    ? t.dashboard.positiveTrend
                    : toneClass === 'text-rose-600'
                    ? t.dashboard.negativeTrend
                    : t.dashboard.neutralTrend}
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-500">{t.dashboard.netPnL}</p>
                  <p className={`text-3xl font-semibold ${toneClass}`}>{usdFormatter(netPnLUsd)}</p>
                  <p className="text-xs text-slate-500">{ilsFormatter(netPnLIls)}</p>
                  <div className={`rounded-2xl border ${forecastGapVisuals.border} bg-gradient-to-br ${forecastGapVisuals.background} p-4 shadow-sm`}>
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${forecastGapVisuals.badge}`}
                        aria-hidden="true"
                      >
                        {forecastGapVisuals.icon}
                      </span>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {t.dashboard.forecastGap}
                        </p>
                        <p className={`text-lg font-semibold ${forecastGapVisuals.text}`}>
                          {formatSignedCurrency(netForecastGapUsd, usdFormatter)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {t.dashboard.forecastGapSecondary(formatSignedCurrency(netForecastGapIls, ilsFormatter))}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{t.dashboard.currentPnL}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{usdFormatter(openPnLUsd)}</p>
                    <p className="text-xs text-slate-500">{ilsFormatter(openPnLIls)}</p>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{t.dashboard.realizedPnL}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{usdFormatter(realizedPnLUsd)}</p>
                    <p className="text-xs text-slate-500">{ilsFormatter(realizedPnLIls)}</p>
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-500/10 via-rose-400/5 to-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">{t.dashboard.taxesPaid}</p>
                    <p className="mt-2 text-lg font-semibold text-rose-600">{usdFormatter(taxesUsd * -1)}</p>
                    <p className="text-xs text-rose-500">{ilsFormatter(taxesIls * -1)}</p>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-sky-500/10 via-sky-400/5 to-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">{t.dashboard.projectedPnL}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{usdFormatter(projectedPnLUsd)}</p>
                    <p className="text-xs text-slate-500">{ilsFormatter(projectedPnLIls)}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-500/10 via-emerald-400/5 to-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">{t.dashboard.bestPnL}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{formattedBestValueUsd}</p>
                    <p className="text-xs text-slate-500">{formattedBestValueIls}</p>
                    <p className="text-xs text-slate-400">{formattedBestDate}</p>
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-rose-500/10 via-rose-400/5 to-white p-4 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">{t.dashboard.worstPnL}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{formattedWorstValueUsd}</p>
                    <p className="text-xs text-slate-500">{formattedWorstValueIls}</p>
                    <p className="text-xs text-slate-400">{formattedWorstDate}</p>
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-r from-indigo-500/10 via-white to-emerald-500/10 p-4 text-sm text-slate-600 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {t.dashboard.portfolioOverviewFootnote}
                  </p>
                  <p className="mt-2 leading-relaxed">
                    {t.dashboard.portfolioOverviewSummary(
                      usdFormatter(openPnLUsd),
                      usdFormatter(realizedPnLUsd),
                      usdFormatter(Math.abs(taxesUsd))
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[color:var(--color-slate-200)]/70 bg-overlay-neutral-white shadow-inner">
            <div className="flex h-full flex-col gap-6 p-6">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-overlay-neutral-white px-4 py-3 text-[12px] font-semibold text-slate-600 shadow-sm ring-1 ring-[color:var(--color-slate-200)]/70 glass-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="block h-1.5 w-6 rounded-full bg-rose-500" />
                  <span>{t.dashboard.timelineLegendActualLoss}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="block h-1.5 w-6 rounded-full bg-sky-500" />
                  <span>{t.dashboard.timelineLegendActualUnder}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="block h-1.5 w-6 rounded-full bg-emerald-500" />
                  <span>{t.dashboard.timelineLegendActualAbove}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="block h-[6px] w-6 rounded-full border-2 border-dashed border-overlay-amber-500" />
                  <span>{t.dashboard.timelineLegendForecast}</span>
                </div>
              </div>
              <div className="relative h-[22rem] w-full lg:h-[24rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartPoints} margin={{ top: 12, right: -50, left: 0, bottom: 12 }}>
                  <defs>
                    <linearGradient id={netLineGradientId} x1="0" y1="0" x2="1" y2="0">
                      {netLineGradientStops.length === 0 ? (
                        <stop offset="0%" stopColor={trendStateColors.above} />
                      ) : (
                        netLineGradientStops.map((stop, index) => {
                          const offset = `${Number.isFinite(stop.offset) ? stop.offset.toFixed(3) : '0'}%`;

                          if (index === 0) {
                            return (
                              <stop
                                key={`net-line-stop-${index}-start`}
                                offset={offset}
                                stopColor={stop.color}
                              />
                            );
                          }

                          const previousColor = netLineGradientStops[index - 1]?.color ?? stop.color;

                          return (
                            <Fragment key={`net-line-stop-${index}`}>
                              <stop offset={offset} stopColor={previousColor} />
                              <stop offset={offset} stopColor={stop.color} />
                            </Fragment>
                          );
                        })
                      )}
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 6" stroke="hsl(var(--muted-foreground) / 0.22)" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    scale="time"
                    tickFormatter={(value: number) => dateFormatter.format(new Date(value))}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={16}
                    minTickGap={28}
                    tick={{ fill: 'var(--color-slate-600)', fontSize: 12, fontWeight: 600 }}
                  />
                  <YAxis
                    orientation="right"
                    tickFormatter={(value) => compactFormatter.format(value)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--color-slate-600)', fontSize: 12, fontWeight: 600 }}
                    {...(yDomain ? { domain: yDomain } : {})}
                  />
                  <Tooltip
                    wrapperStyle={{ zIndex: 40 }}
                    cursor={{
                      strokeDasharray: '4 6',
                      stroke: 'color-mix(in srgb, var(--color-indigo-600) 35%, transparent)',
                      strokeWidth: 1.25,
                    }}
                    content={
                      <ChartTooltip
                        formatUsd={usdFormatter}
                        formatIls={ilsFormatter}
                        labelFormatter={(value) => tooltipDateFormatter.format(new Date(Number(value)))}
                        labels={{
                          at: t.dashboard.timelineTooltipMoment,
                          net: t.dashboard.netPnL,
                          forecast: t.dashboard.timelineTooltipForecast,
                          change: t.dashboard.timelineTooltipChange,
                          projection: t.dashboard.timelineTooltipProjection,
                          usd: t.dashboard.usdLabel,
                          ils: t.dashboard.ilsLabel,
                        }}
                      />
                    }
                  />
                  <ReferenceLine
                    y={0}
                    stroke="color-mix(in srgb, var(--color-indigo-600) 45%, transparent)"
                    strokeDasharray="1 6"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="netValue"
                    stroke={`url(#${netLineGradientId})`}
                    strokeWidth={3.5}
                    dot={false}
                    activeDot={<ActiveNetLineDot />}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="forecastValueUsd"
                    stroke="var(--color-amber-500)"
                    strokeWidth={2.5}
                    strokeDasharray="6 6"
                    dot={false}
                    activeDot={{ r: 5.5, strokeWidth: 2, stroke: 'var(--color-orange-500)', fill: 'var(--color-neutral-white)' }}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    isAnimationActive={false}
                  />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
