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
  ComposedChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import type { DefaultLegendContentProps, TooltipProps as RechartsTooltipProps } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import {
  buildPortfolioAllocation,
  buildPortfolioPnL,
  formatCurrency,
  formatPercent,
} from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const COLORS = ['#2563EB', '#0EA5E9', '#22C55E', '#8B5CF6', '#F97316', '#F59E0B', '#EC4899'];
const ROI_TONES: Record<'positive' | 'negative' | 'neutral', string> = {
  positive: '#16A34A',
  negative: '#F43F5E',
  neutral: '#475569',
};

interface TopHoldingsDatum {
  symbol: string;
  display: string;
  currentValue: number;
  projectedValue: number;
  roiPercent: number;
}

interface HoldingPeriodDatum {
  key: string;
  label: string;
  value: number;
  averageRoi: number;
  averageYears: number;
  count: number;
}

interface PerformanceScatterDatum {
  symbol: string;
  display: string;
  roi: number;
  value: number;
  projectedPnL: number;
  bubbleValue: number;
  tone: 'positive' | 'negative' | 'neutral';
}

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

interface TopHoldingsTooltipProps extends RechartsTooltipProps<TooltipValueType, string> {
  valueFormatter: (value: number) => string;
  percentFormatter: (value: number) => string;
  valueLabel: string;
  projectedLabel: string;
  roiLabel: string;
}

