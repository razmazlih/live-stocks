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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

// צבעי הגרפים נמשכים מטוקני נושא כדי להישאר מסונכרנים עם מצב המערכת
const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--primary) / 0.24)',
  'hsl(var(--success))',
  'hsl(var(--info))',
  'hsl(var(--warning))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
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
    <div className="rounded-2xl border border-[var(--color-card-border)] bg-[var(--color-card-surface)] px-4 py-3 text-sm shadow-xl">
      {resolvedLabel && (
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{resolvedLabel}</p>
      )}
      <div className="mt-2 space-y-1">
        {payload.map((item) => {
          if (!item || item.value === undefined || item.value === null) {
            return null;
          }

          const numericValue = typeof item.value === 'number' ? item.value : Number(item.value);

          return (
            <div key={item.dataKey?.toString()} className="flex items-center gap-2 text-[hsl(var(--muted-foreground))]">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: item.color ?? 'var(--fallback-color, hsl(var(--primary)))' }}
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

const renderLegend = ({ payload }: DefaultLegendContentProps) => {
  if (!payload?.length) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium text-[hsl(var(--muted-foreground))] sm:text-sm">
      {payload.map((entry, index) => {
        const payloadInfo = entry.payload as { symbol?: string } | undefined;
        const legendKey = `${entry.dataKey ?? 'legend'}-${payloadInfo?.symbol ?? entry.value}-${index}`;
        return (
          <span
            key={legendKey}
            className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--muted))]/70 px-3 py-1"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
            <span>{entry.value}</span>
          </span>
        );
      })}
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
      <Card className="overflow-hidden border-[hsl(var(--card))]/60 bg-gradient-to-br from-[color:hsl(var(--card))]/95 via-[color:hsl(var(--card))]/80 to-[color:hsl(var(--card))]/60 shadow-2xl xl:col-span-7">
        <CardHeader className="space-y-2 border-b border-[hsl(var(--muted))]/60 bg-[hsl(var(--card))]/50">
          <CardTitle className="text-lg font-semibold text-[hsl(var(--primary))]">
            {t.dashboard.performanceTrendTitle}
          </CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{t.dashboard.performanceTrendDescription}</p>
        </CardHeader>
        <CardContent className="h-80">
          {!hasPerformanceData ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="performanceActualGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                  </linearGradient>
                  <linearGradient id="performanceExpectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--info))" stopOpacity={0.85} />
                    <stop offset="95%" stopColor="hsl(var(--info))" stopOpacity={0.12} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground) / 0.2)" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  domain={['auto', 'auto']}
                  tickFormatter={(value) => shortDateFormatter.format(new Date(Number(value)))}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis
                  tickFormatter={(value) => compactNumber.format(value)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--primary) / 0.15)', strokeWidth: 1 }}
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
                  stroke="hsl(var(--primary))"
                  fill="url(#performanceActualGradient)"
                  strokeWidth={2}
                  name={t.dashboard.performanceTrendActual}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="expected"
                  stroke="hsl(var(--info))"
                  fill="url(#performanceExpectedGradient)"
                  strokeWidth={2}
                  name={t.dashboard.performanceTrendExpected}
                  activeDot={{ r: 5, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-[hsl(var(--card))]/60 bg-gradient-to-br from-[color:hsl(var(--card))]/95 via-[color:hsl(var(--card))]/80 to-[color:hsl(var(--card))]/60 shadow-2xl xl:col-span-5">
        <CardHeader className="space-y-2 border-b border-[hsl(var(--muted))]/60 bg-[hsl(var(--card))]/50">
          <CardTitle className="text-lg font-semibold text-[hsl(var(--primary))]">
            {t.dashboard.topMoversTitle}
          </CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{t.dashboard.topMoversDescription}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasMovers ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
              <ArrowUpRight className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
              <p>{t.dashboard.topMoversEmpty}</p>
            </div>
          ) : (
            <div className="grid gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t.dashboard.topMoversGainers}</h4>
                  <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-medium text-success">
                    {t.dashboard.topMoversPositiveLabel}
                  </span>
                </div>
                {topMovers.gainers.map((item, index) => (
                  <div
                    key={`gainer-${item.symbol}-${index}`}
                    className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--muted))]/70 bg-[hsl(var(--card))]/70 p-3 shadow-sm"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20 text-success">
                      <ArrowUpRight className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[hsl(var(--primary))]">{item.display}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.symbol}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-semibold text-success">{formatValue(item.changeValue)}</p>
                      {typeof item.changePercent === 'number' && Number.isFinite(item.changePercent) && (
                        <p className="text-xs font-medium text-success">
                          {formatPercent(item.changePercent, locale)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {topMovers.gainers.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                    {t.dashboard.topMoversNoData}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">{t.dashboard.topMoversLosers}</h4>
                  <span className="rounded-full bg-overlay-rose-50 px-2.5 py-0.5 text-xs font-medium text-destructive">
                    {t.dashboard.topMoversNegativeLabel}
                  </span>
                </div>
                {topMovers.losers.map((item, index) => (
                  <div
                    key={`loser-${item.symbol}-${index}`}
                    className="flex items-center gap-3 rounded-2xl border border-[hsl(var(--muted))]/70 bg-[hsl(var(--card))]/70 p-3 shadow-sm"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-overlay-rose-50 text-destructive">
                      <ArrowDownRight className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[hsl(var(--primary))]">{item.display}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.symbol}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-semibold text-destructive">{formatValue(item.changeValue)}</p>
                      {typeof item.changePercent === 'number' && Number.isFinite(item.changePercent) && (
                        <p className="text-xs font-medium text-destructive">
                          {formatPercent(item.changePercent, locale)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {topMovers.losers.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/50 px-4 py-3 text-sm text-[hsl(var(--muted-foreground))]">
                    {t.dashboard.topMoversNoData}
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-[hsl(var(--card))]/60 bg-gradient-to-br from-[color:hsl(var(--card))]/95 via-[color:hsl(var(--card))]/80 to-[color:hsl(var(--card))]/60 shadow-2xl xl:col-span-6">
        <CardHeader className="space-y-2 border-b border-[hsl(var(--muted))]/60 bg-[hsl(var(--card))]/50">
          <CardTitle className="text-lg font-semibold text-[hsl(var(--primary))]">
            {t.dashboard.allocationChart}
          </CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{t.dashboard.allocationDescription}</p>
        </CardHeader>
        <CardContent className="h-80">
          {allocationData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t.dashboard.emptyChart}
            </div>
          ) : (
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
                  innerRadius={70}
                  outerRadius={115}
                  paddingAngle={4}
                  cornerRadius={8}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                >
                  {allocationData.map((entry, index) => {
                    const gradientId = `allocationGradient-${entry.symbol}-${index}`;
                    return <Cell key={gradientId} fill={`url(#${gradientId})`} />;
                  })}
                </Pie>
                <Tooltip
                  cursor={{ fill: 'var(--color-overlay-primary-soft)' }}
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
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-[hsl(var(--card))]/60 bg-gradient-to-br from-[color:hsl(var(--card))]/95 via-[color:hsl(var(--card))]/80 to-[color:hsl(var(--card))]/60 shadow-2xl xl:col-span-6">
        <CardHeader className="space-y-2 border-b border-[hsl(var(--muted))]/60 bg-[hsl(var(--card))]/50">
          <CardTitle className="text-lg font-semibold text-[hsl(var(--primary))]">
            {t.dashboard.pnlChart}
          </CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{t.dashboard.pnlDescription}</p>
        </CardHeader>
        <CardContent className="h-80">
          {pnlData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlData} barGap={12} barCategoryGap="18%">
                <defs>
                  <linearGradient id="pnlCurrentGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="pnlProjectedGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.95} />
                    <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground) / 0.25)" />
                <XAxis
                  dataKey="symbol"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  tickFormatter={(value) => compactNumber.format(value)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-overlay-navy-soft)' }}
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
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-[hsl(var(--card))]/60 bg-gradient-to-br from-[color:hsl(var(--card))]/95 via-[color:hsl(var(--card))]/80 to-[color:hsl(var(--card))]/60 shadow-2xl xl:col-span-12">
        <CardHeader className="space-y-2 border-b border-[hsl(var(--muted))]/60 bg-[hsl(var(--card))]/50">
          <CardTitle className="text-lg font-semibold text-[hsl(var(--primary))]">
            {t.dashboard.holdingPeriodTitle}
          </CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{t.dashboard.holdingPeriodDescription}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasHoldingData ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))]/60 text-sm text-[hsl(var(--muted-foreground))]">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={holdingPeriodData} layout="vertical" barCategoryGap="20%">
                    <defs>
                      <linearGradient id="holdingPeriodGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="hsl(var(--primary) / 0.24)" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--muted-foreground) / 0.2)" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => compactNumber.format(value)}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      width={120}
                      tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12, fontWeight: 600 }}
                    />
                    <Tooltip
                      cursor={{ fill: 'var(--color-overlay-sky-soft)' }}
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
                    className="rounded-2xl border border-[hsl(var(--muted))]/70 bg-[hsl(var(--card))]/70 p-4 shadow-inner"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{bucket.label}</p>
                    <p className="mt-2 text-sm font-semibold text-[hsl(var(--primary))]">
                      {formatValue(bucket.value)}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatPercent(bucket.percentage, locale)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
