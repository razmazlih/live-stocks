import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactElement } from 'react';

import { formatCurrency, formatPercent } from '@/lib/calculations';
import type { Locale } from '@/types';

type TrendToneKey = 'positive' | 'negative' | 'neutral';

export type TrendTone = {
  text: string;
  badge: string;
  border: string;
};

const TREND_TONES: Record<TrendToneKey, TrendTone> = {
  positive: {
    text: 'text-emerald-600',
    badge: 'bg-emerald-50 text-emerald-600',
    border: 'border-emerald-100',
  },
  negative: {
    text: 'text-rose-600',
    badge: 'bg-rose-50 text-rose-600',
    border: 'border-rose-100',
  },
  neutral: {
    text: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-500',
    border: 'border-slate-200',
  },
};

function resolveTrendToneKey(value: number): TrendToneKey {
  if (value > 0) {
    return 'positive';
  }

  if (value < 0) {
    return 'negative';
  }

  return 'neutral';
}

export function getTrendTone(value: number): TrendTone {
  return TREND_TONES[resolveTrendToneKey(value)];
}

export function getTrendIcon(value: number, className = 'h-4 w-4'): ReactElement {
  if (value > 0) {
    return <ArrowUpRight className={className} />;
  }

  if (value < 0) {
    return <ArrowDownRight className={className} />;
  }

  return <Minus className={className} />;
}

export function formatSignedValue(value: number, formatter: (value: number) => string): string {
  const formatted = formatter(value);
  return value > 0 ? `+${formatted}` : formatted;
}

export function formatSignedCurrency(
  value: number,
  currency: 'USD' | 'ILS',
  locale: Locale,
): string {
  return formatSignedValue(value, (amount) => formatCurrency(amount, currency, locale));
}

export function formatSignedPercent(value: number, locale: Locale): string {
  return formatSignedValue(value, (amount) => formatPercent(amount, locale));
}

export function formatLastUpdatedTime(lastUpdate: Date | null | undefined, locale: Locale): string | null {
  if (!lastUpdate) {
    return null;
  }

  return lastUpdate.toLocaleTimeString(locale === 'he' ? 'he-IL' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
