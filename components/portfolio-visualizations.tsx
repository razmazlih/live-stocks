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
  Label,
  type LegendProps,
  type TooltipProps,
} from 'recharts';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency } from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899', '#F97316', '#8B5CF6'];

type ChartTooltipProps = TooltipProps<number, string> & {
  valueFormatter: (value: number) => string;
  titleFormatter?: (label: string | number) => string;
};

const ChartTooltip = ({ active, payload, label, valueFormatter, titleFormatter }: ChartTooltipProps) => {
  if (!active || !payload?.length) {
    return null;
  }

  const [{ color, value, name }] = payload;

  return (
    <div className="min-w-[160px] rounded-2xl border border-white/60 bg-white/80 p-3 text-xs shadow-xl backdrop-blur">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        <span
          className="inline-flex h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        {titleFormatter ? titleFormatter(label ?? name ?? '') : label ?? name ?? ''}
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-900">{valueFormatter(Number(value))}</p>
    </div>
  );
};

const ChartLegend = ({ payload }: LegendProps) => {
  if (!payload?.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
      {payload.map((item) => (
        <span
          key={`${item.value}`}
          className="inline-flex items-center gap-2 rounded-full bg-slate-100/60 px-3 py-1 backdrop-blur-sm"
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: item.color }}
          />
          {item.value}
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

  const totalAllocationValue = allocationData.reduce((acc, item) => acc + (item.value ?? 0), 0);

  const renderPieCenterLabel = ({
    cx,
    cy,
  }: {
    cx?: number;
    cy?: number;
  }) => {
    if (typeof cx !== 'number' || typeof cy !== 'number') {
      return null;
    }

    return (
      <g>
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-slate-500 text-[11px] uppercase tracking-wide">
          {t.dashboard.totalValue}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-900 text-base font-semibold">
          {formatValue(totalAllocationValue)}
        </text>
      </g>
    );
  };

  const AllocationTooltip = (props: TooltipProps<number, string>) => {
    const displayName = props.payload?.[0]?.payload?.display ?? props.label ?? '';

    return (
      <ChartTooltip
        {...props}
        valueFormatter={pieTooltipFormatter}
        titleFormatter={() => String(displayName)}
      />
    );
  };

  const PnLTooltip = (props: TooltipProps<number, string>) => (
    <ChartTooltip
      {...props}
      valueFormatter={barTooltipFormatter}
      titleFormatter={(label) => `${t.positions.symbol}: ${label}`}
    />
  );

  if (!metrics.length || !summary) {
    return null;
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="relative overflow-hidden border-white/50 bg-white/70 shadow-xl">
        <div className="pointer-events-none absolute -right-24 top-0 h-64 w-64 rounded-full bg-blue-100/50 blur-3xl" />
        <CardHeader className="relative z-10 pb-2">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.allocationChart}
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {t.dashboard.allocationDescription ?? t.dashboard.allocationChart}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10 h-80 pt-6">
          {allocationData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocationData}
                  dataKey="value"
                  nameKey="display"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={2}
                >
                  {allocationData.map((entry, index) => (
                    <Cell key={entry.symbol} fill={COLORS[index % COLORS.length]} />
                  ))}
                  <Label position="center" content={renderPieCenterLabel} />
                </Pie>
                <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} content={<AllocationTooltip />} />
                <Legend verticalAlign="bottom" content={<ChartLegend />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="relative overflow-hidden border-white/50 bg-white/70 shadow-xl">
        <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-emerald-100/50 blur-3xl" />
        <CardHeader className="relative z-10 pb-2">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {t.dashboard.pnlChart}
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {t.dashboard.pnlDescription ?? t.dashboard.pnlChart}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative z-10 h-80 pt-6">
          {pnlData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlData} barGap={10}>
                <defs>
                  <linearGradient id="currentPnLGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#60A5FA" stopOpacity={0.6} />
                  </linearGradient>
                  <linearGradient id="projectedPnLGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#34D399" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
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
                  tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }}
                />
                <Tooltip cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} content={<PnLTooltip />} />
                <Legend verticalAlign="top" align="right" content={<ChartLegend />} />
                <Bar dataKey="currentPnLDisplay" name={t.dashboard.current} fill="url(#currentPnLGradient)" radius={[6, 6, 0, 0]} />
                <Bar
                  dataKey="projectedPnLDisplay"
                  name={t.dashboard.projected}
                  fill="url(#projectedPnLGradient)"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
