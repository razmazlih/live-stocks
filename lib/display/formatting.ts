import type { Locale } from '@/types';

export function resolveIntlLocale(locale: Locale = 'he'): string {
  return locale === 'he' ? 'he-IL' : 'en-US';
}

export function formatCurrency(value: number, currency: 'USD' | 'ILS', locale: Locale = 'he'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, locale: Locale = 'he'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, locale: Locale = 'he'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(resolveIntlLocale(locale), {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function formatDate(date: string | Date, locale: Locale = 'he'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(resolveIntlLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(date: Date, locale: Locale = 'he'): string {
  return date.toLocaleTimeString(resolveIntlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
  });
}
