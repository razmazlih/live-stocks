'use client';

import { useMemo } from 'react';

import { HistoricalPoint, Position } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Sparkline } from './sparkline';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/calculations';

export type ClosedPositionSummary = {
  totalQuantity: number;
  totalProceedsUsd: number;
  totalCostUsd: number;
  totalProfitUsd: number;
  profitPercent: number;
  averageEntryPrice: number;
  averageExitPrice: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
};

interface ClosedPositionCardProps {
  position: Position;
  summary: ClosedPositionSummary | null;
  sparklineData?: HistoricalPoint[];
  usdToIlsRate: number;
}

export function ClosedPositionCard({ position, summary, sparklineData, usdToIlsRate }: ClosedPositionCardProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);

  const profit = summary?.totalProfitUsd ?? 0;
  const profitPercent = summary?.profitPercent ?? 0;

  const profitIls = profit * usdToIlsRate;
  const profitTone = useMemo(() => {
    if (profit > 0) {
      return 'text-emerald-600';
    }

    if (profit < 0) {
      return 'text-rose-600';
    }

    return 'text-slate-600';
  }, [profit]);

  const percentTone = useMemo(() => {
    if (profitPercent > 0) {
      return 'bg-emerald-50 text-emerald-600';
    }

    if (profitPercent < 0) {
      return 'bg-rose-50 text-rose-600';
    }

    return 'bg-slate-100 text-slate-600';
  }, [profitPercent]);

  const lastSaleDisplay = summary?.lastSaleDate ? formatDate(summary.lastSaleDate, locale) : null;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-lg">
      <div className="pointer-events-none absolute inset-x-10 top-0 h-24 rounded-full bg-gradient-to-r from-blue-500/20 via-blue-400/10 to-transparent blur-3xl transition-opacity duration-500 group-hover:opacity-90" />

      <div className="relative z-10 flex flex-1 flex-col gap-5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12 rounded-2xl border border-white/60 bg-slate-100 shadow-sm ring-2 ring-blue-100">
              <AvatarImage src={position.imageUrl} alt={position.display} />
              <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
                {position.symbol.slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-slate-900">{position.display}</h3>
                <Badge variant="secondary" className="border border-blue-100 bg-blue-50 text-blue-700">
                  {position.symbol}
                </Badge>
              </div>
              {lastSaleDisplay && (
                <p className="text-xs text-slate-500">
                  {t.dashboard.closed.lastSale}: {lastSaleDisplay}
                </p>
              )}
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t.dashboard.closed.realizedPnL}
            </p>
            <p className={`text-xl font-semibold ${profitTone}`}>
              {formatCurrency(profit, 'USD', locale)}
            </p>
            {settings.currency === 'ILS' && (
              <p className={`text-sm font-medium ${profitTone}`}>
                {formatCurrency(profitIls, 'ILS', locale)}
              </p>
            )}
            <div className="mt-2 flex justify-end">
              <Badge variant="secondary" className={`border-0 px-2 py-0.5 text-[11px] font-semibold ${percentTone}`}>
                {formatPercent(profitPercent, locale)}
              </Badge>
            </div>
          </div>
        </div>

        {sparklineData && sparklineData.length > 1 && (
          <div className="rounded-3xl border border-slate-100/70 bg-slate-50/70 p-3">
            <Sparkline
              points={sparklineData}
              height={120}
              baseline={summary?.averageEntryPrice}
              baselineColor="rgba(148, 163, 184, 0.4)"
              color="#1D4ED8"
              projectedPrice={summary?.averageExitPrice}
              projectedLineColor="rgba(37, 99, 235, 0.25)"
              className="h-28 w-full"
            />
          </div>
        )}

        <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50/80 p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t.dashboard.closed.quantitySold}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {formatNumber(summary?.totalQuantity ?? 0, locale)}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50/80 p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t.dashboard.closed.totalProceeds}
            </p>
            <div className="mt-1 space-y-1">
              <p className="text-base font-semibold text-slate-900">
                {formatCurrency(summary?.totalProceedsUsd ?? 0, 'USD', locale)}
              </p>
              {settings.currency === 'ILS' && (
                <p className="text-sm font-medium text-slate-600">
                  {formatCurrency((summary?.totalProceedsUsd ?? 0) * usdToIlsRate, 'ILS', locale)}
                </p>
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-white/70 p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t.dashboard.closed.averageEntry}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {formatCurrency(summary?.averageEntryPrice ?? 0, 'USD', locale)}
            </p>
          </div>
          <div className="rounded-2xl bg-white/70 p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {t.dashboard.closed.averageExit}
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">
              {formatCurrency(summary?.averageExitPrice ?? 0, 'USD', locale)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
