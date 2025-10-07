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
import type { TooltipProps } from 'recharts';
import type { LegendProps } from 'recharts';
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency } from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const COLORS = ['#2563EB', '#0EA5E9', '#7C3AED', '#EC4899', '#F97316', '#22C55E', '#A855F7'];

const ChartTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) {
    return null;
  }

  const item = payload[0];
  const formatter = item?.payload?.tooltipFormatter as ((value: number) => string) | undefined;
  const value = typeof formatter === 'function' ? formatter(item.value as number) : item.value;

  return (
    <div className="min-w-[180px] rounded-2xl border border-slate-100 bg-white/90 p-3 shadow-lg backdrop-blur-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.name}
        </span>
        <span className="text-sm font-semibold text-slate-900">{value}</span>
      </div>
    </div>
  );
};

const PieLegend = ({ payload }: LegendProps) => {
  if (!payload?.length) {
    return null;
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      {payload.map((entry) => {
        const percentage = entry?.payload?.percentage as number | undefined;
        const formatter = entry?.payload?.tooltipFormatter as ((value: number) => string) | undefined;
        const value = entry?.payload?.value as number | undefined;
        const formattedValue = typeof formatter === 'function' && typeof value === 'number'
          ? formatter(value)
          : value;
        const displayValue =
          typeof formattedValue === 'string'
            ? formattedValue
            : typeof formattedValue === 'number'
              ? formattedValue.toLocaleString()
              : '';

        return (
          <div
            key={(entry?.payload?.symbol as string) ?? (entry.value as string)}
            className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-slate-600 shadow-inner"
          >
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="font-medium text-slate-700">{entry.value}</span>
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {percentage !== undefined ? `${percentage.toFixed(1)}%` : ''}
              {displayValue ? ` · ${displayValue}` : ''}
            </span>
          </div>
        );
      })}
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

  const enhancedAllocation = allocationData.map((item) => ({
    ...item,
    tooltipFormatter: pieTooltipFormatter,
  }));

  const enhancedPnL = pnlData.map((item) => ({
    ...item,
    tooltipFormatter: barTooltipFormatter,
  }));

  if (!metrics.length || !summary) {
    return null;
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_1fr]">
      <Card className="relative overflow-hidden border border-white/60 bg-white/80 shadow-xl backdrop-blur-sm">
        <div className="pointer-events-none absolute -right-16 top-0 h-48 w-48 rounded-full bg-blue-200/40 blur-3xl" />
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.allocationChart}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative h-80">
          {allocationData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {COLORS.map((color, index) => (
                    <radialGradient
                      key={`allocation-gradient-${index}`}
                      id={`allocation-gradient-${index}`}
                      cx="50%"
                      cy="50%"
                      r="65%"
                    >
                      <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={color} stopOpacity={0.65} />
                    </radialGradient>
                  ))}
                </defs>
                <Pie
                  data={enhancedAllocation}
                  dataKey="value"
                  nameKey="display"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={3}
                >
                  {enhancedAllocation.map((entry, index) => (
                    <Cell key={entry.symbol} fill={`url(#allocation-gradient-${index % COLORS.length})`} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} formatter={pieTooltipFormatter} />
                <Legend align="left" verticalAlign="bottom" content={<PieLegend />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border border-white/60 bg-white/80 shadow-xl backdrop-blur-sm">
        <div className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.pnlChart}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative h-80">
          {pnlData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enhancedPnL} barGap={12}>
                <defs>
                  <linearGradient id="currentPnLGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.65} />
                  </linearGradient>
                  <linearGradient id="projectedPnLGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#34D399" stopOpacity={0.65} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148, 163, 184, 0.25)" vertical={false} />
                <XAxis dataKey="symbol" tickLine={false} axisLine={false} tick={{ fill: '#475569', fontSize: 12 }} />
                <YAxis
                  tickFormatter={(value) => compactNumber.format(value)}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#475569', fontSize: 12 }}
                />
                <Tooltip content={<ChartTooltip />} formatter={barTooltipFormatter} />
                <Legend
                  wrapperStyle={{ paddingTop: 24 }}
                  formatter={(value) => <span className="text-sm font-medium text-slate-600">{value}</span>}
                />
                <Bar
                  dataKey="currentPnLDisplay"
                  name={t.dashboard.current}
                  fill="url(#currentPnLGradient)"
                  radius={[8, 8, 4, 4]}
                />
                <Bar
                  dataKey="projectedPnLDisplay"
                  name={t.dashboard.projected}
                  fill="url(#projectedPnLGradient)"
                  radius={[8, 8, 4, 4]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
