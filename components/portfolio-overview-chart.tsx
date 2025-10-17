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
import { PortfolioSummary, PortfolioTimelineSnapshot } from '@/types';

interface PortfolioBreakdown {
  openPnLUsd: number;
  openPnLIls: number;
  realizedProfitUsd: number;
  realizedProfitIls: number;
  taxesUsd: number;
  taxesIls: number;
}

interface PortfolioOverviewChartProps {
  data: PortfolioTimelineSnapshot[];
  summary: PortfolioSummary;
  breakdown: PortfolioBreakdown;
}

type TooltipValueType = number | string;

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value: TooltipValueType; payload: PortfolioTimelineSnapshot }[];
  label?: TooltipValueType;
  labels: {
    net: string;
    open: string;
    realized: string;
    taxes: string;
    usd: string;
    ils: string;
  };
  labelFormatter: (label: TooltipValueType) => string;
  formatUsd: (value: number) => string;
  formatIls: (value: number) => string;
}

const ChartTooltip = ({ active, payload, label, labels, labelFormatter, formatUsd, formatIls }: ChartTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;

  if (!point) {
    return null;
  }

  const rows = [
    { key: 'net', label: labels.net, usd: point.netWorthUsd, ils: point.netWorthIls },
    { key: 'open', label: labels.open, usd: point.totalPnLUsd, ils: point.openPnLIls },
    { key: 'realized', label: labels.realized, usd: point.realizedProfitUsd, ils: point.realizedProfitIls },
    { key: 'taxes', label: labels.taxes, usd: point.taxUsd, ils: point.taxIls },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm shadow-xl backdrop-blur-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labelFormatter(label ?? '')}</p>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{row.label}</p>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="text-xs font-medium">{labels.usd}</span>
              <span className="ml-auto font-semibold text-slate-900">{formatUsd(row.usd)}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <span className="text-xs font-medium">{labels.ils}</span>
              <span className="ml-auto font-semibold text-slate-900">{formatIls(row.ils)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export function PortfolioOverviewChart({ data, summary, breakdown }: PortfolioOverviewChartProps) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);

  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const currencyFormatter = (value: number) => formatCurrency(value, 'USD', locale);
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
  const tooltipLabels = t.dashboard.chartTooltip;

  const netTotalUsd = breakdown.openPnLUsd + breakdown.realizedProfitUsd - breakdown.taxesUsd;
  const netTotalIls = breakdown.openPnLIls + breakdown.realizedProfitIls - breakdown.taxesIls;

  const trendPoint = data[data.length - 1];
  const projectedPnL = summary.totalProjectedPnLUsd;
  const combinedPnL = summary.totalCombinedUsd;

  const { bestPoint, worstPoint } = useMemo(() => {
    if (!data.length) {
      return { bestPoint: null, worstPoint: null };
    }

    return data.reduce(
      (acc, point) => {
        if (!acc.bestPoint || point.netWorthUsd > acc.bestPoint.netWorthUsd) {
          acc.bestPoint = point;
        }

        if (!acc.worstPoint || point.netWorthUsd < acc.worstPoint.netWorthUsd) {
          acc.worstPoint = point;
        }

        return acc;
      },
      { bestPoint: null as PortfolioTimelineSnapshot | null, worstPoint: null as PortfolioTimelineSnapshot | null }
    );
  }, [data]);

  const trendTone = trendPoint?.netWorthUsd ?? netTotalUsd;
  const toneClass = trendTone > 0 ? 'text-emerald-600' : trendTone < 0 ? 'text-rose-600' : 'text-slate-600';
  const badgeClass = trendTone > 0
    ? 'bg-emerald-50 text-emerald-600'
    : trendTone < 0
      ? 'bg-rose-50 text-rose-600'
      : 'bg-slate-100 text-slate-600';

  const formattedBestDate = bestPoint ? dateFormatter.format(new Date(bestPoint.timestamp)) : '—';
  const formattedWorstDate = worstPoint ? dateFormatter.format(new Date(worstPoint.timestamp)) : '—';

  const formattedBestValue = bestPoint ? currencyFormatter(bestPoint.netWorthUsd) : '—';
  const formattedWorstValue = worstPoint ? currencyFormatter(worstPoint.netWorthUsd) : '—';

  const openPnLUsd = breakdown.openPnLUsd;
  const openPnLIls = breakdown.openPnLIls;
  const realizedUsd = breakdown.realizedProfitUsd;
  const realizedIls = breakdown.realizedProfitIls;
  const taxesUsd = breakdown.taxesUsd;
  const taxesIls = breakdown.taxesIls;

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
                <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="portfolioPnlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.2} />
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
                        labels={tooltipLabels}
                        labelFormatter={(value) => dateFormatter.format(new Date(Number(value)))}
                        formatUsd={currencyFormatter}
                        formatIls={ilsFormatter}
                      />
                    }
                  />
                  <ReferenceLine y={0} stroke="rgba(100, 116, 139, 0.7)" strokeDasharray="6 6" />
                  <Area
                    type="monotone"
                    dataKey="netWorthUsd"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    fill="url(#portfolioPnlGradient)"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="realizedProfitUsd"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="6 4"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="taxUsd"
                    stroke="#F97316"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 4"
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
              <p className="text-sm font-medium text-slate-500">{t.dashboard.netWorthAfterTax}</p>
              <p className={`text-3xl font-semibold ${toneClass}`}>{currencyFormatter(netTotalUsd)}</p>
              <p className="text-sm text-slate-500">{ilsFormatter(netTotalIls)}</p>
              <p className="text-xs text-slate-500">{t.dashboard.netWorthAfterTaxDescription}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm text-slate-600 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t.dashboard.openPnLBreakdown}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{currencyFormatter(openPnLUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(openPnLIls)}</p>
              </div>
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t.dashboard.realizedPnLBreakdown}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{currencyFormatter(realizedUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(realizedIls)}</p>
              </div>
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t.dashboard.taxesPaidBreakdown}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{currencyFormatter(taxesUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(taxesIls)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.projectedPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{currencyFormatter(projectedPnL)}</p>
              </div>
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.combinedPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{currencyFormatter(combinedPnL)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {t.dashboard.bestPnL}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{formattedBestValue}</p>
                <p className="text-xs text-slate-500">{formattedBestDate}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                  {t.dashboard.worstPnL}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{formattedWorstValue}</p>
                <p className="text-xs text-slate-500">{formattedWorstDate}</p>
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-blue-50/90 via-white/90 to-blue-100/40 p-4 text-sm text-slate-600">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t.dashboard.portfolioOverviewFootnote}
              </p>
              <p className="mt-2 leading-relaxed">
                {t.dashboard.portfolioOverviewSummaryDetailed(
                  currencyFormatter(netTotalUsd),
                  ilsFormatter(netTotalIls),
                  currencyFormatter(taxesUsd),
                  ilsFormatter(taxesIls)
                )}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
