import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface SummaryCardBadgeTone {
  text: string;
  badge: string;
}

export interface SummaryCardBadge {
  value: string;
  tone: SummaryCardBadgeTone;
  icon: ReactNode;
}

export interface SummaryCardHelper {
  label: string;
  value: string;
}

export interface SummaryCardSecondary {
  label: string;
  value: string;
}

export interface SummaryCardItem {
  key: string;
  label: string;
  value: string;
  valueClass?: string;
  secondary?: SummaryCardSecondary;
  helper?: SummaryCardHelper[];
  badge?: SummaryCardBadge;
  footnote?: string;
}

export interface SummarySectionBadge {
  value: string;
  label: string;
  toneClass: string;
  icon: ReactNode;
}

interface SummarySectionProps {
  title: string;
  cards: SummaryCardItem[];
  dailyChangeBadge?: SummarySectionBadge;
}

export function SummarySection({ title, cards, dailyChangeBadge }: SummarySectionProps) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {dailyChangeBadge && (
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm',
              dailyChangeBadge.toneClass,
            )}
          >
            {dailyChangeBadge.icon}
            {dailyChangeBadge.value}
            <span className="text-xs font-medium text-slate-600/80">{dailyChangeBadge.label}</span>
          </span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="relative overflow-hidden rounded-3xl border border-white/70 bg-white/90 p-5 shadow-inner"
          >
            <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-blue-100/40 blur-3xl" />
            <div className="relative z-10 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{card.label}</p>
                {card.badge && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                      card.badge.tone.badge,
                    )}
                  >
                    {card.badge.icon}
                    {card.badge.value}
                  </span>
                )}
              </div>
              <p className={cn(card.valueClass)}>{card.value}</p>
              {card.secondary && (
                <p className="text-sm text-slate-500">
                  {card.secondary.label}:{' '}
                  <span className="font-medium text-slate-700">{card.secondary.value}</span>
                </p>
              )}
              {card.helper?.map((helper) => (
                <p key={`${card.key}-${helper.label}`} className="text-xs text-slate-500">
                  {helper.label}:{' '}
                  <span className="font-medium text-slate-700">{helper.value}</span>
                </p>
              ))}
              {card.footnote && (
                <p className="text-xs font-medium text-slate-500">{card.footnote}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
