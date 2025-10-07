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
} from 'recharts';
import type { DefaultLegendContentProps, TooltipProps as RechartsTooltipProps } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency } from '@/lib/calculations';
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
    const rate = summary?.usdToIlsRate ?? 0;
    const toDisplay = settings.currency === 'ILS'
      ? (value: number) => value * rate
      : (value: number) => value;

    return buildPortfolioPnL(metrics).map((item) => ({
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

  const pieTooltipFormatter = (value: number) => formatValue(value ?? 0);
  const barTooltipFormatter = (value: number) => formatValue(value ?? 0);

  if (!metrics.length || !summary) {
    return null;
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
    </div>
  );
}
