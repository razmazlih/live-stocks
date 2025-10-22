'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useId, useMemo } from 'react';

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

type EnrichedTimelinePoint = PortfolioTimelinePoint & {
  netValueUsd: number;
  netValueIls: number;
  openValueUsd: number;
  openValueIls: number;
  expectedNetUsd: number;
  expectedNetIls: number;
  deltaUsd: number;
  deltaPercent: number;
  distanceToExpectedUsd: number;
  distanceToExpectedIls: number;
  distanceToExpectedPercent: number;
};

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value: TooltipValueType; payload: EnrichedTimelinePoint }[];
  label?: TooltipValueType;
  formatUsd: (value: number) => string;
  formatIls: (value: number) => string;
  formatSignedPercent: (value: number) => string;
  labelFormatter: (label: TooltipValueType) => string;
  summary: PortfolioSummary;
  labels: {
    net: string;
    expected: string;
    delta: string;
    open: string;
    realized: string;
    taxes: string;
    usd: string;
    ils: string;
    deltaBadge: string;
  };
}

const ChartTooltip = ({
  active,
  payload,
  label,
  formatUsd,
  formatIls,
  formatSignedPercent,
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

  const formatSignedUsd = (value: number) => {
    const formatted = formatUsd(value);
    return value > 0 ? `+${formatted}` : formatted;
  };

  const formatSignedIls = (value: number) => {
    const formatted = formatIls(value);
    return value > 0 ? `+${formatted}` : formatted;
  };

  const deltaTone =
    point.deltaUsd > 0
      ? { badge: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-600' }
      : point.deltaUsd < 0
        ? { badge: 'bg-rose-50 text-rose-600', text: 'text-rose-600' }
        : { badge: 'bg-slate-100 text-slate-600', text: 'text-slate-500' };

  const primaryRows = [
    {
      key: 'net',
      label: labels.net,
      usd: point.netValueUsd,
      ils: point.netValueIls,
      accent: 'from-sky-500 to-indigo-500',
      showSigned: false,
    },
    {
      key: 'expected',
      label: labels.expected,
      usd: point.expectedNetUsd,
      ils: point.expectedNetIls,
      accent: 'from-slate-500 to-slate-400',
      showSigned: false,
    },
    {
      key: 'delta',
      label: labels.delta,
      usd: point.distanceToExpectedUsd,
      ils: point.distanceToExpectedIls,
      accent:
        point.distanceToExpectedUsd >= 0
          ? 'from-emerald-500 to-emerald-400'
          : 'from-rose-500 to-rose-400',
      showSigned: true,
      percent: point.distanceToExpectedPercent,
    },
  ] as const;

  const secondaryRows = [
    {
      key: 'open',
      label: labels.open,
      usd: point.openValueUsd,
      ils: point.openValueIls,
      accent: 'from-slate-500 to-slate-400',
      showSigned: true,
    },
    {
      key: 'realized',
      label: labels.realized,
      usd: summary.totalRealizedProfitUsd,
      ils: summary.totalRealizedProfitIls,
      accent: 'from-emerald-500 to-emerald-400',
      showSigned: true,
    },
    {
      key: 'taxes',
      label: labels.taxes,
      usd: summary.totalTaxesPaidUsd * -1,
      ils: summary.totalTaxesPaidIls * -1,
      accent: 'from-rose-500 to-rose-400',
      showSigned: true,
    },
  ] as const;

  return (
    <div className="min-w-[240px] rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-sm shadow-xl backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {labelFormatter(label ?? '')}
          </p>
          <p className="mt-1 text-xs text-slate-500">{labels.net}</p>
        </div>
        <div className="text-right">
          <span className={`inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-semibold ${deltaTone.badge}`}>
            {formatSignedUsd(point.deltaUsd)}
          </span>
          <p className={`mt-1 text-[11px] font-semibold uppercase tracking-wide ${deltaTone.text}`}>
            {labels.deltaBadge}{' '}
            <span className="font-bold">{formatSignedPercent(point.deltaPercent)}</span>
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {primaryRows.map((row) => {
          const percentTone =
            typeof row.percent === 'number'
              ? row.usd > 0
                ? 'text-emerald-600'
                : row.usd < 0
                  ? 'text-rose-600'
                  : 'text-slate-500'
              : undefined;
          const valueUsd = row.showSigned ? formatSignedUsd(row.usd) : formatUsd(row.usd);
          const valueIls = row.showSigned ? formatSignedIls(row.ils) : formatIls(row.ils);

          return (
            <div key={row.key} className="rounded-xl border border-slate-200/70 bg-white/80 p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span className="inline-flex h-2.5 w-2.5 items-center justify-center">
                    <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-br ${row.accent}`} />
                  </span>
                  {row.label}
                </div>
                {typeof row.percent === 'number' ? (
                  <span className={`text-xs font-semibold ${percentTone}`}>
                    {formatSignedPercent(row.percent)}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 text-right">
                <p className="text-sm font-semibold text-slate-900">{valueUsd}</p>
                <p className="text-xs text-slate-500">{valueIls}</p>
              </div>
            </div>
          );
        })}

        <div className="grid grid-cols-3 gap-2 text-xs">
          {secondaryRows.map((row) => {
            const valueUsd = row.showSigned ? formatSignedUsd(row.usd) : formatUsd(row.usd);
            const valueIls = row.showSigned ? formatSignedIls(row.ils) : formatIls(row.ils);

            return (
              <div key={row.key} className="rounded-lg border border-slate-200/70 bg-white/75 p-2 shadow-sm">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  <span className="inline-flex h-2 w-2 items-center justify-center">
                    <span className={`h-2 w-2 rounded-full bg-gradient-to-br ${row.accent}`} />
                  </span>
                  {row.label}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-900">{valueUsd}</p>
                <p className="text-[11px] text-slate-500">{valueIls}</p>
              </div>
            );
          })}
        </div>
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
  const formatSignedUsdValue = (value: number) => {
    const formatted = usdFormatter(value);
    return value > 0 ? `+${formatted}` : formatted;
  };
  const formatSignedIlsValue = (value: number) => {
    const formatted = ilsFormatter(value);
    return value > 0 ? `+${formatted}` : formatted;
  };

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

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeCode, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [localeCode]
  );

  const formatSignedPercent = (value: number) => {
    const formatted = percentFormatter.format(Math.abs(value) / 100);
    if (value > 0) {
      return `+${formatted}`;
    }

    if (value < 0) {
      return `-${formatted}`;
    }

    return percentFormatter.format(0);
  };

  const chartData = useMemo<EnrichedTimelinePoint[]>(() => {
    if (!data?.length) {
      return [];
    }

    return data.map((point, index) => {
      const netValueUsd = point.netPnLUsd ?? point.totalPnLUsd ?? 0;
      const netValueIls = point.netPnLIls ?? point.totalPnLIls ?? netValueUsd * summary.usdToIlsRate;
      const openValueUsd = point.totalPnLUsd ?? netValueUsd;
      const openValueIls = point.totalPnLIls ?? netValueIls;
      const expectedNetUsd = point.expectedNetPnLUsd ?? netValueUsd;
      const expectedNetIls = point.expectedNetPnLIls ?? expectedNetUsd * summary.usdToIlsRate;
      const previousPoint = index > 0 ? data[index - 1] : undefined;
      const previousNetUsd = previousPoint
        ? previousPoint.netPnLUsd ?? previousPoint.totalPnLUsd ?? netValueUsd
        : netValueUsd;
      const deltaUsd = index === 0 ? 0 : netValueUsd - previousNetUsd;
      const deltaPercent = index === 0 || previousNetUsd === 0 ? 0 : (deltaUsd / Math.abs(previousNetUsd)) * 100;
      const distanceToExpectedUsd = netValueUsd - expectedNetUsd;
      const distanceToExpectedIls = netValueIls - expectedNetIls;
      const distanceToExpectedPercent =
        expectedNetUsd === 0 ? 0 : (distanceToExpectedUsd / Math.abs(expectedNetUsd)) * 100;

      return {
        ...point,
        netValueUsd,
        netValueIls,
        openValueUsd,
        openValueIls,
        expectedNetUsd,
        expectedNetIls,
        deltaUsd,
        deltaPercent,
        distanceToExpectedUsd,
        distanceToExpectedIls,
        distanceToExpectedPercent,
      };
    });
  }, [data, summary.usdToIlsRate]);

  const reactId = useId();
  const gradientBaseId = useMemo(() => reactId.replace(/:/g, ''), [reactId]);
  const areaGradientId = `${gradientBaseId}-area`;
  const strokeGradientId = `${gradientBaseId}-stroke`;
  const dotGradientId = `${gradientBaseId}-dot`;

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

  const distanceToExpectedUsd =
    trendPoint?.distanceToExpectedUsd ?? summary.totalNetPnLUsd - summary.totalProjectedPnLUsd;
  const distanceToExpectedIls =
    trendPoint?.distanceToExpectedIls ?? summary.totalNetPnLIls - summary.totalProjectedPnLIls;
  const distanceToExpectedPercent = trendPoint?.distanceToExpectedPercent ??
    (summary.totalProjectedPnLUsd === 0
      ? 0
      : ((summary.totalNetPnLUsd - summary.totalProjectedPnLUsd) / Math.abs(summary.totalProjectedPnLUsd)) * 100);

  const { bestPoint, worstPoint } = useMemo(() => {
    if (!chartData.length) {
      return { bestPoint: null, worstPoint: null };
    }

    return chartData.reduce(
      (acc, point) => {
        if (!acc.bestPoint || point.netValueUsd > acc.bestPoint.netValueUsd) {
          acc.bestPoint = point;
        }

        if (!acc.worstPoint || point.netValueUsd < acc.worstPoint.netValueUsd) {
          acc.worstPoint = point;
        }

        return acc;
      },
      { bestPoint: null as EnrichedTimelinePoint | null, worstPoint: null as EnrichedTimelinePoint | null }
    );
  }, [chartData]);

  const trendTone = trendPoint?.netValueUsd ?? netPnLUsd;
  const toneClass = trendTone > 0 ? 'text-emerald-600' : trendTone < 0 ? 'text-rose-600' : 'text-slate-600';
  const badgeClass =
    trendTone > 0
      ? 'bg-emerald-100 text-emerald-700'
      : trendTone < 0
        ? 'bg-rose-100 text-rose-700'
        : 'bg-slate-200 text-slate-600';

  const expectationTone =
    distanceToExpectedUsd > 0
      ? { border: 'border-emerald-200', bg: 'bg-emerald-50/70', text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' }
      : distanceToExpectedUsd < 0
        ? { border: 'border-rose-200', bg: 'bg-rose-50/70', text: 'text-rose-600', badge: 'bg-rose-100 text-rose-700' }
        : { border: 'border-slate-200', bg: 'bg-slate-50/70', text: 'text-slate-600', badge: 'bg-slate-200 text-slate-600' };

  const formattedBestDate = bestPoint ? dateFormatter.format(new Date(bestPoint.timestamp)) : '—';
  const formattedWorstDate = worstPoint ? dateFormatter.format(new Date(worstPoint.timestamp)) : '—';

  const formattedBestValueUsd = bestPoint ? usdFormatter(bestPoint.netValueUsd) : '—';
  const formattedBestValueIls = bestPoint ? ilsFormatter(bestPoint.netValueIls) : '—';
  const formattedWorstValueUsd = worstPoint ? usdFormatter(worstPoint.netValueUsd) : '—';
  const formattedWorstValueIls = worstPoint ? ilsFormatter(worstPoint.netValueIls) : '—';

  return (
    <Card className="overflow-hidden border border-slate-200/80 bg-gradient-to-br from-white via-sky-50/70 to-indigo-50/60 shadow-xl">
      <CardHeader className="space-y-2 border-b border-slate-200/60 bg-white/70 backdrop-blur">
        <CardTitle className="text-lg font-semibold text-slate-900">
          {t.dashboard.portfolioOverviewTitle}
        </CardTitle>
        <p className="text-sm text-slate-500">{t.dashboard.portfolioOverviewDescription}</p>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-6 xl:flex-row">
          <div className="flex-1">
            <div className="relative h-80 overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 shadow-inner">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_55%)]" />
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 24, right: 28, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={strokeGradientId} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#0ea5e9" />
                      <stop offset="50%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                    <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(14, 165, 233, 0.24)" />
                      <stop offset="60%" stopColor="rgba(37, 99, 235, 0.12)" />
                      <stop offset="100%" stopColor="rgba(79, 70, 229, 0.04)" />
                    </linearGradient>
                    <radialGradient id={dotGradientId} cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                      <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.65" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0.85" />
                    </radialGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value: number) => dateFormatter.format(new Date(value))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#475569', fontSize: 12 }}
                    minTickGap={24}
                  />
                  <YAxis
                    orientation="right"
                    tickFormatter={(value) => compactFormatter.format(value)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#475569', fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '4 4', stroke: 'rgba(37, 99, 235, 0.35)', strokeWidth: 2 }}
                    content={
                      <ChartTooltip
                        formatUsd={usdFormatter}
                        formatIls={ilsFormatter}
                        formatSignedPercent={formatSignedPercent}
                        labelFormatter={(value) => dateFormatter.format(new Date(Number(value)))}
                        summary={summary}
                        labels={{
                          net: t.dashboard.netPnL,
                          expected: t.dashboard.performanceTrendExpected,
                          delta: t.portfolio.performanceVsExpectedShort,
                          open: t.dashboard.currentPnL,
                          realized: t.dashboard.realizedPnL,
                          taxes: t.dashboard.taxesPaid,
                          usd: t.dashboard.usdLabel,
                          ils: t.dashboard.ilsLabel,
                          deltaBadge: t.dashboard.dailyChange,
                        }}
                      />
                    }
                  />
                  <ReferenceLine y={0} stroke="rgba(15, 23, 42, 0.35)" strokeDasharray="6 6" />
                  <Line
                    type="monotone"
                    dataKey="expectedNetUsd"
                    stroke="rgba(15, 23, 42, 0.55)"
                    strokeWidth={2}
                    strokeDasharray="6 6"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="netValueUsd"
                    stroke={`url(#${strokeGradientId})`}
                    strokeWidth={3}
                    fill={`url(#${areaGradientId})`}
                    fillOpacity={1}
                    isAnimationActive={false}
                    activeDot={{ r: 6, fill: `url(#${dotGradientId})`, stroke: '#ffffff', strokeWidth: 2 }}
                  />
                  {bestPoint ? (
                    <ReferenceDot
                      x={bestPoint.timestamp}
                      y={bestPoint.netValueUsd}
                      r={6}
                      fill={`url(#${dotGradientId})`}
                      stroke="#0f172a"
                      strokeWidth={1.5}
                    />
                  ) : null}
                  {worstPoint ? (
                    <ReferenceDot
                      x={worstPoint.timestamp}
                      y={worstPoint.netValueUsd}
                      r={6}
                      fill="#f43f5e"
                      fillOpacity={0.75}
                      stroke="#ffffff"
                      strokeWidth={1.5}
                    />
                  ) : null}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-4 rounded-3xl border border-slate-200/70 bg-white/80 p-5 shadow-inner backdrop-blur">
            <div className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
              <span className="h-2.5 w-2.5 rounded-full bg-current" />
              {toneClass === 'text-emerald-600'
                ? t.dashboard.positiveTrend
                : toneClass === 'text-rose-600'
                  ? t.dashboard.negativeTrend
                  : t.dashboard.neutralTrend}
            </div>

            <div className="rounded-2xl bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.dashboard.netPnL}</p>
              <p className={`mt-2 text-3xl font-semibold ${toneClass}`}>{usdFormatter(netPnLUsd)}</p>
              <p className="text-xs text-slate-500">{ilsFormatter(netPnLIls)}</p>
            </div>

            <div className={`rounded-2xl border ${expectationTone.border} ${expectationTone.bg} p-4`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.portfolio.performanceVsExpectedShort}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${expectationTone.badge}`}>
                  {formatSignedPercent(distanceToExpectedPercent)}
                </span>
              </div>
              <p className={`mt-2 text-lg font-semibold ${expectationTone.text}`}>
                {formatSignedUsdValue(distanceToExpectedUsd)}
              </p>
              <p className="text-xs text-slate-500">{formatSignedIlsValue(distanceToExpectedIls)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.currentPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{usdFormatter(openPnLUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(openPnLIls)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.realizedPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{usdFormatter(realizedPnLUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(realizedPnLIls)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl border border-rose-100 bg-rose-50/80 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">{t.dashboard.taxesPaid}</p>
                <p className="mt-1 font-semibold text-rose-600">{usdFormatter(taxesUsd * -1)}</p>
                <p className="text-xs text-rose-500">{ilsFormatter(taxesIls * -1)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.projectedPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{usdFormatter(projectedPnLUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(projectedPnLIls)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {t.dashboard.bestPnL}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{formattedBestValueUsd}</p>
                <p className="text-xs text-slate-500">{formattedBestValueIls}</p>
                <p className="text-xs text-slate-400">{formattedBestDate}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                  {t.dashboard.worstPnL}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{formattedWorstValueUsd}</p>
                <p className="text-xs text-slate-500">{formattedWorstValueIls}</p>
                <p className="text-xs text-slate-400">{formattedWorstDate}</p>
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-blue-50/90 via-white/90 to-blue-100/40 p-4 text-sm text-slate-600 shadow-sm">
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

