'use client';

import { ReactNode, useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Label,
  Tooltip,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  ReferenceLine,
} from 'recharts';
import type { TooltipProps as RechartsTooltipProps } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency, formatPercent } from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const COLORS = [
  'var(--color-primary-500)',
  'var(--color-primary-300)',
  'var(--color-green-500)',
  'var(--color-purple-500)',
  'var(--color-orange-500)',
  'var(--color-amber-500)',
  'var(--color-pink-500)',
];

type TooltipValueType = number | string;

interface ChartTooltipProps extends RechartsTooltipProps<TooltipValueType, string> {
  valueFormatter: (value: number) => string;
  labelFormatter?: (label: TooltipValueType) => string;
}

const ChartTooltip = ({ active, payload, label, valueFormatter, labelFormatter }: ChartTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const resolvedLabel = labelFormatter ? labelFormatter(label ?? '') : label;

  return (
    <div className="w-[min(18rem,calc(100vw-1rem))] rounded-2xl border border-[color:var(--color-slate-200)] bg-white px-3.5 py-3 text-sm shadow-sm sm:px-4 sm:py-3.5">
      {resolvedLabel && (
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-slate-500)]">{resolvedLabel}</p>
      )}
      <div className="mt-2 space-y-1">
        {payload.map((item) => {
          if (!item || item.value === undefined || item.value === null) {
            return null;
          }

          const numericValue = typeof item.value === 'number' ? item.value : Number(item.value);

          return (
            <div key={item.dataKey?.toString()} className="flex items-center gap-2 text-[var(--color-slate-600)]">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: item.color ?? 'var(--fallback-color, var(--color-primary-500))' }}
              />
              <span className="text-xs font-medium sm:text-sm">{item.name}</span>
              <span className="ml-auto font-semibold text-[var(--color-primary-800)]">{valueFormatter(numericValue)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const EmptyState = ({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) => (
  <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[color:var(--color-slate-200)] bg-gradient-to-br from-white to-slate-50 px-5 py-9 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:min-h-48 sm:px-6 sm:py-10">
    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-[var(--color-slate-500)]">
      {icon}
    </div>
    <div className="space-y-1">
      <p className="text-balance text-sm font-semibold text-[var(--color-primary-900)]">{title}</p>
      <p className="text-balance text-sm leading-6 text-[var(--color-slate-500)]">{description}</p>
    </div>
  </div>
);

export function PortfolioVisualizations({ metrics, summary }: PortfolioVisualizationsProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const isRtl = locale === 'he';
  const withRtlMark = (value: TooltipValueType) => {
    const text = value?.toString?.() ?? '';
    return isRtl ? `\u200F${text}` : text;
  };

  const allocationData = useMemo(() => {
    if (!summary) {
      return [];
    }

    return buildPortfolioAllocation(metrics, summary.usdToIlsRate).map((item) => ({
      ...item,
      value: settings.currency === 'ILS' ? item.valueIls : item.valueUsd,
    }));
  }, [metrics, settings.currency, summary]);

  const pnlData = useMemo(() => {
    const activeMetrics = metrics.filter((metric) => metric.position.quantity !== 0);
    if (!activeMetrics.length) {
      return [];
    }

    const rate = summary?.usdToIlsRate ?? 0;
    const toDisplay = settings.currency === 'ILS'
      ? (value: number) => value * rate
      : (value: number) => value;

    return buildPortfolioPnL(activeMetrics).map((item) => ({
      ...item,
      currentPnLDisplay: toDisplay(item.currentPnLUsd),
      projectedPnLDisplay: toDisplay(item.projectedPnLUsd),
    }));
  }, [metrics, settings.currency, summary?.usdToIlsRate]);

  const currency = settings.currency;
  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const formatValue = (value: number) => formatCurrency(value, currency, locale);
  const compactNumber = new Intl.NumberFormat(localeCode, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const topMovers = useMemo(() => {
    if (!summary) {
      return { gainers: [], losers: [] };
    }

    const conversionRate = settings.currency === 'ILS' ? summary.usdToIlsRate : 1;

    const entries = metrics
      .filter((metric) => typeof metric.dailyChange === 'number' && metric.position.quantity > 0)
      .map((metric) => {
        const changeUsd = (metric.dailyChange ?? 0) * metric.position.quantity;
        return {
          symbol: metric.position.symbol,
          display: metric.position.display,
          changeValue: changeUsd * conversionRate,
          changePercent: metric.dailyChangePercent,
        };
      });

    const gainers = entries
      .filter((item) => item.changeValue > 0)
      .sort((a, b) => b.changeValue - a.changeValue)
      .slice(0, 3);

    const losers = entries
      .filter((item) => item.changeValue < 0)
      .sort((a, b) => a.changeValue - b.changeValue)
      .slice(0, 3);

    return { gainers, losers };
  }, [metrics, settings.currency, summary]);

  const holdingPeriodData = useMemo(() => {
    if (!summary) {
      return [];
    }

    const conversionRate = settings.currency === 'ILS' ? summary.usdToIlsRate : 1;

    const buckets = [
      { key: 'short', label: t.dashboard.holdingPeriodShort, min: 0, max: 1 },
      { key: 'medium', label: t.dashboard.holdingPeriodMedium, min: 1, max: 3 },
      { key: 'long', label: t.dashboard.holdingPeriodLong, min: 3, max: Number.POSITIVE_INFINITY },
    ] as const;

    const totals = buckets.map((bucket) => {
      const bucketValueUsd = metrics
        .filter(
          (metric) =>
            metric.position.quantity > 0 &&
            metric.yearsHeld >= bucket.min &&
            metric.yearsHeld < bucket.max
        )
        .reduce((sum, metric) => sum + metric.currentValue, 0);

      const bucketValue = bucketValueUsd * conversionRate;

      return {
        key: bucket.key,
        label: bucket.label,
        value: bucketValue,
      };
    });

    const totalValue = totals.reduce((acc, item) => acc + item.value, 0);

    return totals.map((item) => ({
      ...item,
      percentage: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
    }));
  }, [metrics, settings.currency, summary, t]);

  const pieTooltipFormatter = (value: number) => formatValue(value ?? 0);
  const barTooltipFormatter = (value: number) => formatValue(value ?? 0);
  const totalAllocationValue = useMemo(
    () => allocationData.reduce((sum, item) => sum + item.value, 0),
    [allocationData]
  );
  const allocationLegendData = useMemo(
    () =>
      allocationData.map((item) => ({
        ...item,
        percentage: totalAllocationValue > 0 ? (item.value / totalAllocationValue) * 100 : 0,
      })),
    [allocationData, totalAllocationValue]
  );
  const pnlSnapshot = useMemo(() => {
    const totals = pnlData.reduce(
      (acc, item) => {
        acc.current += item.currentPnLDisplay;
        acc.projected += item.projectedPnLDisplay;
        return acc;
      },
      { current: 0, projected: 0 }
    );

    const currentPositive = pnlData.filter((item) => item.currentPnLDisplay >= 0).length;
    const projectedPositive = pnlData.filter((item) => item.projectedPnLDisplay >= 0).length;

    return {
      ...totals,
      currentPositive,
      projectedPositive,
      total: pnlData.length,
    };
  }, [pnlData]);
  const pnlDomain = useMemo(() => {
    if (pnlData.length === 0) {
      return [-1, 1] as [number, number];
    }

    const maxAbs = pnlData.reduce((max, item) => {
      const currentAbs = Math.abs(item.currentPnLDisplay);
      const projectedAbs = Math.abs(item.projectedPnLDisplay);
      return Math.max(max, currentAbs, projectedAbs);
    }, 0);

    const padded = Math.max(maxAbs * 1.18, 1);
    return [-padded, padded] as [number, number];
  }, [pnlData]);

  if (!metrics.length || !summary) {
    return null;
  }

  const hasMovers = topMovers.gainers.length > 0 || topMovers.losers.length > 0;
  const hasHoldingData = holdingPeriodData.some((item) => item.value > 0);
  const holdingPeriodTotal = holdingPeriodData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:gap-8">
      <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)] bg-white shadow-sm">
        <CardHeader className="space-y-3 border-b border-[color:var(--color-slate-200)] bg-slate-50 px-4 py-5 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-balance text-lg font-bold tracking-tight text-[var(--color-primary-900)]">
                {t.dashboard.topMoversTitle}
              </CardTitle>
              <p className="text-balance text-sm text-[var(--color-slate-500)]">{t.dashboard.topMoversDescription}</p>
            </div>
            <div className="flex max-w-full flex-wrap gap-2">
              <span className="inline-flex max-w-full items-center rounded-full border border-emerald-200/85 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold leading-tight text-emerald-700">
                {topMovers.gainers.length} {t.dashboard.topMoversPositiveLabel}
              </span>
              <span className="inline-flex max-w-full items-center rounded-full border border-rose-200/85 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold leading-tight text-rose-700">
                {topMovers.losers.length} {t.dashboard.topMoversNegativeLabel}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 px-4 py-4 sm:px-5">
          {!hasMovers ? (
            <EmptyState
              icon={<ArrowUpRight className="h-5 w-5" />}
              title={t.dashboard.topMoversEmpty}
              description={t.dashboard.topMoversNoData}
            />
          ) : (
            <div className="grid gap-4">
              <div className="space-y-2.5 rounded-3xl border border-emerald-100/80 bg-emerald-50/40 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[var(--color-slate-700)]">{t.dashboard.topMoversGainers}</h4>
                  <span className="rounded-full border border-emerald-200/85 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    {t.dashboard.topMoversPositiveLabel}
                  </span>
                </div>
                {topMovers.gainers.map((item, index) => (
                  <div
                    key={`gainer-${item.symbol}-${index}`}
                    className="rounded-2xl border border-emerald-100 bg-white px-3.5 py-3 shadow-sm sm:px-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className={`min-w-0 flex-1 ${isRtl ? 'text-right' : 'text-left'}`}>
                        <p className="text-balance text-[clamp(1rem,3.5vw,1.125rem)] leading-tight font-semibold tracking-tight text-[var(--color-primary-900)] sm:text-xl">{item.display}</p>
                        <p className="mt-1 text-xs font-medium tracking-wide text-[var(--color-slate-500)]">{item.symbol}</p>
                      </div>
                      <div className="flex w-full items-center justify-between gap-3 sm:w-28 sm:flex-none sm:flex-col sm:items-center sm:justify-center sm:text-center">
                        <p className="text-[clamp(1rem,2.2vw,1.125rem)] leading-none font-bold text-emerald-700">{formatValue(item.changeValue)}</p>
                        {typeof item.changePercent === 'number' && Number.isFinite(item.changePercent) && (
                          <p className="mt-1 text-sm font-semibold text-emerald-600">
                            {formatPercent(item.changePercent, locale)}
                          </p>
                        )}
                      </div>
                      <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 sm:flex">
                        <ArrowUpRight className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                ))}
                {topMovers.gainers.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[var(--color-slate-200)] bg-white/80 px-4 py-4 text-center text-sm text-[var(--color-slate-500)]">
                    {t.dashboard.topMoversNoData}
                  </div>
                )}
              </div>

              <div className="space-y-2.5 rounded-3xl border border-rose-100/80 bg-rose-50/40 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-[var(--color-slate-700)]">{t.dashboard.topMoversLosers}</h4>
                  <span className="rounded-full border border-rose-200/85 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
                    {t.dashboard.topMoversNegativeLabel}
                  </span>
                </div>
                {topMovers.losers.map((item, index) => (
                  <div
                    key={`loser-${item.symbol}-${index}`}
                    className="rounded-2xl border border-rose-100 bg-white px-3.5 py-3 shadow-sm sm:px-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className={`min-w-0 flex-1 ${isRtl ? 'text-right' : 'text-left'}`}>
                        <p className="text-balance text-[clamp(1rem,3.5vw,1.125rem)] leading-tight font-semibold tracking-tight text-[var(--color-primary-900)] sm:text-xl">{item.display}</p>
                        <p className="mt-1 text-xs font-medium tracking-wide text-[var(--color-slate-500)]">{item.symbol}</p>
                      </div>
                      <div className="flex w-full items-center justify-between gap-3 sm:w-28 sm:flex-none sm:flex-col sm:items-center sm:justify-center sm:text-center">
                        <p className="text-[clamp(1rem,2.2vw,1.125rem)] leading-none font-bold text-rose-700">{formatValue(item.changeValue)}</p>
                        {typeof item.changePercent === 'number' && Number.isFinite(item.changePercent) && (
                          <p className="mt-1 text-sm font-semibold text-rose-600">
                            {formatPercent(item.changePercent, locale)}
                          </p>
                        )}
                      </div>
                      <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 sm:flex">
                        <ArrowDownRight className="h-5 w-5" />
                      </div>
                    </div>
                  </div>
                ))}
                {topMovers.losers.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[var(--color-slate-200)] bg-white/80 px-4 py-4 text-center text-sm text-[var(--color-slate-500)]">
                    {t.dashboard.topMoversNoData}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)] bg-white shadow-sm">
        <CardHeader className="space-y-3 border-b border-[color:var(--color-slate-200)] bg-slate-50 px-4 py-5 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-balance text-lg font-semibold text-[var(--color-primary-900)]">
              {t.dashboard.holdingPeriodTitle}
            </CardTitle>
            <span className="rounded-full border border-[color:var(--color-slate-200)] bg-white px-3 py-1 text-xs font-semibold text-[var(--color-primary-700)]">
              {formatValue(holdingPeriodTotal)}
            </span>
          </div>
          <p className="text-balance text-sm text-[var(--color-slate-500)]">{t.dashboard.holdingPeriodDescription}</p>
        </CardHeader>
        <CardContent className="space-y-5 px-4 py-4 sm:px-5">
          {!hasHoldingData ? (
            <EmptyState
              icon={<ArrowUpRight className="h-5 w-5" />}
              title={t.dashboard.emptyChart}
              description={t.dashboard.holdingPeriodDescription}
            />
          ) : (
            <>
              <div className="h-[clamp(16rem,28vw,18rem)] w-full rounded-3xl border border-[color:var(--color-slate-200)] bg-gradient-to-br from-slate-50 to-white px-2 py-2 shadow-inner">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={holdingPeriodData} layout="vertical" barCategoryGap="26%" margin={{ top: 8, right: 16, bottom: 0, left: 12 }}>
                    <defs>
                      <linearGradient id="holdingPeriodGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                        <stop offset="55%" stopColor="#3b82f6" stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0.78} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 5" stroke="rgba(var(--color-slate-400-rgb), 0.16)" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => compactNumber.format(value)}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'var(--color-slate-500)', fontSize: 12, fontWeight: 500 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tickFormatter={(value) => withRtlMark(value)}
                      tickLine={false}
                      axisLine={false}
                      width={132}
                      tickMargin={10}
                      interval={0}
                      tick={{ fill: 'var(--color-slate-700)', fontSize: 12, fontWeight: 700 }}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(var(--color-slate-200-rgb), 0.16)' }}
                      content={
                        <ChartTooltip
                          valueFormatter={barTooltipFormatter}
                          labelFormatter={withRtlMark}
                        />
                      }
                    />
                    <Bar dataKey="value" fill="url(#holdingPeriodGradient)" radius={[999, 999, 999, 999]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {holdingPeriodData.map((bucket) => (
                  <div
                    key={bucket.key}
                    className="rounded-2xl border border-[color:var(--color-slate-200)] bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-slate-500)]">{bucket.label}</p>
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          bucket.key === 'short'
                            ? 'bg-sky-400'
                            : bucket.key === 'medium'
                              ? 'bg-blue-500'
                              : 'bg-indigo-400'
                        }`}
                      />
                    </div>
                    <p className="mt-2 text-[clamp(1.25rem,3vw,1.6rem)] font-bold leading-none text-[var(--color-primary-900)]">
                      {formatValue(bucket.value)}
                    </p>
                    <p className="mt-1 text-sm font-medium text-[var(--color-slate-500)]">{formatPercent(bucket.percentage, locale)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)] bg-white shadow-sm">
        <CardHeader className="space-y-3 border-b border-[color:var(--color-slate-200)] bg-slate-50 px-4 py-5 sm:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle className="text-balance text-xl font-black tracking-tight text-[var(--color-primary-900)]">
              {t.dashboard.pnlChart}
            </CardTitle>
            <div className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-[color:var(--color-slate-200)] bg-white px-3 py-1.5 text-xs font-semibold leading-tight text-[var(--color-slate-600)]">
              <span className="h-2 w-2 rounded-full bg-[var(--color-primary-500)]" />
              {t.dashboard.current}
              <span className="mx-1 h-3 w-px bg-[color:var(--color-slate-200)]" />
              <span className="h-2 w-2 rounded-full bg-[var(--color-green-500)]" />
              {t.dashboard.projected}
            </div>
          </div>
          <p className="text-balance text-sm text-[var(--color-slate-500)]">{t.dashboard.pnlDescription}</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
              <p className="text-xs font-semibold text-emerald-700">{t.dashboard.current}</p>
              <p className="mt-1 text-lg font-black text-emerald-700">{formatValue(pnlSnapshot.current)}</p>
              <p className="text-xs text-emerald-600/90">
                {pnlSnapshot.currentPositive}/{pnlSnapshot.total}
              </p>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
              <p className="text-xs font-semibold text-sky-700">{t.dashboard.projected}</p>
              <p className="mt-1 text-lg font-black text-sky-700">{formatValue(pnlSnapshot.projected)}</p>
              <p className="text-xs text-sky-600/90">
                {pnlSnapshot.projectedPositive}/{pnlSnapshot.total}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4 sm:px-5">
          {pnlData.length === 0 ? (
            <EmptyState
              icon={<ArrowUpRight className="h-5 w-5" />}
              title={t.dashboard.emptyChart}
              description={t.dashboard.pnlDescription}
            />
          ) : (
            <div className="h-[clamp(18rem,32vw,22rem)] rounded-3xl border border-[color:var(--color-slate-200)] bg-gradient-to-br from-slate-50 to-white p-3 shadow-inner">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pnlData} barGap={6} barCategoryGap="20%" margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                  <defs>
                    <linearGradient id="pnlCurrentGainGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-primary-500)" stopOpacity={0.96} />
                      <stop offset="95%" stopColor="var(--color-primary-500)" stopOpacity={0.58} />
                    </linearGradient>
                    <linearGradient id="pnlCurrentLossGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-rose-500)" stopOpacity={0.95} />
                      <stop offset="95%" stopColor="var(--color-rose-500)" stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="pnlProjectedGainGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-green-500)" stopOpacity={0.95} />
                      <stop offset="95%" stopColor="var(--color-green-500)" stopOpacity={0.62} />
                    </linearGradient>
                    <linearGradient id="pnlProjectedLossGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-orange-500)" stopOpacity={0.92} />
                      <stop offset="95%" stopColor="var(--color-orange-500)" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 5" stroke="rgba(var(--color-slate-400-rgb), 0.2)" />
                  <ReferenceLine y={0} stroke="rgba(var(--color-slate-500-rgb), 0.45)" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="symbol"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    height={36}
                    tick={{ fill: 'var(--color-slate-700)', fontSize: 12, fontWeight: 700 }}
                  />
                  <YAxis
                    domain={pnlDomain}
                    tickFormatter={(value) => compactNumber.format(value)}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fill: 'var(--color-slate-600)', fontSize: 12, fontWeight: 500 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-overlay-navy-soft)' }}
                    content={<ChartTooltip valueFormatter={barTooltipFormatter} />}
                  />
                  <Bar
                    dataKey="currentPnLDisplay"
                    name={t.dashboard.current}
                    radius={[10, 10, 6, 6]}
                    maxBarSize={20}
                  >
                    {pnlData.map((entry, index) => (
                      <Cell
                        key={`current-bar-${entry.symbol}-${index}`}
                        fill={entry.currentPnLDisplay >= 0 ? 'url(#pnlCurrentGainGradient)' : 'url(#pnlCurrentLossGradient)'}
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="projectedPnLDisplay"
                    name={t.dashboard.projected}
                    radius={[10, 10, 6, 6]}
                    maxBarSize={20}
                  >
                    {pnlData.map((entry, index) => (
                      <Cell
                        key={`projected-bar-${entry.symbol}-${index}`}
                        fill={
                          entry.projectedPnLDisplay >= 0
                            ? 'url(#pnlProjectedGainGradient)'
                            : 'url(#pnlProjectedLossGradient)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[24px] border border-[color:var(--color-slate-200)] bg-white shadow-sm">
        <CardHeader className="space-y-3 border-b border-[color:var(--color-slate-200)] bg-slate-50 px-4 py-5 sm:px-5">
          <CardTitle className="text-balance text-lg font-semibold text-[var(--color-primary-900)]">
            {t.dashboard.allocationChart}
          </CardTitle>
          <p className="text-balance text-sm text-[var(--color-slate-500)]">{t.dashboard.allocationDescription}</p>
        </CardHeader>
        <CardContent className="space-y-5 px-4 py-4 sm:px-5">
          {allocationData.length === 0 ? (
            <EmptyState
              icon={<ArrowUpRight className="h-5 w-5" />}
              title={t.dashboard.emptyChart}
              description={t.dashboard.allocationDescription}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(16rem,0.92fr)] lg:items-start 2xl:gap-6">
              <div className="rounded-3xl border border-[color:var(--color-slate-200)] bg-gradient-to-br from-slate-50 to-white p-3 shadow-inner">
                <div className="h-[clamp(16rem,28vw,21rem)]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {allocationData.map((entry, index) => {
                          const gradientId = `allocationGradient-${entry.symbol}-${index}`;
                          return (
                            <linearGradient
                              key={gradientId}
                              id={gradientId}
                              x1="0%"
                              y1="0%"
                              x2="100%"
                              y2="100%"
                            >
                              <stop offset="0%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.95} />
                              <stop offset="100%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.6} />
                            </linearGradient>
                          );
                        })}
                      </defs>
                      <Pie
                        data={allocationData}
                        dataKey="value"
                        nameKey="display"
                        innerRadius={72}
                        outerRadius={120}
                        paddingAngle={3}
                        cornerRadius={11}
                        startAngle={90}
                        endAngle={-270}
                        stroke="var(--color-neutral-white)"
                        strokeWidth={3}
                      >
                        {allocationData.map((entry, index) => {
                          const gradientId = `allocationGradient-${entry.symbol}-${index}`;
                          return <Cell key={gradientId} fill={`url(#${gradientId})`} />;
                        })}
                        <Label
                          position="center"
                          content={() => (
                            <text
                              x="50%"
                              y="50%"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              direction={isRtl ? 'rtl' : 'ltr'}
                              style={{ unicodeBidi: 'plaintext' }}
                            >
                              <tspan x="50%" dy="-0.5em" className="fill-[var(--color-slate-500)] text-[11px] font-semibold">
                                {withRtlMark(t.dashboard.allocationChart)}
                              </tspan>
                              <tspan x="50%" dy="1.35em" className="fill-[var(--color-primary-900)] text-[15px] font-semibold">
                                {formatValue(totalAllocationValue)}
                              </tspan>
                            </text>
                          )}
                        />
                      </Pie>
                      <Tooltip
                        cursor={{ fill: 'rgba(var(--color-slate-200-rgb), 0.16)' }}
                        content={
                          <ChartTooltip
                            valueFormatter={pieTooltipFormatter}
                            labelFormatter={withRtlMark}
                          />
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                {allocationLegendData.map((entry, index) => (
                  <div
                    key={`allocation-legend-${entry.symbol}-${index}`}
                    className="flex flex-col gap-2.5 rounded-2xl border border-[color:var(--color-slate-200)] bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-start sm:gap-3"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-balance text-sm font-semibold leading-tight text-[var(--color-primary-900)]">{entry.display}</p>
                      <p className="mt-0.5 text-xs font-medium text-[var(--color-slate-500)]">{entry.symbol}</p>
                    </div>
                    <div className="sm:ml-auto sm:text-right">
                      <p className="text-xs font-semibold text-[var(--color-slate-700)]">{formatValue(entry.value)}</p>
                      <p className="text-xs text-[var(--color-slate-500)]">{formatPercent(entry.percentage, locale)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
