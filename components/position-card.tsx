'use client';

import { PositionMetrics } from '@/types';
import { formatCurrency, formatNumber, formatDate, formatPercent } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sparkline } from './sparkline';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface PositionCardProps {
  metrics: PositionMetrics;
  sparklineData?: number[];
}

export function PositionCard({ metrics, sparklineData }: PositionCardProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const {
    position,
    currentPrice,
    positionPnLUsd,
    positionPnLIls,
    projectedPrice,
    projectedPnLUsd,
    projectedPnLIls,
    combined,
    combinedIls,
    yearsHeld,
  } = metrics;

  const projectedPriceDelta = currentPrice - projectedPrice;

  const usdToIlsRate = (() => {
    if (positionPnLUsd !== 0) {
      return positionPnLIls / positionPnLUsd;
    }

    if (projectedPnLUsd !== 0) {
      return projectedPnLIls / projectedPnLUsd;
    }

    if (combined !== 0) {
      return combinedIls / combined;
    }

    return 0;
  })();
  const projectedPriceDeltaIls = projectedPriceDelta * usdToIlsRate;

  const sparklineColor = (() => {
    if (currentPrice < position.entryPrice) {
      return { className: 'text-[#D22E2E]', hex: '#D22E2E' };
    }

    if (currentPrice > projectedPrice) {
      return { className: 'text-[#4AA956]', hex: '#4AA956' };
    }

    return { className: 'text-[#2563EB]', hex: '#2563EB' };
  })();

  const getTrendStyles = (value: number) => {
    if (value > 0) {
      return {
        text: 'text-emerald-600',
        badge: 'bg-emerald-50 text-emerald-600',
      };
    }

    if (value < 0) {
      return {
        text: 'text-rose-600',
        badge: 'bg-rose-50 text-rose-600',
      };
    }

    return {
      text: 'text-slate-600',
      badge: 'bg-slate-100 text-slate-500',
    };
  };

  const dailyChangeValue = typeof metrics.dailyChange === 'number' ? metrics.dailyChange : null;
  const dailyChangePercent = metrics.dailyChangePercent;
  const dailyChangeAmount = dailyChangeValue !== null ? dailyChangeValue * position.quantity : null;
  const dailyChangeStyles = dailyChangeAmount !== null ? getTrendStyles(dailyChangeAmount) : null;
  const dailyChangeIcon = dailyChangeAmount !== null
    ? dailyChangeAmount > 0
      ? <ArrowUpRight className="h-3.5 w-3.5" />
      : dailyChangeAmount < 0
        ? <ArrowDownRight className="h-3.5 w-3.5" />
        : <Minus className="h-3.5 w-3.5" />
    : null;

  const currentPnLStyles = getTrendStyles(positionPnLUsd);
  const projectedPnLStyles = getTrendStyles(projectedPriceDelta);
  const combinedStyles = getTrendStyles(combined);

  const percentText = (value: number) => `${value > 0 ? '+' : ''}${formatPercent(value, locale)}`;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-xl">
      <div className="pointer-events-none absolute -right-12 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-blue-200/60 blur-3xl transition-transform duration-500 group-hover:scale-110" />

      <div className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12 rounded-full border-2 border-white shadow-sm">
              <AvatarImage src={position.imageUrl} alt={position.display} />
              <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
                {position.symbol.slice(0, 2)}
              </AvatarFallback>
            </Avatar>

            <div className="space-y-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{position.display}</h3>
                  <Badge variant="secondary" className="border border-blue-100 bg-blue-50 text-blue-700">
                    {position.symbol}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {t.dashboard.since} {formatDate(position.entryDate, locale)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm text-slate-600">
                <div className="rounded-xl bg-slate-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.quantity}</p>
                  <p className="mt-1 font-medium text-slate-800">{formatNumber(position.quantity, locale)}</p>
                </div>
                <div className="rounded-xl bg-slate-50/60 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.dashboard.entryPrice}</p>
                  <p className="mt-1 font-medium text-slate-800">{formatCurrency(position.entryPrice, 'USD', locale)}</p>
                </div>
              </div>
            </div>
          </div>

          {dailyChangeAmount !== null && dailyChangeStyles && (
            <Badge
              variant="outline"
              className={`flex items-center gap-1 rounded-full border-0 px-3 py-1 text-xs font-semibold ${dailyChangeStyles.badge}`}
            >
              {dailyChangeIcon}
              <span>{t.dashboard.dailyChange}</span>
              <span className="font-semibold">
                {formatCurrency(dailyChangeAmount, 'USD', locale)}
              </span>
              {dailyChangePercent !== undefined && (
                <span className="text-[11px] font-medium text-slate-600/80">
                  {percentText(dailyChangePercent)}
                </span>
              )}
            </Badge>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.dashboard.current}</p>
            <dl className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <dt>{t.dashboard.price}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(currentPrice, 'USD', locale)}</dd>
              </div>
              <div className={`flex items-center justify-between ${currentPnLStyles.text}`}>
                <dt>{t.dashboard.pnl} USD</dt>
                <dd className="font-semibold">{formatCurrency(positionPnLUsd, 'USD', locale)}</dd>
              </div>
              {settings.currency === 'ILS' && (
                <div className={`flex items-center justify-between ${currentPnLStyles.text}`}>
                  <dt>{t.dashboard.pnl} ILS</dt>
                  <dd className="font-semibold">{formatCurrency(positionPnLIls, 'ILS', locale)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.dashboard.projected}</p>
            <dl className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <dt>{t.dashboard.price}</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(projectedPrice, 'USD', locale)}</dd>
              </div>
              <div className={`flex items-center justify-between ${combinedStyles.text}`}>
                <dt>{t.dashboard.combined} USD</dt>
                <dd className="font-semibold">{formatCurrency(combined, 'USD', locale)}</dd>
              </div>
              {settings.currency === 'ILS' && (
                <div className={`flex items-center justify-between ${combinedStyles.text}`}>
                  <dt>{t.dashboard.combined} ILS</dt>
                  <dd className="font-semibold">{formatCurrency(combinedIls, 'ILS', locale)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {position.lots && position.lots.length > 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.dashboard.lotBreakdown}</p>
            <div className="mt-3 space-y-3 text-xs text-slate-600">
              {position.lots.map((lot, index) => {
                const remainingExits = lot.exits && lot.exits.length > 0;
                return (
                  <div key={index} className="rounded-lg bg-slate-50/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-700">
                        {t.dashboard.lotLabel} #{index + 1}
                      </div>
                      <div className="text-slate-500">
                        {formatNumber(lot.entryQuantity, locale)} @ {formatCurrency(lot.entryPrice, 'USD', locale)} • {formatDate(lot.entryDate, locale)}
                      </div>
                    </div>
                    {remainingExits ? (
                      <ul className="mt-2 space-y-1 text-slate-500">
                        {lot.exits?.map((exit, exitIndex) => (
                          <li key={exitIndex} className="flex items-center justify-between">
                            <span>
                              {t.dashboard.exitLabel} #{exitIndex + 1}
                            </span>
                            <span>
                              {formatNumber(exit.quantity, locale)} @ {formatCurrency(exit.exitPrice, 'USD', locale)} • {formatDate(exit.exitDate, locale)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[11px] text-slate-400">{t.dashboard.noExits}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sparklineData && sparklineData.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
            <Sparkline
              data={sparklineData}
              width={360}
              height={140}
              color={sparklineColor.hex}
              baseline={position.entryPrice}
              baselineColor="rgba(148, 163, 184, 0.8)"
              projectedPrice={projectedPrice}
              annualGrowthRate={settings.annualGrowthRate}
              yearsHeld={yearsHeld}
              className="h-36 w-full"
            />
          </div>
        )}

        <div className="flex justify-end">
          <Link
            href={`/stock/${position.symbol}`}
            className="group inline-flex items-center gap-1 text-sm font-semibold text-blue-600 transition-colors hover:text-blue-700"
          >
            {t.dashboard.viewDetails}
            <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
