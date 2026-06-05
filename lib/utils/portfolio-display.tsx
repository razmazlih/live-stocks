import { formatCurrency, formatPercent, formatTime } from '@/lib/display/formatting';
import type { Locale } from '@/types';
export { getTrendColor, getTrendIcon, getTrendTone, resolveTrendToneKey } from '@/lib/display/trends';
export type { TrendTone, TrendToneKey } from '@/lib/display/trends';

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

  return formatTime(lastUpdate, locale);
}
