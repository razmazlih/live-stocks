'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
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

type ChartPoint = PortfolioTimelinePoint & {
  netValue: number;
  netValueIls: number;
  openValueUsd: number;
  openValueIls: number;
  expectedValueUsd: number;
  expectedValueIls: number;
  forecastValueUsd: number;
  forecastValueIls: number;
  deltaUsd: number;
  deltaIls: number;
};

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value: TooltipValueType; payload: ChartPoint }[];
  label?: TooltipValueType;
  formatUsd: (value: number) => string;
  formatIls: (value: number) => string;
  labelFormatter: (label: TooltipValueType) => string;
  summary: PortfolioSummary;
  labels: {
    at: string;
    net: string;
    forecast: string;
    open: string;
    realized: string;
    taxes: string;
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

  const changeUsd = point.deltaUsd;
  const changeIls = point.deltaIls;
  const projectionGapUsd = point.netValue - point.expectedValueUsd;
  const projectionGapIls = point.netValueIls - point.expectedValueIls;
  const forecastUsd = point.forecastValueUsd ?? point.expectedValueUsd;
  const forecastIls = point.forecastValueIls ?? point.expectedValueIls;

  const projectionClass = projectionGapUsd >= 0 ? 'text-emerald-600' : 'text-rose-600';

  const netUsd = point.netValue;
  const netIls = point.netValueIls;
  const openUsd = point.openValueUsd;
  const openIls = point.openValueIls;
  const realizedUsd = summary.totalRealizedProfitUsd;
  const realizedIls = summary.totalRealizedProfitIls;
  const taxesUsd = summary.totalTaxesPaidUsd;
  const taxesIls = summary.totalTaxesPaidIls;

  const changeRows = [
    {
      key: 'change',
      label: labels.change,
      usd: changeUsd,
      ils: changeIls,
    },
  ];

  const breakdownRows = [
    {
      key: 'open',
      label: labels.open,
      usd: openUsd,
      ils: openIls,
      accent: 'from-slate-500/15 via-slate-400/10 to-slate-300/5',
    },
    {
      key: 'realized',
      label: labels.realized,
      usd: realizedUsd,
      ils: realizedIls,
      accent: 'from-emerald-500/15 via-emerald-400/10 to-emerald-300/5',
    },
    {
      key: 'taxes',
      label: labels.taxes,
      usd: taxesUsd * -1,
      ils: taxesIls * -1,
      accent: 'from-rose-500/15 via-rose-400/10 to-rose-300/5',
    },
  ];

  return (
    <div className="w-72 rounded-2xl border border-slate-200 bg-white/95 p-4 text-xs shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <span>{labels.at}</span>
        <span className="text-slate-500">{labelFormatter(label ?? '')}</span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-gradient-to-br from-indigo-500/10 via-sky-400/10 to-emerald-500/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">{labels.net}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatUsd(netUsd)}</p>
          <p className="text-[11px] text-slate-500">{formatIls(netIls)}</p>
        </div>
        <div className="rounded-xl border border-slate-200/70 bg-white/85 p-3 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">{labels.forecast}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{formatUsd(forecastUsd)}</p>
          <p className="text-[11px] text-slate-500">{formatIls(forecastIls)}</p>
          <div className="mt-2 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{labels.projection}</p>
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
              className="rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-sm"
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

      <div className="mt-4 grid gap-3 text-[13px] text-slate-600">
        {breakdownRows.map((row) => (
          <div key={row.key} className={`rounded-xl bg-gradient-to-br ${row.accent} p-3`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{row.label}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="font-medium text-slate-500">{labels.usd}</span>
              <span className="text-sm font-semibold text-slate-900">{formatUsd(row.usd)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
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
  const { locale } = useApp();
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

    return data.map((point, index) => {
      const netValue =
        typeof point.netPnLUsd === 'number' ? point.netPnLUsd : point.totalPnLUsd ?? 0;
      const netValueIls =
        typeof point.netPnLIls === 'number'
          ? point.netPnLIls
          : netValue * summary.usdToIlsRate;
      const openValueUsd = typeof point.totalPnLUsd === 'number' ? point.totalPnLUsd : netValue;
      const openValueIls =
        typeof point.totalPnLIls === 'number'
          ? point.totalPnLIls
          : openValueUsd * summary.usdToIlsRate;
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

      const previousPoint = index > 0 ? data[index - 1] : undefined;
      const previousNetUsd = previousPoint
        ? typeof previousPoint.netPnLUsd === 'number'
          ? previousPoint.netPnLUsd
          : previousPoint.totalPnLUsd ?? netValue
        : netValue;
      const deltaUsd = netValue - previousNetUsd;
      const deltaIls = deltaUsd * summary.usdToIlsRate;

      return {
        ...point,
        netValue,
        netValueIls,
        openValueUsd,
        openValueIls,
        expectedValueUsd,
        expectedValueIls,
        forecastValueUsd,
        forecastValueIls,
        deltaUsd,
        deltaIls,
      };
    });
  }, [data, summary.usdToIlsRate]);

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
        point.openValueUsd
      );
      maxValue = Math.max(
        maxValue,
        point.netValue,
        point.expectedValueUsd,
        point.forecastValueUsd,
        point.openValueUsd
      );
    });

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
    <Card className="overflow-hidden border-white/50 bg-gradient-to-br from-white/98 via-white/92 to-slate-100/70 shadow-xl backdrop-blur-sm">
      <CardHeader className="space-y-2 border-b border-white/60 bg-white/70">
        <CardTitle className="text-lg font-semibold text-slate-900">
          {t.dashboard.portfolioOverviewTitle}
        </CardTitle>
        <p className="text-sm text-slate-500">{t.dashboard.portfolioOverviewDescription}</p>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1">
            <div className="relative h-[22rem] overflow-hidden rounded-3xl border border-slate-200/70 bg-white/80 shadow-inner">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/60 via-sky-50/30 to-emerald-50/60" />
              <div className="relative h-full w-full p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartPoints} margin={{ top: 12, right: 28, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="portfolioNetStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#6366F1" />
                        <stop offset="50%" stopColor="#0EA5E9" />
                        <stop offset="100%" stopColor="#10B981" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value: number) => dateFormatter.format(new Date(value))}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={12}
                      minTickGap={24}
                      tick={{ fill: '#334155', fontSize: 12, fontWeight: 500 }}
                    />
                    <YAxis
                      orientation="right"
                      tickFormatter={(value) => compactFormatter.format(value)}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#334155', fontSize: 12, fontWeight: 500 }}
                      {...(yDomain ? { domain: yDomain } : {})}
                    />
                    <Tooltip
                      wrapperStyle={{ zIndex: 40 }}
                      cursor={{ strokeDasharray: '4 4', stroke: 'rgba(59, 130, 246, 0.35)', strokeWidth: 1 }}
                      content={
                        <ChartTooltip
                          formatUsd={usdFormatter}
                          formatIls={ilsFormatter}
                          labelFormatter={(value) => tooltipDateFormatter.format(new Date(Number(value)))}
                          summary={summary}
                          labels={{
                            at: t.dashboard.timelineTooltipMoment,
                            net: t.dashboard.netPnL,
                            forecast: t.dashboard.timelineTooltipForecast,
                            open: t.dashboard.currentPnL,
                            realized: t.dashboard.realizedPnL,
                            taxes: t.dashboard.taxesPaid,
                            change: t.dashboard.timelineTooltipChange,
                            projection: t.dashboard.timelineTooltipProjection,
                            usd: t.dashboard.usdLabel,
                            ils: t.dashboard.ilsLabel,
                          }}
                        />
                      }
                    />
                    <ReferenceLine y={0} stroke="rgba(100, 116, 139, 0.65)" strokeDasharray="6 6" />
                    <Line
                      type="monotone"
                      dataKey="netValue"
                      stroke="url(#portfolioNetStroke)"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 2, stroke: '#1D4ED8', fill: '#ffffff' }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecastValueUsd"
                      stroke="#0EA5E9"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={{ r: 6, strokeWidth: 2, stroke: '#0EA5E9', fill: '#ffffff' }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-5 rounded-3xl border border-slate-200/80 bg-white/85 p-6 shadow-lg lg:max-w-sm">
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

            <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
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
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
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
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm text-slate-600">
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
      </CardContent>
    </Card>
  );
}
