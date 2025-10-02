'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, CartesianGrid, XAxis, YAxis, Bar } from 'recharts';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { buildPortfolioAllocation, buildPortfolioPnL, formatCurrency } from '@/lib/calculations';
import { PositionMetrics, PortfolioSummary } from '@/types';

interface PortfolioVisualizationsProps {
  metrics: PositionMetrics[];
  summary: PortfolioSummary | null;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899', '#F97316', '#8B5CF6'];

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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <Card className="bg-white/85 border border-white/50 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">
            {t.dashboard.allocationChart}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {allocationData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocationData}
                  dataKey="value"
                  nameKey="display"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={3}
                >
                  {allocationData.map((entry, index) => (
                    <Cell key={entry.symbol} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={pieTooltipFormatter} />
                <Legend formatter={(value) => value as string} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white/85 border border-white/50 shadow-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-gray-900">
            {t.dashboard.pnlChart}
          </CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {pnlData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-gray-500">
              {t.dashboard.emptyChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pnlData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="symbol" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => compactNumber.format(value)} tickLine={false} axisLine={false} />
                <Tooltip formatter={barTooltipFormatter} />
                <Legend />
                <Bar dataKey="currentPnLDisplay" name={t.dashboard.current} fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="projectedPnLDisplay" name={t.dashboard.projected} fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
