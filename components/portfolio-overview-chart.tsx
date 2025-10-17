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
import type { TooltipProps } from 'recharts';
import { useCallback, useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { PortfolioSummary, PortfolioTimelinePoint } from '@/types';

interface PortfolioOverviewChartProps {
  data: PortfolioTimelinePoint[];
  summary: PortfolioSummary;
}

export function PortfolioOverviewChart({ data, summary }: PortfolioOverviewChartProps) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);

  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const currencyFormatterUsd = useCallback(
    (value: number) => formatCurrency(value, 'USD', locale),
    [locale]
  );
  const currencyFormatterIls = useCallback(
    (value: number) => formatCurrency(value, 'ILS', locale),
    [locale]
  );
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
  const currentPnL = summary.totalCurrentPnLUsd;
  const projectedPnL = summary.totalProjectedPnLUsd;
  const combinedPnL = summary.totalCombinedUsd;

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

  const trendTone = trendPoint?.totalPnLUsd ?? currentPnL;
  const toneClass = trendTone > 0 ? 'text-emerald-600' : trendTone < 0 ? 'text-rose-600' : 'text-slate-600';
  const badgeClass = trendTone > 0
    ? 'bg-emerald-50 text-emerald-600'
    : trendTone < 0
      ? 'bg-rose-50 text-rose-600'
      : 'bg-slate-100 text-slate-600';

  const formattedBestDate = bestPoint ? dateFormatter.format(new Date(bestPoint.timestamp)) : '—';
  const formattedWorstDate = worstPoint ? dateFormatter.format(new Date(worstPoint.timestamp)) : '—';

  const formattedBestValue = bestPoint ? currencyFormatterUsd(bestPoint.totalPnLUsd) : '—';
  const formattedWorstValue = worstPoint ? currencyFormatterUsd(worstPoint.totalPnLUsd) : '—';

  const renderTooltip = useCallback(
    ({ active, payload, label }: TooltipProps<number, string>) => {
      if (!active || !payload?.length) {
        return null;
      }

      const point = payload[0]?.payload as PortfolioTimelinePoint | undefined;
      if (!point) {
        return null;
      }

      const formattedLabel = typeof label === 'number'
        ? dateFormatter.format(new Date(label))
        : label
          ? String(label)
          : '';

      const rows: Array<{
        key: string;
        label: string;
        usd: number;
        ils: number;
        color: string;
      }> = [
        {
          key: 'netWorth',
          label: t.dashboard.timelineNetWorth,
          usd: point.netWorthUsd,
          ils: point.netWorthIls,
          color: 'bg-blue-500',
        },
        {
          key: 'openValue',
          label: t.dashboard.timelineOpenPositions,
          usd: point.openValueUsd,
          ils: point.openValueIls,
          color: 'bg-emerald-500',
        },
        {
          key: 'realized',
          label: t.dashboard.timelineRealized,
          usd: point.realizedProfitUsd,
          ils: point.realizedProfitIls,
          color: 'bg-amber-500',
        },
        {
          key: 'taxes',
          label: t.dashboard.timelineTaxes,
          usd: point.taxesPaidUsd,
          ils: point.taxesPaidIls,
          color: 'bg-rose-500',
        },
      ];

      return (
        <div className="min-w-[220px] rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-sm shadow-xl backdrop-blur-lg">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{formattedLabel}</p>
          <div className="mt-3 space-y-3">
            {rows.map((row) => (
              <div key={row.key} className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <span className={`h-2.5 w-2.5 rounded-full ${row.color}`} />
                  <span className="truncate">{row.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pl-4 text-[11px] text-slate-500 sm:text-xs">
                  <span className="font-medium text-slate-600">{t.dashboard.timelineUsdLabel}</span>
                  <span className="text-right font-semibold text-slate-900">{currencyFormatterUsd(row.usd)}</span>
                  <span className="font-medium text-slate-600">{t.dashboard.timelineIlsLabel}</span>
                  <span className="text-right font-semibold text-slate-900">{currencyFormatterIls(row.ils)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    },
    [currencyFormatterIls, currencyFormatterUsd, dateFormatter, t]
  );

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
                    content={renderTooltip}
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
                    name={t.dashboard.timelineNetWorth}
                  />
                  <Line
                    type="monotone"
                    dataKey="openValueUsd"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name={t.dashboard.timelineOpenPositions}
                  />
                  <Line
                    type="monotone"
                    dataKey="realizedProfitUsd"
                    stroke="#F59E0B"
                    strokeWidth={1.75}
                    dot={false}
                    strokeDasharray="4 4"
                    isAnimationActive={false}
                    name={t.dashboard.timelineRealized}
                  />
                  <Line
                    type="monotone"
                    dataKey="taxesPaidUsd"
                    stroke="#F43F5E"
                    strokeWidth={1.75}
                    dot={false}
                    strokeDasharray="2 4"
                    isAnimationActive={false}
                    name={t.dashboard.timelineTaxes}
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
              <p className="text-sm font-medium text-slate-500">{t.dashboard.currentPnL}</p>
              <p className={`text-3xl font-semibold ${toneClass}`}>
                {currencyFormatterUsd(currentPnL)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.projectedPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{currencyFormatterUsd(projectedPnL)}</p>
              </div>
              <div className="rounded-xl bg-slate-50/70 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.combinedPnL}</p>
                <p className="mt-1 font-semibold text-slate-900">{currencyFormatterUsd(combinedPnL)}</p>
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
                  currencyFormatterUsd(currentPnL),
                  currencyFormatterUsd(projectedPnL)
                )}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
