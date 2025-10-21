'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMemo } from 'react';

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

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value: TooltipValueType; payload: PortfolioTimelinePoint }[];
  label?: TooltipValueType;
  formatUsd: (value: number) => string;
  formatIls: (value: number) => string;
  labelFormatter: (label: TooltipValueType) => string;
  summary: PortfolioSummary;
  labels: {
    net: string;
    open: string;
    realized: string;
    taxes: string;
    usd: string;
    ils: string;
  };
}

const tonePalette = {
  negative: { color: '#F43F5E', strokeOpacity: 0.95, fillOpacity: 0.28 },
  underperforming: { color: '#2563EB', strokeOpacity: 0.92, fillOpacity: 0.24 },
  positive: { color: '#10B981', strokeOpacity: 0.95, fillOpacity: 0.22 },
} as const;

type ToneKey = keyof typeof tonePalette;

type ChartDataPoint = PortfolioTimelinePoint & { growthBenchmarkUsd?: number };

const getPointTone = (point: ChartDataPoint): ToneKey => {
  const netValue = point.netPnLUsd ?? point.totalPnLUsd ?? 0;
  if (netValue < 0) {
    return 'negative';
  }

  const benchmarkValue =
    typeof point.growthBenchmarkUsd === 'number'
      ? point.growthBenchmarkUsd
      : point.expectedNetPnLUsd;

  if (typeof benchmarkValue === 'number' && netValue < benchmarkValue) {
    return 'underperforming';
  }

  return 'positive';
};

