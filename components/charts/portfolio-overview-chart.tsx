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
import { useCallback, useMemo, useState } from 'react';

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

interface ChartDatum extends PortfolioTimelinePoint {
  changeUsd: number;
  changePercent: number;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
  label?: TooltipValueType;
  formatUsd: (value: number) => string;
  formatIls: (value: number) => string;
  labelFormatter: (label: TooltipValueType) => string;
  usdToIlsRate: number;
  labels: {
    net: string;
    expected: string;
    current: string;
    delta: string;
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
  usdToIlsRate,
  labels,
}: ChartTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  const netUsd = point.netPnLUsd ?? point.totalPnLUsd ?? 0;
  const netIls = point.netPnLIls ?? point.totalPnLIls ?? netUsd * usdToIlsRate;
  const expectedUsd = point.expectedNetPnLUsd ?? 0;
  const expectedIls = point.expectedNetPnLIls ?? expectedUsd * usdToIlsRate;
  const currentUsd = point.totalPnLUsd ?? 0;
  const currentIls = point.totalPnLIls ?? currentUsd * usdToIlsRate;
  const deltaUsd = netUsd - expectedUsd;
  const deltaIls = netIls - expectedIls;

  const formatSignedUsd = (value: number) => (value > 0 ? `+${formatUsd(value)}` : formatUsd(value));
  const formatSignedIls = (value: number) => (value > 0 ? `+${formatIls(value)}` : formatIls(value));

  const toneClass = (value: number, neutral: string) =>
    value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : neutral;

  const rows = [
    {
      key: 'net',
      label: labels.net,
      usd: netUsd,
      ils: netIls,
      accent: 'from-sky-500 to-indigo-500',
      signed: false,
    },
    {
      key: 'expected',
      label: labels.expected,
      usd: expectedUsd,
      ils: expectedIls,
      accent: 'from-cyan-400 to-sky-500',
      signed: false,
    },
    {
      key: 'current',
      label: labels.current,
      usd: currentUsd,
      ils: currentIls,
      accent: 'from-slate-400 to-slate-500',
      signed: false,
    },
    {
      key: 'delta',
      label: labels.delta,
      usd: deltaUsd,
      ils: deltaIls,
      accent: 'from-emerald-500 to-emerald-400',
      signed: true,
    },
  ] as const;

