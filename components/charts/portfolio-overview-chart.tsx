'use client';

import { useMemo } from 'react';
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
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent } from '@/lib/calculations';
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
  formatDate: (value: number) => string;
  formatPercentValue: (value: number) => string;
  summary: PortfolioSummary;
  labels: {
    net: string;
    expected: string;
    delta: string;
    current: string;
    usd: string;
    ils: string;
  };
}

const getTrendAppearance = (value: number) => {
  if (value > 0) {
    return {
      text: 'text-emerald-600',
      badge: 'bg-emerald-50/90 text-emerald-600 ring-1 ring-emerald-200/70',
      icon: <ArrowUpRight className="h-3.5 w-3.5" />,
    };
  }

  if (value < 0) {
    return {
      text: 'text-rose-600',
      badge: 'bg-rose-50/90 text-rose-600 ring-1 ring-rose-200/70',
      icon: <ArrowDownRight className="h-3.5 w-3.5" />,
    };
  }

  return {
    text: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/80',
    icon: <Minus className="h-3.5 w-3.5" />,
  };
};

const ChartTooltip = ({
  active,
  payload,
  label,
  formatUsd,
  formatIls,
  formatDate,
  formatPercentValue,
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

  const numericLabel = typeof label === 'number' ? label : Number(label ?? point.timestamp);
  const timestamp = Number.isFinite(numericLabel) ? numericLabel : point.timestamp;

  const netUsd = point.netPnLUsd ?? 0;
  const netIls = point.netPnLIls ?? netUsd * summary.usdToIlsRate;
  const expectedUsd = point.expectedNetPnLUsd ?? 0;
  const expectedIls = point.expectedNetPnLIls ?? expectedUsd * summary.usdToIlsRate;
  const deltaUsd = netUsd - expectedUsd;
  const deltaIls = netIls - expectedIls;
  const deltaPercent = expectedUsd !== 0 ? (deltaUsd / Math.abs(expectedUsd)) * 100 : 0;
  const currentUsd = point.totalPnLUsd ?? netUsd;
  const currentIls = point.totalPnLIls ?? currentUsd * summary.usdToIlsRate;

  const rows = [
    {
      key: 'net',
      label: labels.net,
      usd: netUsd,
      ils: netIls,
      accent: 'from-blue-500/80 to-indigo-500/80',
      tone: getTrendAppearance(netUsd),
    },
    {
      key: 'expected',
      label: labels.expected,
      usd: expectedUsd,
      ils: expectedIls,
      accent: 'from-indigo-500/80 to-purple-500/80',
      tone: getTrendAppearance(expectedUsd),
    },
    {
      key: 'delta',
      label: labels.delta,
      usd: deltaUsd,
      ils: deltaIls,
      accent: 'from-emerald-500/80 to-blue-500/80',
      tone: getTrendAppearance(deltaUsd),
      footnote: expectedUsd !== 0 ? formatPercentValue(deltaPercent) : undefined,
    },
    {
      key: 'current',
      label: labels.current,
      usd: currentUsd,
      ils: currentIls,
      accent: 'from-slate-500/70 to-slate-400/70',
      tone: getTrendAppearance(currentUsd),
    },
  ] as const;

  return (
    <div className="min-w-[240px] rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-2xl backdrop-blur-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {formatDate(timestamp)}
      </p>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div
            key={row.key}
            className="space-y-2 rounded-2xl bg-white/80 p-3 shadow-sm shadow-slate-200/60 ring-1 ring-slate-100/80"
          >
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span className="inline-flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full bg-gradient-to-br ${row.accent}`} />
                {row.label}
              </span>
              {row.footnote ? <span className="text-[11px] font-medium text-slate-400">{row.footnote}</span> : null}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs font-medium text-slate-500">{labels.usd}</span>
              <span className={`font-semibold ${row.tone.text}`}>{formatUsd(row.usd)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="text-xs font-medium text-slate-500">{labels.ils}</span>
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
  const formatPercentValue = (value: number) => formatPercent(value, locale);
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

  const chartData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        netPositive: Math.max(point.netPnLUsd, 0),
        netNegative: Math.min(point.netPnLUsd, 0),
      })),
    [data]
  );

  const { minNet, maxNet } = useMemo(() => {
    if (!data.length) {
      return { minNet: -1, maxNet: 1 };
    }

    const values = data.map((point) => point.netPnLUsd);
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 0);
    const range = max - min;
    const paddingBase = Math.max(Math.abs(max), Math.abs(min), 1);
    const padding = range === 0 ? paddingBase * 0.1 : range * 0.1;

    return {
      minNet: min - padding,
      maxNet: max + padding,
    };
  }, [data]);

  const bestPoint = useMemo(() => {
    if (!data.length) {
      return null;
    }

    return data.reduce((best, point) => {
      if (!best) {
        return point;
      }

      const bestValue = best.netPnLUsd ?? best.totalPnLUsd;
      const pointValue = point.netPnLUsd ?? point.totalPnLUsd;
      return pointValue > bestValue ? point : best;
    }, data[0]);
  }, [data]);

  const worstPoint = useMemo(() => {
    if (!data.length) {
      return null;
    }

    return data.reduce((worst, point) => {
      if (!worst) {
        return point;
      }

      const worstValue = worst.netPnLUsd ?? worst.totalPnLUsd;
      const pointValue = point.netPnLUsd ?? point.totalPnLUsd;
      return pointValue < worstValue ? point : worst;
    }, data[0]);
  }, [data]);

  const trendTone = getTrendAppearance(summary.totalNetPnLUsd);
  const performanceDeltaUsd = summary.totalNetPnLUsd - summary.totalProjectedPnLUsd;
  const performanceDeltaPercent = summary.totalProjectedPnLUsd !== 0
    ? (performanceDeltaUsd / Math.abs(summary.totalProjectedPnLUsd)) * 100
    : 0;
  const performanceTone = getTrendAppearance(performanceDeltaUsd);

  const openPnLUsd = summary.totalCurrentPnLUsd - summary.totalRealizedProfitUsd;
  const openPnLIls = summary.totalCurrentPnLIls - summary.totalRealizedProfitIls;
  const realizedPnLUsd = summary.totalRealizedProfitUsd;
  const realizedPnLIls = summary.totalRealizedProfitIls;
  const taxesUsd = summary.totalTaxesPaidUsd;
  const taxesIls = summary.totalTaxesPaidIls;
  const projectedPnLUsd = summary.totalProjectedPnLUsd;
  const projectedPnLIls = summary.totalProjectedPnLIls;

  const formattedBestDate = bestPoint ? dateFormatter.format(new Date(bestPoint.timestamp)) : '—';
  const formattedWorstDate = worstPoint ? dateFormatter.format(new Date(worstPoint.timestamp)) : '—';
  const formattedBestValueUsd = bestPoint ? usdFormatter(bestPoint.netPnLUsd ?? bestPoint.totalPnLUsd) : '—';
  const formattedWorstValueUsd = worstPoint ? usdFormatter(worstPoint.netPnLUsd ?? worstPoint.totalPnLUsd) : '—';
  const formattedBestValueIls = bestPoint
    ? ilsFormatter(bestPoint.netPnLIls ?? bestPoint.totalPnLIls ?? bestPoint.totalPnLUsd * summary.usdToIlsRate)
    : '—';
  const formattedWorstValueIls = worstPoint
    ? ilsFormatter(worstPoint.netPnLIls ?? worstPoint.totalPnLIls ?? worstPoint.totalPnLUsd * summary.usdToIlsRate)
    : '—';

  const formatSignedCurrency = (value: number, currency: 'USD' | 'ILS') => {
    const formatted = formatCurrency(value, currency, locale);
    return value > 0 ? `+${formatted}` : formatted;
  };

  const formatSignedPercent = (value: number) => {
    const formatted = formatPercent(value, locale);
    return value > 0 ? `+${formatted}` : formatted;
  };

  const tooltipLabels = {
    net: t.dashboard.netPnL,
    expected: t.dashboard.projectedPnL,
    delta: t.portfolio.performanceVsExpectedShort,
    current: t.dashboard.currentPnL,
    usd: t.dashboard.usdLabel,
    ils: t.dashboard.ilsLabel,
  };

  return (
    <Card className="relative overflow-hidden rounded-3xl border-none bg-transparent p-0 shadow-none">
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-white/60 bg-gradient-to-br from-white via-blue-50/80 to-indigo-100/60" />
      <div className="pointer-events-none absolute -right-32 -top-24 h-72 w-72 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-indigo-200/30 blur-3xl" />
      <div className="relative z-10">
        <CardHeader className="space-y-3 border-b border-white/60 bg-white/60 pb-6">
          <CardTitle className="text-2xl font-semibold text-slate-900">
            {t.dashboard.portfolioOverviewTitle}
          </CardTitle>
          <p className="text-sm text-slate-500">{t.dashboard.portfolioOverviewDescription}</p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
            <div className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/70 p-6 shadow-inner">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.14),_transparent_65%)]" />
              <div className="relative flex h-80 flex-col justify-end">
                <div className="absolute left-6 top-6 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 shadow-sm shadow-blue-100">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    {t.dashboard.netPnL}: {usdFormatter(summary.totalNetPnLUsd)}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 shadow-sm shadow-indigo-100">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                    {t.dashboard.projectedPnL}: {usdFormatter(summary.totalProjectedPnLUsd)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${performanceTone.badge}`}
                  >
                    {performanceTone.icon}
                    {formatSignedCurrency(performanceDeltaUsd, 'USD')}
                    <span className="text-[11px] font-medium opacity-80">
                      {formatSignedPercent(performanceDeltaPercent)}
                    </span>
                  </span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 48, right: 16, left: 8, bottom: 16 }}
                  >
                    <defs>
                      <linearGradient id="portfolioPositive" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#60A5FA" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="portfolioNegative" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#FDA4AF" stopOpacity={0.08} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value: number) => dateFormatter.format(new Date(value))}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#475569', fontSize: 12 }}
                      tickMargin={12}
                    />
                    <YAxis
                      orientation="right"
                      domain={[minNet, maxNet]}
                      tickFormatter={(value) => compactFormatter.format(value)}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#475569', fontSize: 12 }}
                      width={80}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '4 4', stroke: 'rgba(37, 99, 235, 0.28)' }}
                      content={
                        <ChartTooltip
                          formatUsd={usdFormatter}
                          formatIls={ilsFormatter}
                          formatDate={(value) => dateFormatter.format(new Date(value))}
                          formatPercentValue={formatPercentValue}
                          summary={summary}
                          labels={tooltipLabels}
                        />
                      }
                    />
                    <ReferenceLine y={0} stroke="rgba(100, 116, 139, 0.6)" strokeDasharray="6 6" strokeWidth={1.2} />
                    <Area
                      type="monotone"
                      dataKey="netPositive"
                      stroke="none"
                      fill="url(#portfolioPositive)"
                      fillOpacity={1}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="netNegative"
                      stroke="none"
                      fill="url(#portfolioNegative)"
                      fillOpacity={1}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="expectedNetPnLUsd"
                      stroke="#7C3AED"
                      strokeWidth={2}
                      strokeDasharray="6 6"
                      dot={false}
                      activeDot={false}
                      connectNulls
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="netPnLUsd"
                      stroke="#1D4ED8"
                      strokeWidth={2.8}
                      dot={false}
                      activeDot={{ r: 4 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                    {bestPoint ? (
                      <ReferenceDot
                        x={bestPoint.timestamp}
                        y={bestPoint.netPnLUsd}
                        r={4.5}
                        fill="#10B981"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                        isFront
                      />
                    ) : null}
                    {worstPoint ? (
                      <ReferenceDot
                        x={worstPoint.timestamp}
                        y={worstPoint.netPnLUsd}
                        r={4.5}
                        fill="#F43F5E"
                        stroke="#FFFFFF"
                        strokeWidth={2}
                        isFront
                      />
                    ) : null}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-inner">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {t.dashboard.netPnL}
                    </p>
                    <p className={`mt-2 text-3xl font-semibold ${trendTone.text}`}>
                      {usdFormatter(summary.totalNetPnLUsd)}
                    </p>
                    <p className="text-xs text-slate-500">{ilsFormatter(summary.totalNetPnLIls)}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${performanceTone.badge}`}
                  >
                    {performanceTone.icon}
                    {formatSignedCurrency(performanceDeltaUsd, 'USD')}
                    <span className="text-[11px] font-medium opacity-80">
                      {formatSignedPercent(performanceDeltaPercent)}
                    </span>
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-2xl border border-blue-100/70 bg-blue-50/60 p-3 text-blue-700">
                    <p className="font-semibold uppercase tracking-wide text-[11px]">
                      {t.dashboard.currentPnL}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{usdFormatter(openPnLUsd)}</p>
                    <p className="text-xs text-slate-500">{ilsFormatter(openPnLIls)}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100/70 bg-emerald-50/70 p-3 text-emerald-700">
                    <p className="font-semibold uppercase tracking-wide text-[11px]">
                      {t.dashboard.realizedPnL}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{usdFormatter(realizedPnLUsd)}</p>
                    <p className="text-xs text-slate-500">{ilsFormatter(realizedPnLIls)}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                <div className="rounded-3xl border border-rose-100/70 bg-rose-50/70 p-4 shadow-inner">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                    {t.dashboard.taxesPaid}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-rose-600">{usdFormatter(taxesUsd * -1)}</p>
                  <p className="text-xs text-rose-500">{ilsFormatter(taxesIls * -1)}</p>
                </div>
                <div className="rounded-3xl border border-indigo-100/70 bg-indigo-50/70 p-4 shadow-inner">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    {t.dashboard.projectedPnL}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{usdFormatter(projectedPnLUsd)}</p>
                  <p className="text-xs text-slate-500">{ilsFormatter(projectedPnLIls)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                <div className="rounded-3xl border border-emerald-100/70 bg-emerald-50/70 p-4 shadow-inner">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                    {t.dashboard.bestPnL}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formattedBestValueUsd}</p>
                  <p className="text-xs text-slate-500">{formattedBestValueIls}</p>
                  <p className="text-xs text-slate-400">{formattedBestDate}</p>
                </div>
                <div className="rounded-3xl border border-rose-100/70 bg-rose-50/70 p-4 shadow-inner">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                    {t.dashboard.worstPnL}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formattedWorstValueUsd}</p>
                  <p className="text-xs text-slate-500">{formattedWorstValueIls}</p>
                  <p className="text-xs text-slate-400">{formattedWorstDate}</p>
                </div>
              </div>
              <div className="rounded-3xl border border-blue-100/70 bg-gradient-to-r from-blue-50/90 via-white/90 to-indigo-100/60 p-4 text-sm text-slate-600 shadow-inner">
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
      </div>
    </Card>
  );
}