const TopHoldingsTooltip = ({
  active,
  payload,
  valueFormatter,
  percentFormatter,
  valueLabel,
  projectedLabel,
  roiLabel,
}: TopHoldingsTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const data = payload[0]?.payload as TopHoldingsDatum | undefined;
  if (!data) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm shadow-xl backdrop-blur-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{data.display}</p>
      <div className="mt-2 space-y-1 text-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{valueLabel}</span>
          <span className="ml-auto font-semibold text-slate-900">{valueFormatter(data.currentValue)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{projectedLabel}</span>
          <span className="ml-auto font-semibold text-slate-900">{valueFormatter(data.projectedValue)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{roiLabel}</span>
          <span className="ml-auto font-semibold text-slate-900">{percentFormatter(data.roiPercent)}</span>
        </div>
      </div>
    </div>
  );
};

interface PerformanceScatterTooltipProps extends RechartsTooltipProps<TooltipValueType, string> {
  valueFormatter: (value: number) => string;
  percentFormatter: (value: number) => string;
  projectedLabel: string;
  valueLabel: string;
  roiLabel: string;
}

const PerformanceScatterTooltip = ({
  active,
  payload,
  valueFormatter,
  percentFormatter,
  projectedLabel,
  valueLabel,
  roiLabel,
}: PerformanceScatterTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const data = payload[0]?.payload as PerformanceScatterDatum | undefined;
  if (!data) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm shadow-xl backdrop-blur-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{data.display}</p>
      <div className="mt-2 space-y-1 text-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{roiLabel}</span>
          <span className="ml-auto font-semibold text-slate-900">{percentFormatter(data.roi)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{valueLabel}</span>
          <span className="ml-auto font-semibold text-slate-900">{valueFormatter(data.value)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{projectedLabel}</span>
          <span className="ml-auto font-semibold text-slate-900">{valueFormatter(data.projectedPnL)}</span>
        </div>
      </div>
    </div>
  );
};

interface HoldingPeriodTooltipProps extends RechartsTooltipProps<TooltipValueType, string> {
  valueFormatter: (value: number) => string;
  percentFormatter: (value: number) => string;
  valueLabel: string;
  roiLabel: string;
  countLabel: (count: number) => string;
}

const HoldingPeriodTooltip = ({
  active,
  payload,
  valueFormatter,
  percentFormatter,
  valueLabel,
  roiLabel,
  countLabel,
}: HoldingPeriodTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const data = payload[0]?.payload as HoldingPeriodDatum | undefined;
  if (!data) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm shadow-xl backdrop-blur-lg">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{data.label}</p>
      <div className="mt-2 space-y-1 text-slate-600">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{valueLabel}</span>
          <span className="ml-auto font-semibold text-slate-900">{valueFormatter(data.value)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{roiLabel}</span>
          <span className="ml-auto font-semibold text-slate-900">{percentFormatter(data.averageRoi)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">{countLabel(data.count)}</span>
        </div>
      </div>
    </div>
  );
};

export function PortfolioVisualizations({ metrics, summary }: PortfolioVisualizationsProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);

  const currency = settings.currency;
  const usdToIlsRate = summary?.usdToIlsRate ?? 0;

  const convertValue = useMemo<((value: number) => number)>(() => {
    if (currency === 'ILS') {
      return (value: number) => value * usdToIlsRate;
    }

    return (value: number) => value;
  }, [currency, usdToIlsRate]);

  const allocationData = useMemo(() => {
    if (!summary) {
      return [];
    }

    return buildPortfolioAllocation(metrics, summary.usdToIlsRate).map((item) => ({
      ...item,
      value: currency === 'ILS' ? item.valueIls : item.valueUsd,
    }));
  }, [metrics, currency, summary]);

  const pnlData = useMemo(() => {
    const activeMetrics = metrics.filter((metric) => metric.position.quantity !== 0);
    if (!activeMetrics.length) {
      return [];
    }

    return buildPortfolioPnL(activeMetrics).map((item) => ({
      ...item,
      currentPnLDisplay: convertValue(item.currentPnLUsd),
      projectedPnLDisplay: convertValue(item.projectedPnLUsd),
    }));
  }, [metrics, convertValue]);

  const topHoldingsData = useMemo<TopHoldingsDatum[]>(() => {
    const activeMetrics = metrics.filter((metric) => metric.position.quantity > 0);
    if (!activeMetrics.length) {
      return [];
    }

    return activeMetrics
      .slice()
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 6)
      .map((metric) => {
        const projectedValueUsd = metric.projectedPrice * metric.position.quantity;

        return {
          symbol: metric.position.symbol,
          display: metric.position.display,
          currentValue: convertValue(metric.currentValue),
          projectedValue: convertValue(projectedValueUsd),
          roiPercent: metric.roiPercent,
        };
      });
  }, [metrics, convertValue]);

  const performanceScatterData = useMemo<PerformanceScatterDatum[]>(() => {
    const activeMetrics = metrics.filter((metric) => metric.position.quantity > 0);
    if (!activeMetrics.length) {
      return [];
    }

    return activeMetrics.map((metric) => {
      const projectedPnLDisplay = convertValue(metric.projectedPnLUsd);
      const tone: PerformanceScatterDatum['tone'] =
        metric.projectedPnLUsd > 0 ? 'positive' : metric.projectedPnLUsd < 0 ? 'negative' : 'neutral';

      return {
        symbol: metric.position.symbol,
        display: metric.position.display,
        roi: metric.roiPercent,
        value: convertValue(metric.currentValue),
        projectedPnL: projectedPnLDisplay,
        bubbleValue: Math.max(1, Math.abs(projectedPnLDisplay)),
        tone,
      };
    });
  }, [metrics, convertValue]);

  const holdingPeriodData = useMemo<HoldingPeriodDatum[]>(() => {
    const activeMetrics = metrics.filter((metric) => metric.position.quantity > 0);
    if (!activeMetrics.length) {
      return [];
    }

    const buckets = [
      {
        key: 'short-term',
        label: t.dashboard.holdingPeriods.shortTerm,
        predicate: (years: number) => years < 1,
      },
      {
        key: 'mid-term',
        label: t.dashboard.holdingPeriods.midTerm,
        predicate: (years: number) => years >= 1 && years < 3,
      },
      {
        key: 'long-term',
        label: t.dashboard.holdingPeriods.longTerm,
        predicate: (years: number) => years >= 3,
      },
    ];

    return buckets
      .map((bucket) => {
        const bucketMetrics = activeMetrics.filter((metric) => bucket.predicate(metric.yearsHeld));
        if (!bucketMetrics.length) {
          return null;
        }

        const totalValueUsd = bucketMetrics.reduce((sum, metric) => sum + metric.currentValue, 0);
        const totalRoi = bucketMetrics.reduce((sum, metric) => sum + metric.roiPercent, 0);
        const totalYears = bucketMetrics.reduce((sum, metric) => sum + metric.yearsHeld, 0);

        return {
          key: bucket.key,
          label: bucket.label,
          value: convertValue(totalValueUsd),
          averageRoi: totalRoi / bucketMetrics.length,
          averageYears: totalYears / bucketMetrics.length,
          count: bucketMetrics.length,
        };
      })
      .filter((item): item is HoldingPeriodDatum => Boolean(item));
  }, [
    metrics,
    convertValue,
    t.dashboard.holdingPeriods.shortTerm,
    t.dashboard.holdingPeriods.midTerm,
    t.dashboard.holdingPeriods.longTerm,
  ]);

  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const formatValue = (value: number) => formatCurrency(value, currency, locale);
  const formatSignedValue = (value: number) => {
    if (value > 0) {
      return `+${formatValue(value)}`;
    }

    return formatValue(value);
  };
  const formatPercentValue = (value: number) => formatPercent(value, locale);
  const compactNumber = new Intl.NumberFormat(localeCode, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  const pieTooltipFormatter = (value: number) => formatValue(value ?? 0);
  const barTooltipFormatter = (value: number) => formatValue(value ?? 0);

  if (!metrics.length || !summary) {
    return null;
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl">
        <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.allocationChart}
          </CardTitle>
          <p className="text-sm text-slate-500">{t.dashboard.allocationDescription}</p>
        </CardHeader>
        <CardContent className="h-80">
          {allocationData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
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
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl">
        <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.pnlChart}
          </CardTitle>
          <p className="text-sm text-slate-500">{t.dashboard.pnlDescription}</p>
        </CardHeader>
        <CardContent className="h-80">
          {pnlData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
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

      <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl">
        <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.topHoldingsChart}
          </CardTitle>
          <p className="text-sm text-slate-500">{t.dashboard.topHoldingsDescription}</p>
        </CardHeader>
        <CardContent className="flex h-80 flex-col gap-4">
          {topHoldingsData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={topHoldingsData} barCategoryGap="22%">
                    <defs>
                      <linearGradient id="topHoldingsCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.95} />
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0.6} />
                      </linearGradient>
                      <linearGradient id="topHoldingsProjected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.95} />
                        <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.4} />
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
                      cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                      content={
                        <TopHoldingsTooltip
                          valueFormatter={formatValue}
                          percentFormatter={formatPercentValue}
                          valueLabel={t.dashboard.topHoldingsValueLabel}
                          projectedLabel={t.dashboard.topHoldingsProjectedLabel}
                          roiLabel={t.dashboard.performanceScatterRoiLabel}
                        />
                      }
                    />
                    <Legend verticalAlign="bottom" align="center" content={renderLegend} />
                    <Bar
                      dataKey="currentValue"
                      name={t.dashboard.topHoldingsValueLabel}
                      fill="url(#topHoldingsCurrent)"
                      radius={[12, 12, 10, 10]}
                    />
                    <Line
                      type="monotone"
                      dataKey="projectedValue"
                      name={t.dashboard.topHoldingsProjectedLabel}
                      stroke="url(#topHoldingsProjected)"
                      strokeWidth={3}
                      dot={{ r: 4, stroke: '#0EA5E9', strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                {topHoldingsData.map((item) => {
                  const tone =
                    item.roiPercent > 0
                      ? 'bg-emerald-50 text-emerald-600'
                      : item.roiPercent < 0
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-slate-100 text-slate-600';

                  return (
                    <span key={item.symbol} className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${tone}`}>
                      <span className="font-semibold text-slate-700">{item.symbol}</span>
                      <span>{formatPercentValue(item.roiPercent)}</span>
                    </span>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl">
        <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.performanceScatterChart}
          </CardTitle>
          <p className="text-sm text-slate-500">{t.dashboard.performanceScatterDescription}</p>
        </CardHeader>
        <CardContent className="flex h-80 flex-col gap-4">
          {performanceScatterData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ left: 0, right: 20, top: 16, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.2)" />
                    <XAxis
                      type="number"
                      dataKey="roi"
                      name={t.dashboard.performanceScatterRoiLabel}
                      tickFormatter={(value) => formatPercentValue(value)}
                      tick={{ fill: '#475569', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="number"
                      dataKey="value"
                      name={t.dashboard.performanceScatterValueLabel}
                      tickFormatter={(value) => compactNumber.format(value)}
                      tick={{ fill: '#475569', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ZAxis type="number" dataKey="bubbleValue" range={[80, 360]} />
                    <Tooltip
                      cursor={{ strokeDasharray: '4 4', stroke: 'rgba(59, 130, 246, 0.4)' }}
                      content={
                        <PerformanceScatterTooltip
                          valueFormatter={formatSignedValue}
                          percentFormatter={formatPercentValue}
                          projectedLabel={t.dashboard.performanceScatterProjectedLabel}
                          valueLabel={t.dashboard.performanceScatterValueLabel}
                          roiLabel={t.dashboard.performanceScatterRoiLabel}
                        />
                      }
                    />
                    <Scatter data={performanceScatterData} name="performance">
                      {performanceScatterData.map((item) => (
                        <Cell key={item.symbol} fill={ROI_TONES[item.tone]} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-emerald-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  {t.dashboard.positiveTrend}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-rose-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                  {t.dashboard.negativeTrend}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                  {t.dashboard.neutralTrend}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl">
        <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.holdingPeriodsChart}
          </CardTitle>
          <p className="text-sm text-slate-500">{t.dashboard.holdingPeriodsDescription}</p>
        </CardHeader>
        <CardContent className="flex h-80 flex-col gap-4">
          {holdingPeriodData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={holdingPeriodData}
                    layout="vertical"
                    margin={{ left: 10, right: 20, top: 10, bottom: 10 }}
                  >
                    <defs>
                      <linearGradient id="holdingPeriodGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="5%" stopColor="#22C55E" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#22C55E" stopOpacity={0.55} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.2)" />
                    <XAxis
                      type="number"
                      tickFormatter={(value) => compactNumber.format(value)}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#475569', fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                      width={140}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(34, 197, 94, 0.08)' }}
                      content={
                        <HoldingPeriodTooltip
                          valueFormatter={formatValue}
                          percentFormatter={formatPercentValue}
                          valueLabel={t.dashboard.holdingPeriodsValueLabel}
                          roiLabel={t.dashboard.holdingPeriodsRoiLabel}
                          countLabel={t.dashboard.holdingPeriodsCount}
                        />
                      }
                    />
                    <Bar
                      dataKey="value"
                      name={t.dashboard.holdingPeriodsValueLabel}
                      fill="url(#holdingPeriodGradient)"
                      radius={[12, 12, 12, 12]}
                      barSize={22}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                {holdingPeriodData.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-2xl border border-slate-100/70 bg-white/70 p-3 text-slate-600 shadow-sm"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">
                      {formatPercentValue(item.averageRoi)}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {t.dashboard.holdingPeriodsValueLabel}: {formatValue(item.value)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {t.dashboard.holdingPeriodsCount(item.count)}
                    </p>
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
