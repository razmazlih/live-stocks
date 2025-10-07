'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  TooltipProps,
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency } from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary } from '@/types';
import { PieChart as PieChartIcon, BarChart3 } from 'lucide-react';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const COLORS = ['#2563EB', '#0EA5E9', '#10B981', '#F59E0B', '#6366F1', '#EC4899', '#F97316'];

type ChartTooltipProps = TooltipProps<number, string> & {
  formatValue: (value: number) => string;
};

const ChartTooltip = ({ active, payload, label, formatValue }: ChartTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white/90 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
      <p className="font-medium text-slate-500">{label}</p>
      <div className="mt-2 space-y-2">
        {payload.map((entry) => (
          <div key={`${label}-${entry.dataKey}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color ?? '#2563EB' }}
            />
            <span className="text-slate-500">{entry.name}</span>
            <span className="font-semibold text-slate-900">
              {formatValue(Number(entry.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
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

  const totalAllocation = allocationData.reduce((acc, item) => acc + item.value, 0);

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/80 shadow-xl backdrop-blur">
        <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-sky-100/70 blur-3xl" />
        <CardHeader className="relative z-10 flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-lg font-semibold text-slate-900">
              {t.dashboard.allocationChart}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {settings.currency === 'ILS' ? t.dashboard.totalValueIls : t.dashboard.totalValueUsd}
            </CardDescription>
          </div>
          <span className="rounded-2xl bg-sky-500/10 p-2 text-sky-600">
            <PieChartIcon className="h-5 w-5" />
          </span>
        </CardHeader>
        <CardContent className="relative z-10 h-80 pt-0">
          {allocationData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200/80 text-sm text-slate-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <div className="flex h-full flex-col gap-6 lg:flex-row">
              <div className="h-60 flex-1 lg:h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {COLORS.map((color, index) => (
                        <linearGradient
                          key={`gradient-${color}`}
                          id={`chartGradient-${index}`}
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor={color} stopOpacity={0.85} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={allocationData}
                      dataKey="value"
                      nameKey="display"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={3}
                      strokeWidth={6}
                    >
                      {allocationData.map((entry, index) => (
                        <Cell key={entry.symbol} fill={`url(#chartGradient-${index % COLORS.length})`} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip
                      content={(props) => (
                        <ChartTooltip {...props} formatValue={(value) => pieTooltipFormatter(value) as string} />
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-4 text-sm">
                <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t.dashboard.totalValue}
                  </p>
                  <p className="text-lg font-semibold text-slate-900">{formatValue(totalAllocation)}</p>
                </div>
                <div className="grid gap-3">
                  {allocationData.map((item, index) => {
                    const percent = totalAllocation === 0 ? 0 : (item.value / totalAllocation) * 100;
                    return (
                      <div key={item.symbol} className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/60 bg-white/70 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.symbol}</p>
                            <p className="text-sm font-medium text-slate-700">{item.display}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">{formatValue(item.value)}</p>
                          <p className="text-xs text-slate-500">{percent.toFixed(1)}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/80 shadow-xl backdrop-blur">
        <div className="pointer-events-none absolute -left-20 -top-24 h-60 w-60 rounded-full bg-emerald-100/60 blur-3xl" />
        <CardHeader className="relative z-10 flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="text-lg font-semibold text-slate-900">
              {t.dashboard.pnlChart}
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {t.dashboard.visualizationsTitle}
            </CardDescription>
          </div>
          <span className="rounded-2xl bg-emerald-500/10 p-2 text-emerald-600">
            <BarChart3 className="h-5 w-5" />
          </span>
        </CardHeader>
        <CardContent className="relative z-10 h-80 pt-0">
          {pnlData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-200/80 text-sm text-slate-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlData} barGap={10}>
                <defs>
                  <linearGradient id="currentPnLGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="projectedPnLGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#34D399" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" opacity={0.25} vertical={false} />
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
                  tick={{ fill: '#64748B', fontSize: 12 }}
                />
                <Tooltip
                  content={(props) => (
                    <ChartTooltip {...props} formatValue={(value) => barTooltipFormatter(value) as string} />
                  )}
                />
                <Bar
                  dataKey="currentPnLDisplay"
                  name={t.dashboard.current}
                  fill="url(#currentPnLGradient)"
                  radius={[10, 10, 0, 0]}
                />
                <Bar
                  dataKey="projectedPnLDisplay"
                  name={t.dashboard.projected}
                  fill="url(#projectedPnLGradient)"
                  radius={[10, 10, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
