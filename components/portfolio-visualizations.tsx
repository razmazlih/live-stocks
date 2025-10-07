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
  LegendProps,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency } from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const COLORS = ['#2563EB', '#0EA5E9', '#22C55E', '#F97316', '#A855F7', '#EC4899', '#F59E0B'];

type ChartTooltipPayload = {
  color: string;
  dataKey: string;
  value: number;
  name: string;
};

interface ChartTooltipProps {
  active?: boolean;
  label?: string;
  payload?: ChartTooltipPayload[];
  title?: string;
  formatter: (value: number) => string;
  alignRight?: boolean;
}

function ChartTooltip({ active, payload, label, title, formatter, alignRight }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div
      className={`min-w-[12rem] rounded-2xl border border-white/60 bg-white/90 p-4 shadow-lg backdrop-blur-sm ${
        alignRight ? 'text-right' : 'text-left'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {label && <p className="mt-1 text-sm font-semibold text-slate-900">{label}</p>}
      <div className="mt-3 space-y-2">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-3 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="font-medium text-slate-700">{entry.name}</span>
            </div>
            <span className="font-semibold text-slate-900">{formatter(Number(entry.value) || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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

  const totalAllocationValue = allocationData.reduce((acc, item) => acc + item.value, 0);

  const renderBarLegend = ({ payload }: LegendProps) => {
    if (!payload) return null;

    return (
      <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-slate-600">
        {payload.map((entry) => (
          <div
            key={entry.dataKey}
            className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 shadow-sm"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-700">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  if (!metrics.length || !summary) {
    return null;
  }

  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="relative overflow-hidden border-none bg-white/80 shadow-2xl ring-1 ring-slate-900/5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
        <div className="pointer-events-none absolute -left-24 top-16 h-48 w-48 rounded-full bg-sky-200/40 blur-3xl" />
        <CardHeader className="relative z-10 space-y-1">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.allocationChart}
          </CardTitle>
          <p className="text-sm text-slate-600">{t.dashboard.allocationDescription}</p>
        </CardHeader>
        <CardContent className="relative z-10 flex h-80 flex-col justify-between">
          {allocationData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocationData}
                      dataKey="value"
                      nameKey="display"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={2}
                      cornerRadius={12}
                    >
                      {allocationData.map((entry, index) => (
                        <Cell key={entry.symbol} fill={COLORS[index % COLORS.length]} stroke="white" strokeWidth={1} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={
                        <ChartTooltip title={t.dashboard.allocationChart} formatter={pieTooltipFormatter} alignRight />
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
                {allocationData.map((item, index) => {
                  const percent = totalAllocationValue ? (item.value / totalAllocationValue) * 100 : 0;
                  return (
                    <div
                      key={item.symbol}
                      className="flex items-center justify-between rounded-2xl bg-white/70 px-3 py-2 shadow-sm ring-1 ring-white/60"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-slate-900">{item.display}</p>
                          <p className="text-xs text-slate-500">{percent.toFixed(1)}%</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{formatValue(item.value)}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border-none bg-white/80 shadow-2xl ring-1 ring-slate-900/5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-sky-50" />
        <div className="pointer-events-none absolute bottom-10 right-0 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
        <CardHeader className="relative z-10 space-y-1">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.pnlChart}
          </CardTitle>
          <p className="text-sm text-slate-600">{t.dashboard.pnlDescription}</p>
        </CardHeader>
        <CardContent className="relative z-10 flex h-80 flex-col">
          {pnlData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pnlData} barGap={12}>
                    <defs>
                      <linearGradient id="bar-current" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563EB" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#1E3A8A" stopOpacity={0.7} />
                      </linearGradient>
                      <linearGradient id="bar-projected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22C55E" stopOpacity={0.9} />
                        <stop offset="95%" stopColor="#15803D" stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
                    <XAxis
                      dataKey="symbol"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#475569', fontSize: 12, fontWeight: 500 }}
                    />
                    <YAxis
                      tickFormatter={(value) => compactNumber.format(value)}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#475569', fontSize: 12 }}
                    />
                    <Tooltip
                      content={
                        <ChartTooltip title={t.dashboard.pnlChart} formatter={barTooltipFormatter} />
                      }
                    />
                    <Legend content={renderBarLegend} />
                    <Bar dataKey="currentPnLDisplay" name={t.dashboard.current} fill="url(#bar-current)" radius={[8, 8, 8, 8]} />
                    <Bar
                      dataKey="projectedPnLDisplay"
                      name={t.dashboard.projected}
                      fill="url(#bar-projected)"
                      radius={[8, 8, 8, 8]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {t.dashboard.pnlFootnote}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