  return (
    <div className="rounded-2xl border border-blue-100 bg-white/95 px-4 py-3 text-sm shadow-xl backdrop-blur-md">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {labelFormatter(label ?? '')}
      </p>
      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full bg-gradient-to-br ${row.accent}`} />
              {row.label}
            </div>
            <div className="flex items-baseline justify-between text-sm text-slate-600">
              <span className="font-medium text-slate-500">{labels.usd}</span>
              <span className={`font-semibold ${toneClass(row.usd, 'text-slate-900')}`}>
                {row.signed ? formatSignedUsd(row.usd) : formatUsd(row.usd)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs text-slate-500">
              <span className="font-medium">{labels.ils}</span>
              <span className={`font-semibold ${toneClass(row.usd, 'text-slate-700')}`}>
                {row.signed ? formatSignedIls(row.ils) : formatIls(row.ils)}
              </span>
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

  const chartData = useMemo<ChartDatum[]>(() => {
    if (!data.length) {
      return [];
    }

    return data.map((point, index) => {
      const previous = data[index - 1];
      const currentNet = point.netPnLUsd ?? point.totalPnLUsd ?? 0;
      const previousNet = previous ? previous.netPnLUsd ?? previous.totalPnLUsd ?? 0 : currentNet;
      const changeUsd = index === 0 ? 0 : currentNet - previousNet;
      const changePercent = previousNet !== 0 ? (changeUsd / Math.abs(previousNet)) * 100 : 0;

      return {
        ...point,
        changeUsd,
        changePercent,
      };
    });
  }, [data]);

  const usdFormatter = (value: number) => formatCurrency(value, 'USD', locale);
  const ilsFormatter = (value: number) => formatCurrency(value, 'ILS', locale);
  const formatSignedUsd = (value: number) => (value > 0 ? `+${usdFormatter(value)}` : usdFormatter(value));
  const formatSignedIls = (value: number) => (value > 0 ? `+${ilsFormatter(value)}` : ilsFormatter(value));
  const formatSignedPercentValue = (value: number) =>
    value > 0 ? `+${formatPercent(value, locale)}` : formatPercent(value, locale);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [localeCode]
  );

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
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

  const [activeDatum, setActiveDatum] = useState<ChartDatum | null>(null);

  const { bestPoint, worstPoint } = useMemo(() => {
    if (!data.length) {
      return { bestPoint: null, worstPoint: null };
    }

    return data.reduce(
      (acc, point) => {
        const pointValue = point.netPnLUsd ?? point.totalPnLUsd ?? 0;
        const bestValue = acc.bestPoint
          ? acc.bestPoint.netPnLUsd ?? acc.bestPoint.totalPnLUsd ?? Number.NEGATIVE_INFINITY
          : Number.NEGATIVE_INFINITY;
        if (!acc.bestPoint || pointValue > bestValue) {
          acc.bestPoint = point;
        }

        const worstValue = acc.worstPoint
          ? acc.worstPoint.netPnLUsd ?? acc.worstPoint.totalPnLUsd ?? Number.POSITIVE_INFINITY
          : Number.POSITIVE_INFINITY;
        if (!acc.worstPoint || pointValue < worstValue) {
          acc.worstPoint = point;
        }

        return acc;
      },
      { bestPoint: null as PortfolioTimelinePoint | null, worstPoint: null as PortfolioTimelinePoint | null }
    );
  }, [data]);

  const handleMouseMove = useCallback(
    (state: { isTooltipActive?: boolean; activePayload?: { payload: ChartDatum }[] } | undefined) => {
      if (state?.isTooltipActive && state.activePayload?.length) {
        setActiveDatum(state.activePayload[0].payload);
        return;
      }

      setActiveDatum(null);
    },
    []
  );

  const latestDatum = chartData[chartData.length - 1];
  const snapshotDatum = activeDatum ?? latestDatum ?? null;

  const snapshot = snapshotDatum
    ? {
        date: new Date(snapshotDatum.timestamp),
        netUsd: snapshotDatum.netPnLUsd ?? snapshotDatum.totalPnLUsd ?? summary.totalNetPnLUsd,
        netIls:
          snapshotDatum.netPnLIls ??
          snapshotDatum.totalPnLIls ??
          (snapshotDatum.netPnLUsd ?? snapshotDatum.totalPnLUsd ?? summary.totalNetPnLUsd) * summary.usdToIlsRate,
        expectedUsd: snapshotDatum.expectedNetPnLUsd ?? summary.totalProjectedPnLUsd,
        expectedIls:
          snapshotDatum.expectedNetPnLIls ??
          (snapshotDatum.expectedNetPnLUsd ?? summary.totalProjectedPnLUsd) * summary.usdToIlsRate,
        openUsd: snapshotDatum.totalPnLUsd ?? summary.totalCurrentPnLUsd - summary.totalRealizedProfitUsd,
        openIls:
          snapshotDatum.totalPnLIls ??
          (snapshotDatum.totalPnLUsd ?? summary.totalCurrentPnLUsd - summary.totalRealizedProfitUsd) * summary.usdToIlsRate,
        changeUsd: snapshotDatum.changeUsd,
        changePercent: snapshotDatum.changePercent,
      }
    : {
        date: null,
        netUsd: summary.totalNetPnLUsd,
        netIls: summary.totalNetPnLIls,
        expectedUsd: summary.totalProjectedPnLUsd,
        expectedIls: summary.totalProjectedPnLIls,
        openUsd: summary.totalCurrentPnLUsd - summary.totalRealizedProfitUsd,
        openIls: summary.totalCurrentPnLIls - summary.totalRealizedProfitIls,
        changeUsd: 0,
        changePercent: 0,
      };

  const realizedPnLUsd = summary.totalRealizedProfitUsd;
  const realizedPnLIls = summary.totalRealizedProfitIls;
  const taxesUsd = summary.totalTaxesPaidUsd;
  const taxesIls = summary.totalTaxesPaidIls;
  const projectedPnLUsd = summary.totalProjectedPnLUsd;
  const projectedPnLIls = summary.totalProjectedPnLIls;

  const snapshotDateLabel = snapshot.date ? dateFormatter.format(snapshot.date) : '—';
  const snapshotTimeLabel = snapshot.date ? timeFormatter.format(snapshot.date) : '—';
  const deltaUsd = snapshot.netUsd - snapshot.expectedUsd;
  const deltaIls = snapshot.netIls - snapshot.expectedIls;

  const toneClass = (value: number, neutral: string) =>
    value > 0 ? 'text-emerald-600' : value < 0 ? 'text-rose-600' : neutral;
  const badgeClass = (value: number) =>
    value > 0 ? 'bg-emerald-50 text-emerald-600' : value < 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-600';

  const formattedBestDate = bestPoint ? dateFormatter.format(new Date(bestPoint.timestamp)) : '—';
  const formattedBestValueUsd = bestPoint ? usdFormatter(bestPoint.netPnLUsd ?? bestPoint.totalPnLUsd) : '—';
  const formattedBestValueIls = bestPoint
    ? ilsFormatter(
        bestPoint.netPnLIls ??
          bestPoint.totalPnLIls ??
          (bestPoint.totalPnLUsd ?? 0) * summary.usdToIlsRate
      )
    : '—';
  const formattedWorstDate = worstPoint ? dateFormatter.format(new Date(worstPoint.timestamp)) : '—';
  const formattedWorstValueUsd = worstPoint ? usdFormatter(worstPoint.netPnLUsd ?? worstPoint.totalPnLUsd) : '—';
  const formattedWorstValueIls = worstPoint
    ? ilsFormatter(
        worstPoint.netPnLIls ??
          worstPoint.totalPnLIls ??
          (worstPoint.totalPnLUsd ?? 0) * summary.usdToIlsRate
      )
    : '—';

  return (
    <Card className="overflow-hidden border-none bg-gradient-to-br from-white via-sky-50 to-indigo-50 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
      <CardHeader className="border-b border-white/60 bg-white/60 backdrop-blur-sm">
        <CardTitle className="text-lg font-semibold text-slate-900">
          {t.dashboard.portfolioOverviewTitle}
        </CardTitle>
        <p className="text-sm text-slate-500">{t.dashboard.portfolioOverviewDescription}</p>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {activeDatum ? t.app.updated : t.dashboard.summaryTitle}
                </p>
                <div className="flex items-baseline gap-3">
                  <span className="text-lg font-semibold text-slate-900">{snapshotDateLabel}</span>
                  <span className="text-xs text-slate-500">{snapshotTimeLabel}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${badgeClass(deltaUsd)}`}>
                  {t.portfolio.performanceVsExpectedShort}
                  <span className="text-sm">{formatSignedUsd(deltaUsd)}</span>
                </span>
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${badgeClass(snapshot.changeUsd)}`}>
                  {t.dashboard.dailyChange}
                  <span className="text-sm">{formatSignedUsd(snapshot.changeUsd)}</span>
                </span>
              </div>
            </div>

            <div className="relative h-80 w-full overflow-hidden rounded-3xl border border-white/60 bg-gradient-to-br from-white via-sky-50 to-indigo-50">
              <div className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-gradient-to-b from-indigo-100/60 via-transparent to-transparent" />
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 24, right: 32, left: 0, bottom: 0 }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setActiveDatum(null)}
                >
                  <defs>
                    <linearGradient id="portfolioNetFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
                      <stop offset="55%" stopColor="#4F46E5" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="portfolioNetStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#2563EB" />
                      <stop offset="100%" stopColor="#4F46E5" />
                    </linearGradient>
                    <linearGradient id="portfolioExpectedStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#38BDF8" />
                      <stop offset="100%" stopColor="#0EA5E9" />
                    </linearGradient>
                    <linearGradient id="portfolioOpenStroke" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="rgba(14,116,144,0.6)" />
                      <stop offset="100%" stopColor="rgba(14,116,144,0.3)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 8" stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value: number) => dateFormatter.format(new Date(value))}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#475569', fontSize: 12 }}
                  />
                  <YAxis
                    orientation="right"
                    tickFormatter={(value: number) => compactFormatter.format(value)}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#475569', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: '4 4', stroke: 'rgba(79, 70, 229, 0.4)', strokeWidth: 1.5 }}
                    content={
                      <ChartTooltip
                        formatUsd={usdFormatter}
                        formatIls={ilsFormatter}
                        labelFormatter={(value) => dateFormatter.format(new Date(Number(value)))}
                        usdToIlsRate={summary.usdToIlsRate}
                        labels={{
                          net: t.dashboard.netPnL,
                          expected: t.dashboard.projectedPnL,
                          current: t.dashboard.currentPnL,
                          delta: t.portfolio.performanceVsExpectedShort,
                          usd: t.dashboard.usdLabel,
                          ils: t.dashboard.ilsLabel,
                        }}
                      />
                    }
                  />
                  <ReferenceLine y={0} stroke="rgba(15, 23, 42, 0.18)" strokeDasharray="6 6" />
                  <Line
                    type="monotone"
                    dataKey="expectedNetPnLUsd"
                    stroke="url(#portfolioExpectedStroke)"
                    strokeWidth={2.5}
                    strokeDasharray="6 6"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalPnLUsd"
                    stroke="url(#portfolioOpenStroke)"
                    strokeWidth={1.5}
                    strokeDasharray="4 6"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="netPnLUsd"
                    stroke="url(#portfolioNetStroke)"
                    strokeWidth={3}
                    fill="url(#portfolioNetFill)"
                    fillOpacity={1}
                    dot={false}
                    activeDot={{ r: 6, strokeWidth: 0, fill: '#312E81' }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/80 p-5 shadow-inner">
            <div>
              <p className="text-sm font-semibold text-slate-600">{t.dashboard.summaryTitle}</p>
              <p className="text-xs text-slate-500">
                {snapshot.date ? `${snapshotDateLabel} · ${snapshotTimeLabel}` : t.portfolio.timelineEmpty}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-gradient-to-br from-slate-900/5 to-slate-900/0 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.dashboard.netPnL}
                </p>
                <p className={`mt-2 text-2xl font-semibold ${toneClass(snapshot.netUsd, 'text-slate-900')}`}>
                  {usdFormatter(snapshot.netUsd)}
                </p>
                <p className="text-xs text-slate-500">{ilsFormatter(snapshot.netIls)}</p>
              </div>
              <div className="rounded-xl border border-dashed border-sky-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.portfolio.expectedProfitLabel}
                </p>
                <p className="mt-2 text-xl font-semibold text-slate-900">{usdFormatter(snapshot.expectedUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(snapshot.expectedIls)}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.dashboard.currentPnL}
                </p>
                <p className="mt-2 text-base font-semibold text-slate-900">{usdFormatter(snapshot.openUsd)}</p>
                <p className="text-xs text-slate-500">{ilsFormatter(snapshot.openIls)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.dashboard.dailyChange}
                </p>
                <p className={`mt-2 text-xl font-semibold ${toneClass(snapshot.changeUsd, 'text-slate-900')}`}>
                  {formatSignedUsd(snapshot.changeUsd)}
                </p>
                <p className={`text-xs font-semibold ${toneClass(snapshot.changeUsd, 'text-slate-500')}`}>
                  {formatSignedPercentValue(snapshot.changePercent)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-gradient-to-br from-emerald-50/80 via-white to-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {t.dashboard.bestPnL}
                </p>
                <p className="mt-2 text-base font-semibold text-emerald-700">{formattedBestValueUsd}</p>
                <p className="text-xs text-emerald-600">{formattedBestValueIls}</p>
                <p className="text-xs text-emerald-500">{formattedBestDate}</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-rose-50/80 via-white to-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                  {t.dashboard.worstPnL}
                </p>
                <p className="mt-2 text-base font-semibold text-rose-600">{formattedWorstValueUsd}</p>
                <p className="text-xs text-rose-500">{formattedWorstValueIls}</p>
                <p className="text-xs text-rose-400">{formattedWorstDate}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">
                  {t.dashboard.realizedPnL}
                </p>
                <p className="mt-2 text-base font-semibold text-emerald-700">
                  {formatSignedUsd(realizedPnLUsd)}
                </p>
                <p className="text-xs text-emerald-600">{formatSignedIls(realizedPnLIls)}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                  {t.dashboard.taxesPaid}
                </p>
                <p className="mt-2 text-base font-semibold text-rose-600">{formatSignedUsd(taxesUsd * -1)}</p>
                <p className="text-xs text-rose-500">{formatSignedIls(taxesIls * -1)}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  {t.dashboard.projectedPnL}
                </p>
                <p className="mt-2 text-base font-semibold text-blue-700">{formatSignedUsd(projectedPnLUsd)}</p>
                <p className="text-xs text-blue-600">{formatSignedIls(projectedPnLIls)}</p>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  {t.portfolio.performanceVsExpectedShort}
                </p>
                <p className={`mt-2 text-base font-semibold ${toneClass(deltaUsd, 'text-slate-900')}`}>
                  {formatSignedUsd(deltaUsd)}
                </p>
                <p className={`text-xs font-semibold ${toneClass(deltaUsd, 'text-slate-500')}`}>
                  {formatSignedIls(deltaIls)}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-gradient-to-r from-sky-100/90 via-white/90 to-indigo-100/60 p-4 text-sm text-slate-600">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.dashboard.portfolioOverviewFootnote}
              </p>
              <p className="mt-2 leading-relaxed">
                {t.dashboard.portfolioOverviewSummary(
                  usdFormatter(snapshot.openUsd),
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
