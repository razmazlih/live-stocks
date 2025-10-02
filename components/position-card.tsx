'use client';

import { PositionMetrics } from '@/types';
import { formatCurrency, formatNumber, formatDate } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sparkline } from './sparkline';
import Link from 'next/link';

interface PositionCardProps {
  metrics: PositionMetrics;
  sparklineData?: number[];
}

export function PositionCard({ metrics, sparklineData }: PositionCardProps) {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const { position, currentPrice, positionPnLUsd, positionPnLIls, projectedPrice, projectedPnLUsd, projectedPnLIls } = metrics;

  const currentPnLColor = (() => {
    if (currentPrice < position.entryPrice) {
      return { className: 'text-[#D22E2E]', hex: '#D22E2E' };
    }

    if (currentPrice > projectedPrice) {
      return { className: 'text-[#4AA956]', hex: '#4AA956' };
    }

    return { className: 'text-[#2563EB]', hex: '#2563EB' };
  })();
  const isPositiveProjectedDelta = (projectedPrice - position.entryPrice) >= 0;

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 bg-white/50 hover:bg-white/70 transition-colors">
      <Avatar className="h-12 w-12 rounded-full border-2 border-white shadow-sm">
        <AvatarImage src={position.imageUrl} alt={position.display} />
        <AvatarFallback className="bg-blue-100 text-blue-600 font-semibold">
          {position.symbol.slice(0, 2)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-semibold text-gray-900">{position.display}</h3>
          <Badge variant="secondary" className="text-xs">
            {position.symbol}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-3">
          <div className="text-gray-600">
            {t.dashboard.quantity}: <span className="font-medium text-gray-900">{formatNumber(position.quantity, locale)}</span>
          </div>
          <div className="text-gray-600">
            {t.dashboard.entryPrice}: <span className="font-medium text-gray-900">{formatCurrency(position.entryPrice, 'USD', locale)}</span>
          </div>
          <div className="text-gray-600 col-span-2">
            {t.dashboard.since} {formatDate(position.entryDate, locale)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-500 uppercase">{t.dashboard.current}</div>
            <div className="text-sm">
              <div className="text-gray-700">{t.dashboard.price}: <span className="font-semibold">{formatCurrency(currentPrice, 'USD', locale)}</span></div>
              <div className={currentPnLColor.className}>
                {t.dashboard.pnl} USD: <span className="font-semibold">{formatCurrency(positionPnLUsd, 'USD', locale)}</span>
              </div>
              {settings.currency === 'ILS' && (
                <div className={currentPnLColor.className}>
                  {t.dashboard.pnl} ILS: <span className="font-semibold">{formatCurrency(positionPnLIls, 'ILS', locale)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-500 uppercase">{t.dashboard.projected}</div>
            <div className="text-sm">
              <div className="text-gray-700">{t.dashboard.price}: <span className="font-semibold">{formatCurrency(projectedPrice, 'USD', locale)}</span></div>
              <div className={isPositiveProjectedDelta ? 'text-[#4AA956]' : 'text-[#D22E2E]'}>
                {t.dashboard.pnl} USD: <span className="font-semibold">{formatCurrency(projectedPnLUsd, 'USD', locale)}</span>
              </div>
              {settings.currency === 'ILS' && (
                <div className={isPositiveProjectedDelta ? 'text-[#4AA956]' : 'text-[#D22E2E]'}>
                  {t.dashboard.pnl} ILS: <span className="font-semibold">{formatCurrency(projectedPnLIls, 'ILS', locale)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {sparklineData && sparklineData.length > 0 && (
          <div className="mt-3">
            <Sparkline
              data={sparklineData}
              color={currentPnLColor.hex}
              className="opacity-60"
            />
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Link
            href={`/stock/${position.symbol}`}
            className="text-sm font-medium text-[#3B82F6] hover:underline"
          >
            {t.dashboard.viewDetails}
          </Link>
        </div>
      </div>
    </div>
  );
}
