import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactElement } from 'react';

export type TrendToneKey = 'positive' | 'negative' | 'neutral';

export type TrendTone = {
  text: string;
  bg: string;
  badge: string;
  border: string;
  surface: string;
};

const TREND_TONES: Record<TrendToneKey, TrendTone> = {
  positive: {
    text: 'text-emerald-600',
    bg: 'bg-emerald-50',
    badge: 'bg-emerald-50 text-emerald-600',
    border: 'border-emerald-100',
    surface: 'border border-emerald-100 bg-emerald-50',
  },
  negative: {
    text: 'text-rose-600',
    bg: 'bg-rose-50',
    badge: 'bg-rose-50 text-rose-600',
    border: 'border-rose-100',
    surface: 'border border-rose-100 bg-rose-50',
  },
  neutral: {
    text: 'text-slate-600',
    bg: 'bg-slate-50',
    badge: 'bg-slate-100 text-slate-500',
    border: 'border-slate-200',
    surface: 'border border-slate-200 bg-slate-50',
  },
};

export function resolveTrendToneKey(value: number, threshold = 0): TrendToneKey {
  if (!Number.isFinite(value) || Math.abs(value) <= threshold) {
    return 'neutral';
  }

  if (value > threshold) {
    return 'positive';
  }

  if (value < -threshold) {
    return 'negative';
  }

  return 'neutral';
}

export function getTrendTone(value: number, threshold = 0): TrendTone {
  return TREND_TONES[resolveTrendToneKey(value, threshold)];
}

export function getTrendIcon(value: number, className = 'h-4 w-4', threshold = 0): ReactElement {
  const tone = resolveTrendToneKey(value, threshold);

  if (tone === 'positive') {
    return <ArrowUpRight className={className} />;
  }

  if (tone === 'negative') {
    return <ArrowDownRight className={className} />;
  }

  return <Minus className={className} />;
}

export function getTrendColor(value: number, threshold = 0): string {
  const tone = resolveTrendToneKey(value, threshold);

  if (tone === 'positive') {
    return 'var(--color-emerald-500)';
  }

  if (tone === 'negative') {
    return 'var(--color-rose-500)';
  }

  return 'var(--color-primary-500)';
}

export function getTrendPresentation(
  value: number,
  options: {
    threshold?: number;
    iconClassName?: string;
    hideNeutralIcon?: boolean;
  } = {},
) {
  const threshold = options.threshold ?? 0;
  const key = resolveTrendToneKey(value, threshold);

  return {
    key,
    ...TREND_TONES[key],
    color: getTrendColor(value, threshold),
    icon: options.hideNeutralIcon && key === 'neutral'
      ? null
      : getTrendIcon(value, options.iconClassName, threshold),
  };
}
