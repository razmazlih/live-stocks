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
import { PositionMetrics, PortfolioSummary } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const COLORS = ['#2563EB', '#0EA5E9', '#22C55E', '#8B5CF6', '#F97316', '#F59E0B', '#EC4899'];

type TooltipValueType = number | string;

interface ChartTooltipProps extends RechartsTooltipProps<TooltipValueType, string> {
  valueFormatter: (value: number) => string;
  labelFormatter?: (label: TooltipValueType) => string;
  secondaryValueFormatter?: (payload: unknown) => string | null;
}

const ChartTooltip = ({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
  secondaryValueFormatter,
}: ChartTooltipProps) => {
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
          const secondaryValue = secondaryValueFormatter?.(item.payload ?? null) ?? null;

          return (
            <div key={item.dataKey?.toString()} className="flex items-center gap-2 text-slate-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: item.color ?? 'var(--fallback-color, #2563EB)' }}
              />
              <span className="text-xs font-medium sm:text-sm">{item.name}</span>
              <span className="ml-auto flex items-center gap-2 font-semibold text-slate-900">
                <span>{valueFormatter(numericValue)}</span>
                {secondaryValue ? (
                  <span className="text-xs font-medium text-slate-400">{secondaryValue}</span>
                ) : null}
              </span>
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

export function PortfolioVisualizations({ metrics, summary }: PortfolioVisualizationsProps) {
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
  const formatSignedPercentValue = (value: number) => {
    const formatted = formatPercent(value, locale);
    return value > 0 ? `+${formatted}` : formatted;
  };

  const compactNumber = new Intl.NumberFormat(localeCode, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  const totalValueUsd = summary?.totalValue
    ?? metrics.reduce((sum, item) => sum + item.currentValue, 0);
  const usdToIlsRate = summary?.usdToIlsRate ?? 0;
  const convertValue = useMemo(
    () => (valueUsd: number) => (currency === 'ILS' ? valueUsd * usdToIlsRate : valueUsd),
    [currency, usdToIlsRate]
  );

  const roiTrendData = useMemo(() => {
    if (!metrics.length) {
      return [];
    }

    const sorted = [...metrics].sort((a, b) => b.roiPercent - a.roiPercent);
    return sorted.slice(0, Math.min(sorted.length, 12)).map((metric) => ({
      symbol: metric.position.symbol,
      display: metric.position.display ?? metric.position.symbol,
      roiPercent: metric.roiPercent,
      currentValue: convertValue(metric.currentValue),
    }));
  }, [metrics, convertValue]);

  const holdingPeriodData = useMemo(() => {
    if (!metrics.length) {
      return [];
    }

    const buckets = [
      { key: 'underYear' as const, min: 0, max: 1 },
      { key: 'oneToThree' as const, min: 1, max: 3 },
      { key: 'threeToFive' as const, min: 3, max: 5 },
      { key: 'fivePlus' as const, min: 5, max: Number.POSITIVE_INFINITY },
    ];

    const labels = t.dashboard.holdingPeriodBuckets;

    return buckets.map((bucket) => {
      const bucketMetrics = metrics.filter((metric) =>
        metric.yearsHeld >= bucket.min && (bucket.max === Number.POSITIVE_INFINITY || metric.yearsHeld < bucket.max)
      );
      const totalUsd = bucketMetrics.reduce((sum, metric) => sum + metric.currentValue, 0);
      const value = convertValue(totalUsd);
      const percentage = totalValueUsd > 0 ? (totalUsd / totalValueUsd) * 100 : 0;

      return {
        key: bucket.key,
        label: labels[bucket.key],
        value,
        percentage,
      };
    });
  }, [metrics, convertValue, totalValueUsd, t.dashboard.holdingPeriodBuckets]);

  const topMovers = useMemo(() => {
    if (!metrics.length) {
      return { gainers: [], losers: [], maxMagnitude: 0 } as const;
    }

    const gainers = [...metrics]
      .filter((metric) => metric.roiPercent > 0)
      .sort((a, b) => b.roiPercent - a.roiPercent)
      .slice(0, 3);

    const losers = [...metrics]
      .filter((metric) => metric.roiPercent < 0)
      .sort((a, b) => a.roiPercent - b.roiPercent)
      .slice(0, 3);

    const magnitudes = [...gainers, ...losers].map((metric) => Math.abs(metric.roiPercent));
    const maxMagnitude = magnitudes.length ? Math.max(...magnitudes) : 0;

    return { gainers, losers, maxMagnitude } as const;
  }, [metrics]);

  const pieTooltipFormatter = (value: number) => formatValue(value ?? 0);
  const barTooltipFormatter = (value: number) => formatValue(value ?? 0);
  const roiTooltipFormatter = (value: number) => formatPercent(value ?? 0, locale);

  if (!metrics.length || !summary) {
    return null;
  }

  const roiLabelFormatter = (value: TooltipValueType) => {
    if (typeof value !== 'string') {
      return value?.toString?.() ?? '';
    }

    const entry = roiTrendData.find((item) => item.symbol === value);
    return entry?.display ?? value;
  };

  const holdingTooltipSecondary = (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || payload === null) {
      return null;
    }

    const { percentage } = payload as { percentage?: number };
    return typeof percentage === 'number' ? formatPercent(percentage, locale) : null;
  };

  const roiTooltipSecondary = (payload: unknown) => {
    if (!payload || typeof payload !== 'object' || payload === null) {
      return null;
    }

    const { currentValue } = payload as { currentValue?: number };
    return typeof currentValue === 'number' ? formatValue(currentValue) : null;
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl xl:col-span-4">
          <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
            <CardTitle className="text-lg font-semibold text-slate-900">
              {t.dashboard.allocationChart}
            </CardTitle>
            <p className="text-sm text-slate-500">{t.dashboard.allocationDescription}</p>
          </CardHeader>
          <CardContent className="h-80">
            {allocationData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
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
                        secondaryValueFormatter={(payload) => {
                          if (!payload || typeof payload !== 'object' || payload === null) {
                            return null;
                          }

                          const { percentage } = payload as { percentage?: number };
                          return typeof percentage === 'number' ? formatPercent(percentage, locale) : null;
                        }}
                      />
                    }
                  />
                  <Legend verticalAlign="bottom" align="center" content={renderLegend} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl xl:col-span-8">
          <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
            <CardTitle className="text-lg font-semibold text-slate-900">
              {t.dashboard.pnlChart}
            </CardTitle>
            <p className="text-sm text-slate-500">{t.dashboard.pnlDescription}</p>
          </CardHeader>
          <CardContent className="h-80">
            {pnlData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
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
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl xl:col-span-6">
          <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
            <CardTitle className="text-lg font-semibold text-slate-900">
              {t.dashboard.roiMomentumChart}
            </CardTitle>
            <p className="text-sm text-slate-500">{t.dashboard.roiMomentumDescription}</p>
          </CardHeader>
          <CardContent className="h-80">
            {roiTrendData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                {t.dashboard.emptyChart}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={roiTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="roiGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818CF8" stopOpacity={0.95} />
                      <stop offset="95%" stopColor="#818CF8" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(129, 140, 248, 0.25)" />
                  <XAxis
                    dataKey="symbol"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#6366F1', fontSize: 12, fontWeight: 600 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${Math.round(value)}%`}
                    tick={{ fill: '#6366F1', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(99, 102, 241, 0.35)', strokeWidth: 1 }}
                    content={
                      <ChartTooltip
                        valueFormatter={roiTooltipFormatter}
                        labelFormatter={roiLabelFormatter}
                        secondaryValueFormatter={roiTooltipSecondary}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="roiPercent"
                    stroke="#4F46E5"
                    strokeWidth={2}
                    fill="url(#roiGradient)"
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl xl:col-span-3">
          <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
            <CardTitle className="text-lg font-semibold text-slate-900">
              {t.dashboard.holdingPeriodChart}
            </CardTitle>
            <p className="text-sm text-slate-500">{t.dashboard.holdingPeriodDescription}</p>
          </CardHeader>
          <CardContent className="h-72">
            {holdingPeriodData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                {t.dashboard.emptyChart}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={holdingPeriodData} layout="vertical" barGap={12}>
                  <defs>
                    <linearGradient id="holdingGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#14B8A6" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#0F766E" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(15, 118, 110, 0.2)" />
                  <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: '#0F766E', fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    width={110}
                    tick={{ fill: '#0F766E', fontSize: 12, fontWeight: 600 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(20, 184, 166, 0.08)' }}
                    content={
                      <ChartTooltip
                        valueFormatter={barTooltipFormatter}
                        labelFormatter={(value) => value?.toString?.() ?? ''}
                        secondaryValueFormatter={holdingTooltipSecondary}
                      />
                    }
                  />
                  <Bar dataKey="value" name={t.dashboard.totalValue} fill="url(#holdingGradient)" radius={[0, 12, 12, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl xl:col-span-3">
          <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
            <CardTitle className="text-lg font-semibold text-slate-900">
              {t.dashboard.topMoversTitle}
            </CardTitle>
            <p className="text-sm text-slate-500">{t.dashboard.topMoversDescription}</p>
          </CardHeader>
          <CardContent className="flex h-full flex-col justify-between gap-6 py-6">
            {topMovers.gainers.length === 0 && topMovers.losers.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                {t.dashboard.noMovers}
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {topMovers.gainers.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                      <ArrowUpRight className="h-4 w-4" />
                      <span>{t.dashboard.topGainers}</span>
                    </div>
                    <div className="space-y-3">
                      {topMovers.gainers.map((metric) => (
                        <div key={metric.position.symbol} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">
                                {metric.position.display ?? metric.position.symbol}
                              </span>
                              <span className="text-xs text-slate-400">{metric.position.symbol}</span>
                            </div>
                            <span className="text-sm font-semibold text-emerald-600">
                              {formatSignedPercentValue(metric.roiPercent)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-emerald-100/70">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600"
                              style={{
                                width: `${
                                  topMovers.maxMagnitude
                                    ? Math.max((Math.abs(metric.roiPercent) / topMovers.maxMagnitude) * 100, 8)
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {topMovers.losers.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-rose-600">
                      <ArrowDownRight className="h-4 w-4" />
                      <span>{t.dashboard.topLosers}</span>
                    </div>
                    <div className="space-y-3">
                      {topMovers.losers.map((metric) => (
                        <div key={metric.position.symbol} className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">
                                {metric.position.display ?? metric.position.symbol}
                              </span>
                              <span className="text-xs text-slate-400">{metric.position.symbol}</span>
                            </div>
                            <span className="text-sm font-semibold text-rose-600">
                              {formatSignedPercentValue(metric.roiPercent)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-rose-100/70">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-rose-400 via-rose-500 to-rose-600"
                              style={{
                                width: `${
                                  topMovers.maxMagnitude
                                    ? Math.max((Math.abs(metric.roiPercent) / topMovers.maxMagnitude) * 100, 8)
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
