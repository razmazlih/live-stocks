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
  LabelList,
  ReferenceLine,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import type { DefaultLegendContentProps, TooltipProps as RechartsTooltipProps } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency, formatPercent } from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const COLORS = ['#2563EB', '#0EA5E9', '#22C55E', '#8B5CF6', '#F97316', '#F59E0B', '#EC4899'];
const ROI_COLORS = {
  positive: '#22C55E',
  negative: '#F43F5E',
  neutral: '#94A3B8',
};

interface RoiDatum {
  symbol: string;
  display: string;
  roiPercent: number;
  currentValue: number;
}

interface HoldingDatum {
  symbol: string;
  display: string;
  yearsHeld: number;
  currentValueDisplay: number;
  roiPercent: number;
  quantity: number;
  fill: string;
  bubbleSize: number;
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

export function PortfolioVisualizations({ metrics, summary }: PortfolioVisualizationsProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);

  const toDisplayValue = useMemo(() => {
    if (!summary) {
      return (value: number) => value;
    }

    if (settings.currency === 'ILS') {
      return (value: number) => value * summary.usdToIlsRate;
    }

    return (value: number) => value;
  }, [settings.currency, summary]);

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

  const roiData = useMemo(() => {
    if (!summary) {
      return [] as RoiDatum[];
    }

    const activeMetrics = metrics.filter((metric) => metric.position.quantity > 0);
    if (!activeMetrics.length) {
      return [] as RoiDatum[];
    }

    return activeMetrics
      .map<RoiDatum>((metric) => ({
        symbol: metric.position.symbol,
        display: metric.position.display || metric.position.symbol,
        roiPercent: Number.isFinite(metric.roiPercent) ? metric.roiPercent : 0,
        currentValue: toDisplayValue(metric.currentValue),
      }))
      .sort((a, b) => Math.abs(b.roiPercent) - Math.abs(a.roiPercent))
      .slice(0, 8);
  }, [metrics, summary, toDisplayValue]);

  const holdingData = useMemo(() => {
    if (!summary) {
      return [] as HoldingDatum[];
    }

    const activeMetrics = metrics.filter((metric) => metric.position.quantity > 0);
    if (!activeMetrics.length) {
      return [] as HoldingDatum[];
    }

    const rawData = activeMetrics.map<HoldingDatum>((metric) => ({
      symbol: metric.position.symbol,
      display: metric.position.display || metric.position.symbol,
      yearsHeld: Number.isFinite(metric.yearsHeld) ? metric.yearsHeld : 0,
      currentValueDisplay: toDisplayValue(metric.currentValue),
      roiPercent: Number.isFinite(metric.roiPercent) ? metric.roiPercent : 0,
      quantity: metric.position.quantity,
      fill:
        metric.roiPercent > 0
          ? ROI_COLORS.positive
          : metric.roiPercent < 0
            ? ROI_COLORS.negative
            : ROI_COLORS.neutral,
      bubbleSize: 0,
    }));

    const maxValue = Math.max(...rawData.map((item) => item.currentValueDisplay), 0);
    const denominator = maxValue > 0 ? maxValue : 1;

    return rawData
      .map((item) => ({
        ...item,
        bubbleSize: 80 + (item.currentValueDisplay / denominator) * 220,
      }))
      .sort((a, b) => a.yearsHeld - b.yearsHeld);
  }, [metrics, summary, toDisplayValue]);

