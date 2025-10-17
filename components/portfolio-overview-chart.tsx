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
    expected: string;
    open: string;
    realized: string;
    taxes: string;
    usd: string;
    ils: string;
  };
}

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
  const expectedUsd = point.expectedPnLUsd ?? 0;
  const expectedIls = point.expectedPnLIls ?? expectedUsd * summary.usdToIlsRate;
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
      key: 'expected',
      label: labels.expected,
      usd: expectedUsd,
      ils: expectedIls,
      accent: 'from-sky-500 to-sky-400',
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
  const compactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(localeCode, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [localeCode]
  );

  const trendPoint = data[data.length - 1];
  const openPnLUsd = summary.totalCurrentPnLUsd;
  const openPnLIls = summary.totalCurrentPnLIls;
  const realizedPnLUsd = summary.totalRealizedProfitUsd;
  const realizedPnLIls = summary.totalRealizedProfitIls;
  const taxesUsd = summary.totalTaxesPaidUsd;
  const taxesIls = summary.totalTaxesPaidIls;
  const netPnLUsd = summary.totalNetPnLUsd;
  const netPnLIls = summary.totalNetPnLIls;
  const projectedPnLUsd = summary.totalProjectedPnLUsd;
  const projectedPnLIls = summary.totalProjectedPnLIls;

  const { bestPoint, worstPoint } = useMemo(() => {
    if (!data.length) {
      return { bestPoint: null, worstPoint: null };
    }

    return data.reduce(
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
  }, [data]);

  const trendTone = trendPoint?.netPnLUsd ?? netPnLUsd;
  const toneClass = trendTone > 0 ? 'text-emerald-600' : trendTone < 0 ? 'text-rose-600' : 'text-slate-600';
  const badgeClass = trendTone > 0
    ? 'bg-emerald-50 text-emerald-600'
    : trendTone < 0
      ? 'bg-rose-50 text-rose-600'
      : 'bg-slate-100 text-slate-600';

  const latestPoint = data[data.length - 1];
  const latestNetPnL = latestPoint?.netPnLUsd ?? netPnLUsd;
  const latestExpectedPnL = latestPoint?.expectedPnLUsd ?? 0;
  const areaStrokeColor =
    latestNetPnL < 0
      ? '#DC2626'
      : latestNetPnL > latestExpectedPnL
        ? '#059669'
        : '#2563EB';

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
                <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="portfolioPnlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={areaStrokeColor} stopOpacity={0.9} />
                      <stop offset="95%" stopColor={areaStrokeColor} stopOpacity={0.15} />
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
                    cursor={{ strokeDasharray: '4 4', stroke: areaStrokeColor, strokeOpacity: 0.35 }}
                    content={
                      <ChartTooltip
                        formatUsd={usdFormatter}
                        formatIls={ilsFormatter}
                        labelFormatter={(value) => dateFormatter.format(new Date(Number(value)))}
                        summary={summary}
                        labels={{
                          net: t.dashboard.netPnL,
                          expected: t.dashboard.expectedVsBenchmark,
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
                  <Area
                    type="monotone"
                    dataKey="netPnLUsd"
                    stroke={areaStrokeColor}
                    strokeWidth={2.5}
                    fill="url(#portfolioPnlGradient)"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="expectedPnLUsd"
                    stroke="#2563EB"
                    strokeDasharray="6 4"
                    strokeWidth={2}
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
