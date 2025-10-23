'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  AreaChart,
  Area,
} from 'recharts';
import type { DefaultLegendContentProps, TooltipProps as RechartsTooltipProps } from 'recharts';

import { Card, CardBody, CardHeader } from '@heroui/react';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency, formatPercent } from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary, PortfolioTimelinePoint } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
  timeline: PortfolioTimelinePoint[];
}

const COLORS = ['#2563EB', '#0EA5E9', '#22C55E', '#8B5CF6', '#F97316', '#F59E0B', '#EC4899'];

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
    <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm shadow-xl backdrop-blur-lg">
      {resolvedLabel && (
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{resolvedLabel}</p>
      )}
      <div className="mt-2 space-y-1">
        {payload.map((item) => {
          if (!item || item.value === undefined || item.value === null) {
            return null;
          }

          const numericValue = typeof item.value === 'number' ? item.value : Number(item.value);

          return (
            <div key={item.dataKey?.toString()} className="flex items-center gap-2 text-slate-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: item.color ?? 'var(--fallback-color, #2563EB)' }}
              />
              <span className="text-xs font-medium sm:text-sm">{item.name}</span>
              <span className="ml-auto font-semibold text-slate-900">{valueFormatter(numericValue)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const renderLegend = ({ payload }: DefaultLegendContentProps) => {
  if (!payload?.length) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500 sm:text-sm">
      {payload.map((entry) => (
        <span key={entry.value} className="inline-flex items-center gap-2 rounded-full bg-slate-100/70 px-3 py-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
          <span>{entry.value}</span>
        </span>
      ))}
    </div>
  );
};

export function PortfolioVisualizations({ metrics, summary, timeline }: PortfolioVisualizationsProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);

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
  const shortDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        month: 'short',
        day: 'numeric',
      }),
    [localeCode]
  );
  const fullDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    [localeCode]
  );

  const performanceData = useMemo(() => {
    if (!timeline.length) {
      return [];
    }

    return timeline.map((point) => ({
      timestamp: point.timestamp,
      actual: currency === 'ILS' ? point.netPnLIls : point.netPnLUsd,
      expected: currency === 'ILS' ? point.expectedNetPnLIls : point.expectedNetPnLUsd,
    }));
  }, [currency, timeline]);

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
  const areaTooltipFormatter = (value: number) => formatValue(value ?? 0);

  if (!metrics.length || !summary) {
    return null;
  }

  const hasPerformanceData = performanceData.length > 0;
  const hasMovers = topMovers.gainers.length > 0 || topMovers.losers.length > 0;
  const hasHoldingData = holdingPeriodData.some((item) => item.value > 0);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 text-white shadow-2xl xl:col-span-7">
        <CardHeader className="relative z-10 space-y-2 p-6 pb-0">
          <h3 className="text-lg font-semibold text-white">
            {t.dashboard.performanceTrendTitle}
          </h3>
          <p className="text-sm text-white/70">{t.dashboard.performanceTrendDescription}</p>
        </CardHeader>
        <CardBody className="relative z-10 h-80 p-6 pt-4">
          {!hasPerformanceData ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/60">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="performanceActualGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.15} />
                  </linearGradient>
                  <linearGradient id="performanceExpectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.85} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.12} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.2)" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['auto', 'auto']}
                  tickFormatter={(value) => shortDateFormatter.format(new Date(Number(value)))}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#475569', fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(value) => compactNumber.format(value)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#475569', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ stroke: 'rgba(15, 23, 42, 0.15)', strokeWidth: 1 }}
                  content={
                    <ChartTooltip
                      valueFormatter={areaTooltipFormatter}
                      labelFormatter={(value) => fullDateFormatter.format(new Date(Number(value)))}
                    />
                  }
                />
                <Legend verticalAlign="bottom" align="center" content={renderLegend} />
                <Area
                  type="monotone"
                  dataKey="actual"
                  stroke="#2563EB"
                  fill="url(#performanceActualGradient)"
                  strokeWidth={2}
                  name={t.dashboard.performanceTrendActual}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="expected"
                  stroke="#8B5CF6"
                  fill="url(#performanceExpectedGradient)"
                  strokeWidth={2}
                  name={t.dashboard.performanceTrendExpected}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 text-white shadow-2xl xl:col-span-5">
        <CardHeader className="relative z-10 space-y-2 p-6 pb-0">
          <h3 className="text-lg font-semibold text-white">
            {t.dashboard.topMoversTitle}
          </h3>
          <p className="text-sm text-white/70">{t.dashboard.topMoversDescription}</p>
        </CardHeader>
        <CardBody className="relative z-10 space-y-6 p-6 pt-4">
          {!hasMovers ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/20 bg-white/5 py-12 text-center text-sm text-white/60">
              <ArrowUpRight className="h-5 w-5 text-white/50" />
              <p>{t.dashboard.topMoversEmpty}</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                  {t.dashboard.topMoversGainers}
                </p>
                <div className="mt-3 space-y-3">
                  {topMovers.gainers.map((item) => (
                    <div key={`gainer-${item.symbol}`} className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 backdrop-blur-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{item.display}</p>
                          <p className="text-xs text-white/60">{item.symbol}</p>
                        </div>
                        <span className="text-sm font-semibold text-emerald-200">
                          {formatCurrency(item.changeValue, settings.currency, locale)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-emerald-200/80">
                        {formatPercent(item.changePercent ?? 0, locale)} {t.dashboard.dailyChange}
                      </p>
                    </div>
                  ))}
                  {topMovers.gainers.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm text-white/60">
                      {t.dashboard.topMoversNoData}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">
                  {t.dashboard.topMoversLosers}
                </p>
                <div className="mt-3 space-y-3">
                  {topMovers.losers.map((item) => (
                    <div key={`loser-${item.symbol}`} className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 backdrop-blur-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">{item.display}</p>
                          <p className="text-xs text-white/60">{item.symbol}</p>
                        </div>
                        <span className="text-sm font-semibold text-rose-200">
                          {formatCurrency(item.changeValue, settings.currency, locale)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-rose-200/80">
                        {formatPercent(item.changePercent ?? 0, locale)} {t.dashboard.dailyChange}
                      </p>
                    </div>
                  ))}
                  {topMovers.losers.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-white/20 bg-white/5 px-4 py-3 text-sm text-white/60">
                      {t.dashboard.topMoversNoData}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 text-white shadow-2xl xl:col-span-6">
        <CardHeader className="relative z-10 space-y-2 p-6 pb-0">
          <h3 className="text-lg font-semibold text-white">
            {t.dashboard.allocationChart}
          </h3>
          <p className="text-sm text-white/70">{t.dashboard.allocationDescription}</p>
        </CardHeader>
        <CardBody className="relative z-10 h-80 p-6 pt-4">
          {allocationData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/60">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {allocationData.map((entry, index) => (
                    <linearGradient
                      key={entry.symbol}
                      id={`allocationGradient-${entry.symbol}`}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="100%"
                    >
                      <stop offset="0%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.6} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={allocationData}
                  dataKey="value"
                  nameKey="display"
                  innerRadius={70}
                  outerRadius={115}
                  paddingAngle={4}
                  cornerRadius={8}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {allocationData.map((entry, index) => (
                    <Cell key={entry.symbol} fill={`url(#allocationGradient-${entry.symbol})`} />
                  ))}
                </Pie>
                <Tooltip
                  cursor={{ fill: 'rgba(37, 99, 235, 0.05)' }}
                  content={
                    <ChartTooltip
                      valueFormatter={pieTooltipFormatter}
                      labelFormatter={(value) => value?.toString?.() ?? ''}
                    />
                  }
                />
                <Legend verticalAlign="bottom" align="center" content={renderLegend} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 text-white shadow-2xl xl:col-span-6">
        <CardHeader className="relative z-10 space-y-2 p-6 pb-0">
          <h3 className="text-lg font-semibold text-white">
            {t.dashboard.pnlChart}
          </h3>
          <p className="text-sm text-white/70">{t.dashboard.pnlDescription}</p>
        </CardHeader>
        <CardBody className="relative z-10 h-80 p-6 pt-4">
          {pnlData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm text-white/60">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlData} barGap={12} barCategoryGap="18%">
                <defs>
                  <linearGradient id="pnlCurrentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.95} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="pnlProjectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.95} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.25)" />
                <XAxis
                  dataKey="symbol"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  tickFormatter={(value) => compactNumber.format(value)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#475569', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={<ChartTooltip valueFormatter={barTooltipFormatter} />}
                />
                <Legend verticalAlign="bottom" align="center" content={renderLegend} />
                <Bar
                  dataKey="currentPnLDisplay"
                  name={t.dashboard.current}
                  fill="url(#pnlCurrentGradient)"
                  radius={[10, 10, 6, 6]}
                />
                <Bar
                  dataKey="projectedPnLDisplay"
                  name={t.dashboard.projected}
                  fill="url(#pnlProjectedGradient)"
                  radius={[10, 10, 6, 6]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <Card className="overflow-hidden border-0 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 text-white shadow-2xl xl:col-span-12">
        <CardHeader className="relative z-10 space-y-2 p-6 pb-0">
          <h3 className="text-lg font-semibold text-white">
            {t.dashboard.holdingPeriodTitle}
          </h3>
          <p className="text-sm text-white/70">{t.dashboard.holdingPeriodDescription}</p>
        </CardHeader>
        <CardBody className="relative z-10 space-y-6 p-6 pt-4">
          {!hasHoldingData ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 text-sm text-white/60">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={holdingPeriodData} layout="vertical" barCategoryGap="20%">
                    <defs>
                      <linearGradient id="holdingPeriodGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0.55} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.2)" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => compactNumber.format(value)}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#475569', fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      width={120}
                      tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(59, 130, 246, 0.08)' }}
                      content={
                        <ChartTooltip
                          valueFormatter={barTooltipFormatter}
                          labelFormatter={(value) => value?.toString?.() ?? ''}
                        />
                      }
                    />
                  <Bar dataKey="value" fill="url(#holdingPeriodGradient)" radius={[0, 10, 10, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {holdingPeriodData.map((bucket) => (
                  <div
                    key={bucket.key}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-white/60">{bucket.label}</p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      {formatValue(bucket.value)}
                    </p>
                    <p className="text-xs text-white/60">{formatPercent(bucket.percentage, locale)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
