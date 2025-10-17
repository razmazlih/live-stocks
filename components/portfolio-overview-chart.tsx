'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
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
  payload?: Array<{ payload: PortfolioTimelinePoint }>;
  label?: TooltipValueType;
  formatDate: (value: TooltipValueType) => string;
  formatUsd: (value: number) => string;
  formatIls: (value: number) => string;
  usdToIlsRate: number;
  labels: {
    usdHeading: string;
    ilsHeading: string;
    totalValue: string;
    openPositions: string;
    realizedCash: string;
    taxesPaid: string;
    netPnl: string;
  };
}

const ChartTooltip = ({
  active,
  payload,
  label,
  formatDate,
  formatUsd,
  formatIls,
  usdToIlsRate,
  labels,
}: ChartTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const dataPoint = payload[0]?.payload;
  if (!dataPoint) {
    return null;
  }

  const netPnlIls = dataPoint.totalPnLUsd * usdToIlsRate;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm shadow-xl backdrop-blur-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {formatDate(label ?? '')}
      </p>
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{labels.usdHeading}</p>
          <div className="mt-1 space-y-1 text-xs text-slate-600 sm:text-sm">
            <div className="flex items-center justify-between font-medium text-slate-500">
              <span>{labels.totalValue}</span>
              <span className="font-semibold text-slate-900">{formatUsd(dataPoint.totalValueUsd)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{labels.openPositions}</span>
              <span className="font-semibold text-slate-900">{formatUsd(dataPoint.openValueUsd)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{labels.realizedCash}</span>
              <span className="font-semibold text-slate-900">{formatUsd(dataPoint.realizedProceedsUsd)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{labels.taxesPaid}</span>
              <span className="font-semibold text-slate-900">{formatUsd(dataPoint.taxesPaidUsd)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{labels.netPnl}</span>
              <span className="font-semibold text-slate-900">{formatUsd(dataPoint.totalPnLUsd)}</span>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{labels.ilsHeading}</p>
          <div className="mt-1 space-y-1 text-xs text-slate-600 sm:text-sm">
            <div className="flex items-center justify-between font-medium text-slate-500">
              <span>{labels.totalValue}</span>
              <span className="font-semibold text-slate-900">{formatIls(dataPoint.totalValueIls)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{labels.openPositions}</span>
              <span className="font-semibold text-slate-900">{formatIls(dataPoint.openValueIls)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{labels.realizedCash}</span>
              <span className="font-semibold text-slate-900">{formatIls(dataPoint.realizedProceedsIls)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{labels.taxesPaid}</span>
              <span className="font-semibold text-slate-900">{formatIls(dataPoint.taxesPaidIls)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{labels.netPnl}</span>
              <span className="font-semibold text-slate-900">{formatIls(netPnlIls)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export function PortfolioOverviewChart({ data, summary }: PortfolioOverviewChartProps) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);

  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const currencyFormatter = (value: number) => formatCurrency(value, 'USD', locale);
  const currencyFormatterIls = (value: number) => formatCurrency(value, 'ILS', locale);
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
  const netPnLUsdFallback =
    summary.totalCurrentPnLUsd + summary.realizedProfitUsd - summary.taxesPaidUsd;
  const latestPoint = trendPoint;
  const netPnLUsd = latestPoint?.totalPnLUsd ?? netPnLUsdFallback;

  const netWorthUsd = latestPoint?.totalValueUsd ?? summary.netWorthUsd;
  const netWorthIls = latestPoint?.totalValueIls ?? summary.netWorthIls;
  const openValueUsd = latestPoint?.openValueUsd ?? summary.totalValue;
  const openValueIls = latestPoint?.openValueIls ?? summary.totalValue * summary.usdToIlsRate;
  const realizedCashUsd = latestPoint?.realizedProceedsUsd ?? summary.realizedProceedsUsd;
  const realizedCashIls = latestPoint?.realizedProceedsIls ?? summary.realizedProceedsIls;
  const taxesPaidUsd = latestPoint?.taxesPaidUsd ?? summary.taxesPaidUsd;
  const taxesPaidIls = latestPoint?.taxesPaidIls ?? summary.taxesPaidIls;
  const netPnLIls = latestPoint
    ? latestPoint.totalPnLUsd * summary.usdToIlsRate
    : summary.totalCurrentPnLIls + summary.realizedProfitIls - summary.taxesPaidIls;

  const { bestPoint, worstPoint } = useMemo(() => {
    if (!data.length) {
      return { bestPoint: null, worstPoint: null };
    }

    return data.reduce(
      (acc, point) => {
        if (!acc.bestPoint || point.totalPnLUsd > acc.bestPoint.totalPnLUsd) {
          acc.bestPoint = point;
        }

        if (!acc.worstPoint || point.totalPnLUsd < acc.worstPoint.totalPnLUsd) {
          acc.worstPoint = point;
        }

        return acc;
      },
      { bestPoint: null as PortfolioTimelinePoint | null, worstPoint: null as PortfolioTimelinePoint | null }
    );
  }, [data]);

  const trendTone = netPnLUsd;
  const toneClass = trendTone > 0 ? 'text-emerald-600' : trendTone < 0 ? 'text-rose-600' : 'text-slate-600';
  const badgeClass = trendTone > 0
    ? 'bg-emerald-50 text-emerald-600'
    : trendTone < 0
      ? 'bg-rose-50 text-rose-600'
      : 'bg-slate-100 text-slate-600';

  const formattedBestDate = bestPoint ? dateFormatter.format(new Date(bestPoint.timestamp)) : '—';
  const formattedWorstDate = worstPoint ? dateFormatter.format(new Date(worstPoint.timestamp)) : '—';

  const formattedBestValue = bestPoint ? currencyFormatter(bestPoint.totalPnLUsd) : '—';
  const formattedWorstValue = worstPoint ? currencyFormatter(worstPoint.totalPnLUsd) : '—';

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
                    <linearGradient id="portfolioValueUsd" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.85} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.15} />
                    </linearGradient>
                    <linearGradient id="portfolioValueIls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.65} />
                      <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.12} />
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
                        formatDate={(value) => dateFormatter.format(new Date(Number(value)))}
                        formatUsd={currencyFormatter}
                        formatIls={currencyFormatterIls}
                        usdToIlsRate={summary.usdToIlsRate}
                        labels={{
                          usdHeading: t.dashboard.portfolioOverviewUsdHeading,
                          ilsHeading: t.dashboard.portfolioOverviewIlsHeading,
                          totalValue: t.dashboard.portfolioOverviewTotalValue,
                          openPositions: t.dashboard.portfolioOverviewOpenLabel,
                          realizedCash: t.dashboard.portfolioOverviewRealizedLabel,
                          taxesPaid: t.dashboard.portfolioOverviewTaxesLabel,
                          netPnl: t.dashboard.portfolioOverviewNetLabel,
                        }}
                      />
                    }
                  />
                  <ReferenceLine y={0} stroke="rgba(100, 116, 139, 0.7)" strokeDasharray="6 6" />
                  <Area
                    type="monotone"
                    dataKey="totalValueUsd"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    fill="url(#portfolioValueUsd)"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalValueIls"
                    stroke="#0EA5E9"
                    strokeWidth={2.5}
                    fill="url(#portfolioValueIls)"
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
              <p className="text-sm font-medium text-slate-500">{t.dashboard.netWorth}</p>
              <p className={`text-3xl font-semibold ${toneClass}`}>
                {currencyFormatter(netWorthUsd)}
              </p>
              <p className="text-xs font-medium text-slate-500">{currencyFormatterIls(netWorthIls)}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t.dashboard.openHoldingsValue}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{currencyFormatter(openValueUsd)}</p>
                <p className="text-xs text-slate-500">{currencyFormatterIls(openValueIls)}</p>
              </div>
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t.dashboard.realizedCashValue}
                </p>
                <p className="mt-1 font-semibold text-slate-900">{currencyFormatter(realizedCashUsd)}</p>
                <p className="text-xs text-slate-500">{currencyFormatterIls(realizedCashIls)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t.dashboard.taxesPaidValue}
                </p>
                <p className="mt-1 font-semibold text-rose-600">{currencyFormatter(taxesPaidUsd)}</p>
                <p className="text-xs text-slate-500">{currencyFormatterIls(taxesPaidIls)}</p>
              </div>
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {t.dashboard.netPnl}
                </p>
                <p className={`mt-1 font-semibold ${netPnLUsd >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {currencyFormatter(netPnLUsd)}
                </p>
                <p className="text-xs text-slate-500">{currencyFormatterIls(netPnLIls)}</p>
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
                {t.dashboard.portfolioOverviewSummary(
                  currencyFormatter(netWorthUsd),
                  currencyFormatter(openValueUsd),
                  currencyFormatter(realizedCashUsd),
                  currencyFormatter(taxesPaidUsd)
                )}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