const ChartTooltip = ({
  active,
  payload,
  label,
  formatUsd,
  formatIls,
  labelFormatter,
  summary,
  labels,
}: ChartTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  const openUsd = point.totalPnLUsd ?? 0;
  const openIls = point.totalPnLIls ?? openUsd * summary.usdToIlsRate;
  const netUsd = point.netPnLUsd ?? openUsd + summary.totalRealizedProfitUsd - summary.totalTaxesPaidUsd;
  const netIls = point.netPnLIls ?? openIls + summary.totalRealizedProfitIls - summary.totalTaxesPaidIls;
  const realizedUsd = summary.totalRealizedProfitUsd;
  const realizedIls = summary.totalRealizedProfitIls;
  const taxesUsd = summary.totalTaxesPaidUsd;
  const taxesIls = summary.totalTaxesPaidIls;

  const rows = [
    {
      key: 'net',
      label: labels.net,
      usd: netUsd,
      ils: netIls,
      accent: 'from-blue-500 to-blue-400',
    },
    {
      key: 'open',
      label: labels.open,
      usd: openUsd,
      ils: openIls,
      accent: 'from-slate-500 to-slate-400',
    },
    {
      key: 'realized',
      label: labels.realized,
      usd: realizedUsd,
      ils: realizedIls,
      accent: 'from-emerald-500 to-emerald-400',
    },
    {
      key: 'taxes',
      label: labels.taxes,
      usd: taxesUsd * -1,
      ils: taxesIls * -1,
      accent: 'from-rose-500 to-rose-400',
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm shadow-xl backdrop-blur-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labelFormatter(label ?? '')}</p>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span className="inline-flex h-2.5 w-2.5 items-center justify-center">
                <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-br ${row.accent}`} />
              </span>
              {row.label}
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="font-medium text-slate-500">{labels.usd}</span>
              <span className="font-semibold text-slate-900">{formatUsd(row.usd)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-medium">{labels.ils}</span>
              <span className="font-semibold text-slate-700">{formatIls(row.ils)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export function PortfolioOverviewChart({ data, summary }: PortfolioOverviewChartProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);

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
  const compactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeCode, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [localeCode]
  );

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!data.length) {
      return [];
    }

    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const rawGrowthRate = Number.isFinite(settings.annualGrowthRate)
      ? Number(settings.annualGrowthRate)
      : 0;
    const growthBase = Math.max(1 + rawGrowthRate, 0);

    const firstPoint = sortedData[0];
    const initialExpectedNet =
      typeof firstPoint.expectedNetPnLUsd === 'number'
        ? firstPoint.expectedNetPnLUsd
        : firstPoint.netPnLUsd ?? firstPoint.totalPnLUsd ?? 0;
    const initialCostBasis = firstPoint.costBasisUsd ?? 0;
    const initialRealizedComponent =
      (firstPoint.netPnLUsd ?? 0) - (firstPoint.totalPnLUsd ?? 0);
    const initialModelNet = (firstPoint.totalPnLUsd ?? 0) + initialRealizedComponent;
    const baselineOffset = initialExpectedNet - initialModelNet;

    let benchmarkEquity =
      (firstPoint.marketValueUsd ?? initialCostBasis) + initialRealizedComponent;
    let previousTimestamp = firstPoint.timestamp;
    let previousCostBasis = initialCostBasis;
    let previousRealizedComponent = initialRealizedComponent;

    return sortedData.map((point, index) => {
      if (index === 0) {
        return { ...point, growthBenchmarkUsd: initialExpectedNet };
      }

      const deltaYears = Math.max((point.timestamp - previousTimestamp) / msPerYear, 0);
      const growthFactor = Math.pow(growthBase, deltaYears);

      benchmarkEquity *= growthFactor;

      const costBasis = point.costBasisUsd ?? 0;
      const realizedComponent = (point.netPnLUsd ?? 0) - (point.totalPnLUsd ?? 0);
      const costContribution = costBasis - previousCostBasis;
      const realizedContribution = realizedComponent - previousRealizedComponent;

      benchmarkEquity += costContribution + realizedContribution;

      const expectedShareValue = benchmarkEquity - realizedComponent;
      const expectedNet = expectedShareValue - costBasis + realizedComponent + baselineOffset;

      previousTimestamp = point.timestamp;
      previousCostBasis = costBasis;
      previousRealizedComponent = realizedComponent;
      return { ...point, growthBenchmarkUsd: expectedNet };
    });
  }, [data, settings.annualGrowthRate]);

  const trendPoint = chartData[chartData.length - 1];
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

  const colorStops = useMemo<{ offset: number; tone: ToneKey }[]>(() => {
    if (!chartData.length) {
      return [
        { offset: 0, tone: 'positive' as ToneKey },
        { offset: 100, tone: 'positive' as ToneKey },
      ];
    }

    if (chartData.length === 1) {
      const singleTone = getPointTone(chartData[0]);
      return [
        { offset: 0, tone: singleTone },
        { offset: 100, tone: singleTone },
      ];
    }

    return chartData.map((point, index) => ({
      offset: (index / (chartData.length - 1)) * 100,
      tone: getPointTone(point),
    }));
  }, [chartData]);

  const strokeGradientStops = useMemo(() => {
    const stops: { offset: string; color: string; opacity: number }[] = [];

    colorStops.forEach((stop, index) => {
      const palette = tonePalette[stop.tone];
      const offset = `${stop.offset}%`;

      if (index > 0 && colorStops[index - 1].tone !== stop.tone) {
        const previousPalette = tonePalette[colorStops[index - 1].tone];
        stops.push({
          offset,
          color: previousPalette.color,
          opacity: previousPalette.strokeOpacity,
        });
      }

      stops.push({
        offset,
        color: palette.color,
        opacity: palette.strokeOpacity,
      });
    });

    return stops;
  }, [colorStops]);

  const fillGradientStops = useMemo(() => {
    const stops: { offset: string; color: string; opacity: number }[] = [];

    colorStops.forEach((stop, index) => {
      const palette = tonePalette[stop.tone];
      const offset = `${stop.offset}%`;

      if (index > 0 && colorStops[index - 1].tone !== stop.tone) {
        const previousPalette = tonePalette[colorStops[index - 1].tone];
        stops.push({
          offset,
          color: previousPalette.color,
          opacity: previousPalette.fillOpacity,
        });
      }

      stops.push({
        offset,
        color: palette.color,
        opacity: palette.fillOpacity,
      });
    });

    return stops;
  }, [colorStops]);

  const { bestPoint, worstPoint } = useMemo(() => {
    if (!chartData.length) {
      return { bestPoint: null, worstPoint: null };
    }

    return chartData.reduce(
      (acc, point) => {
        const pointValue = point.netPnLUsd ?? point.totalPnLUsd;
        const bestValue = acc.bestPoint ? acc.bestPoint.netPnLUsd ?? acc.bestPoint.totalPnLUsd : undefined;
        if (!acc.bestPoint || pointValue > (bestValue ?? Number.NEGATIVE_INFINITY)) {
          acc.bestPoint = point;
        }

        const worstValue = acc.worstPoint ? acc.worstPoint.netPnLUsd ?? acc.worstPoint.totalPnLUsd : undefined;
        if (!acc.worstPoint || pointValue < (worstValue ?? Number.POSITIVE_INFINITY)) {
          acc.worstPoint = point;
        }

        return acc;
      },
      { bestPoint: null as PortfolioTimelinePoint | null, worstPoint: null as PortfolioTimelinePoint | null }
    );
  }, [chartData]);

  const trendTone = trendPoint?.netPnLUsd ?? netPnLUsd;
  const toneClass = trendTone > 0 ? 'text-emerald-600' : trendTone < 0 ? 'text-rose-600' : 'text-slate-600';
  const badgeClass = trendTone > 0
    ? 'bg-emerald-50 text-emerald-600'
    : trendTone < 0
      ? 'bg-rose-50 text-rose-600'
      : 'bg-slate-100 text-slate-600';

  const formattedBestDate = bestPoint ? dateFormatter.format(new Date(bestPoint.timestamp)) : '—';
  const formattedWorstDate = worstPoint ? dateFormatter.format(new Date(worstPoint.timestamp)) : '—';

  const formattedBestValueUsd = bestPoint ? usdFormatter(bestPoint.netPnLUsd ?? bestPoint.totalPnLUsd) : '—';
  const formattedBestValueIls = bestPoint
    ? ilsFormatter(bestPoint.netPnLIls ?? bestPoint.totalPnLIls ?? (bestPoint.totalPnLUsd * summary.usdToIlsRate))
    : '—';
  const formattedWorstValueUsd = worstPoint ? usdFormatter(worstPoint.netPnLUsd ?? worstPoint.totalPnLUsd) : '—';
  const formattedWorstValueIls = worstPoint
    ? ilsFormatter(worstPoint.netPnLIls ?? worstPoint.totalPnLIls ?? (worstPoint.totalPnLUsd * summary.usdToIlsRate))
    : '—';

  return (
    <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/85 to-white/60 shadow-2xl">
      <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/60">
        <CardTitle className="text-lg font-semibold text-slate-900">
          {t.dashboard.portfolioOverviewTitle}
        </CardTitle>
        <p className="text-sm text-slate-500">{t.dashboard.portfolioOverviewDescription}</p>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="portfolioPnlStroke" x1="0" y1="0" x2="1" y2="0">
                      {strokeGradientStops.map((stop, index) => (
                        <stop
                          key={`stroke-stop-${index}`}
                          offset={stop.offset}
                          stopColor={stop.color}
                          stopOpacity={stop.opacity}
                        />
                      ))}
                    </linearGradient>
                    <linearGradient id="portfolioPnlFill" x1="0" y1="0" x2="1" y2="0">
                      {fillGradientStops.map((stop, index) => (
                        <stop
                          key={`fill-stop-${index}`}
                          offset={stop.offset}
                          stopColor={stop.color}
                          stopOpacity={stop.opacity}
                        />
                      ))}
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.25)" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value: number) => dateFormatter.format(new Date(value))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#475569', fontSize: 12 }}
                  />
                  <YAxis
                    orientation="right"
                    tickFormatter={(value) => compactFormatter.format(value)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#475569', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '4 4', stroke: 'rgba(37, 99, 235, 0.3)' }}
                    content={
                      <ChartTooltip
                        formatUsd={usdFormatter}
                        formatIls={ilsFormatter}
                        labelFormatter={(value) => dateFormatter.format(new Date(Number(value)))}
                        summary={summary}
                        labels={{
                          net: t.dashboard.netPnL,
                          open: t.dashboard.currentPnL,
                          realized: t.dashboard.realizedPnL,
                          taxes: t.dashboard.taxesPaid,
                          usd: t.dashboard.usdLabel,
                          ils: t.dashboard.ilsLabel,
                        }}
                      />
                    }
                  />
                  <ReferenceLine y={0} stroke="rgba(100, 116, 139, 0.7)" strokeDasharray="6 6" />
                  <Line
                    type="monotone"
                    dataKey="growthBenchmarkUsd"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="netPnLUsd"
                    stroke="url(#portfolioPnlStroke)"
                    strokeWidth={2.5}
                    fill="url(#portfolioPnlFill)"
                    fillOpacity={1}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-white/70 bg-white/80 p-5 shadow-inner lg:max-w-xs">
            <div className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
              <span className="h-2.5 w-2.5 rounded-full bg-current" />
              {toneClass === 'text-emerald-600'
                ? t.dashboard.positiveTrend
                : toneClass === 'text-rose-600'
                  ? t.dashboard.negativeTrend
                  : t.dashboard.neutralTrend}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500">{t.dashboard.netPnL}</p>
              <p className={`text-3xl font-semibold ${toneClass}`}>{usdFormatter(netPnLUsd)}</p>
              <p className="text-xs text-slate-500">{ilsFormatter(netPnLIls)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.currentPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{usdFormatter(openPnLUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(openPnLIls)}</p>
              </div>
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.realizedPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{usdFormatter(realizedPnLUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(realizedPnLIls)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl border border-rose-100 bg-rose-50/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">{t.dashboard.taxesPaid}</p>
                <p className="mt-1 font-semibold text-rose-600">{usdFormatter(taxesUsd * -1)}</p>
                <p className="text-xs text-rose-500">{ilsFormatter(taxesIls * -1)}</p>
              </div>
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.projectedPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{usdFormatter(projectedPnLUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(projectedPnLIls)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {t.dashboard.bestPnL}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{formattedBestValueUsd}</p>
                <p className="text-xs text-slate-500">{formattedBestValueIls}</p>
                <p className="text-xs text-slate-400">{formattedBestDate}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                  {t.dashboard.worstPnL}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{formattedWorstValueUsd}</p>
                <p className="text-xs text-slate-500">{formattedWorstValueIls}</p>
                <p className="text-xs text-slate-400">{formattedWorstDate}</p>
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-blue-50/90 via-white/90 to-blue-100/40 p-4 text-sm text-slate-600">
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
      </CardContent>
    </Card>
  );
}