  const currency = settings.currency;
  const localeCode = locale === 'he' ? 'he-IL' : 'en-US';
  const formatValue = (value: number) => formatCurrency(value, currency, locale);
  const compactNumber = new Intl.NumberFormat(localeCode, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const compactCurrency = new Intl.NumberFormat(localeCode, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const yearsFormatter = new Intl.NumberFormat(localeCode, {
    maximumFractionDigits: 1,
  });

  const pieTooltipFormatter = (value: number) => formatValue(value ?? 0);
  const barTooltipFormatter = (value: number) => formatValue(value ?? 0);
  const roiTooltipFormatter = (value: number) => formatPercent(value ?? 0, locale);

  if (!metrics.length || !summary) {
    return null;
  }

  const holdingTooltipContent = ({
    active,
    payload,
  }: RechartsTooltipProps<TooltipValueType, string>) => {
    if (!active || !payload?.length) {
      return null;
    }

    const data = payload[0]?.payload as HoldingDatum | undefined;
    if (!data) {
      return null;
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm shadow-xl backdrop-blur-lg">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {data.display} · {data.symbol}
        </p>
        <div className="mt-2 space-y-2 text-xs text-slate-600 sm:text-sm">
          <div className="flex items-center gap-3">
            <span>{t.dashboard.holdingTooltip.duration}</span>
            <span className="ml-auto font-semibold text-slate-900">
              {yearsFormatter.format(data.yearsHeld)} {t.dashboard.holdingTooltip.yearsSuffix}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>{t.dashboard.holdingTooltip.value}</span>
            <span className="ml-auto font-semibold text-slate-900">
              {formatValue(data.currentValueDisplay)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>{t.dashboard.holdingTooltip.roi}</span>
            <span className="ml-auto font-semibold text-slate-900">
              {formatPercent(data.roiPercent, locale)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>{t.dashboard.holdingTooltip.quantity}</span>
            <span className="ml-auto font-semibold text-slate-900">{data.quantity}</span>
          </div>
        </div>
      </div>
    );
  };

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
            {t.dashboard.roiChart}
          </CardTitle>
          <p className="text-sm text-slate-500">{t.dashboard.roiDescription}</p>
        </CardHeader>
        <CardContent className="h-80">
          {roiData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roiData} layout="vertical" barCategoryGap={12} margin={{ top: 8, right: 24, left: 8, bottom: 16 }}>
                <defs>
                  <linearGradient id="roiPositiveGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.95} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0.55} />
                  </linearGradient>
                  <linearGradient id="roiNegativeGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.95} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="rgba(148, 163, 184, 0.25)" />
                <XAxis
                  type="number"
                  tickFormatter={(value) => formatPercent(Number(value) || 0, locale)}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 12 }}
                />
                <YAxis
                  dataKey="display"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#334155', fontSize: 12, fontWeight: 600 }}
                  width={120}
                />
                <ReferenceLine x={0} stroke="rgba(148, 163, 184, 0.35)" strokeDasharray="3 3" />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={
                    <ChartTooltip
                      valueFormatter={roiTooltipFormatter}
                      labelFormatter={(value) => value?.toString?.() ?? ''}
                    />
                  }
                />
                <Bar dataKey="roiPercent" radius={[0, 10, 10, 0]} name={t.dashboard.roiLegendLabel} minPointSize={4}>
                  {roiData.map((entry) => (
                    <Cell
                      key={entry.symbol}
                      fill={
                        entry.roiPercent > 0
                          ? 'url(#roiPositiveGradient)'
                          : entry.roiPercent < 0
                            ? 'url(#roiNegativeGradient)'
                            : ROI_COLORS.neutral
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="roiPercent"
                    position="right"
                    className="text-xs font-semibold text-slate-600"
                    formatter={(value: number) => formatPercent(Number(value) || 0, locale)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-white/60 bg-gradient-to-br from-white/95 via-white/80 to-white/60 shadow-2xl xl:col-span-2">
        <CardHeader className="space-y-2 border-b border-slate-100/60 bg-white/50">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.holdingChart}
          </CardTitle>
          <p className="text-sm text-slate-500">{t.dashboard.holdingDescription}</p>
        </CardHeader>
        <CardContent className="h-[22rem]">
          {holdingData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 16, right: 32, bottom: 24, left: 8 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.25)" />
                  <XAxis
                    type="number"
                    dataKey="yearsHeld"
                    name={t.dashboard.holdingAxisYears}
                    tickFormatter={(value) => yearsFormatter.format(Number(value) || 0)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#475569', fontSize: 12 }}
                    label={{ value: t.dashboard.holdingAxisYears, offset: -10, position: 'insideBottom', fill: '#475569' }}
                  />
                  <YAxis
                    type="number"
                    dataKey="currentValueDisplay"
                    name={t.dashboard.holdingAxisValue}
                    tickFormatter={(value) => compactCurrency.format(Number(value) || 0)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#475569', fontSize: 12 }}
                    label={{ value: t.dashboard.holdingAxisValue, angle: -90, position: 'insideLeft', offset: 10, fill: '#475569' }}
                  />
                  <ZAxis type="number" dataKey="bubbleSize" range={[80, 280]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} content={holdingTooltipContent} />
                  <Scatter data={holdingData} name={t.dashboard.holdingAxisRoi}>
                    {holdingData.map((entry) => (
                      <Cell key={entry.symbol} fill={entry.fill} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500 sm:text-sm">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROI_COLORS.positive }} />
                  {t.dashboard.positiveTrend}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROI_COLORS.negative }} />
                  {t.dashboard.negativeTrend}
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROI_COLORS.neutral }} />
                  {t.dashboard.neutralTrend}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
