import { ReactNode } from 'react';

export interface SummaryCardBadge {
  value: string;
  className: string;
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

export interface SummaryCard {
  key: string;
  label: string;
  value: string;
  valueClass?: string;
  secondary?: SummaryCardSecondary;
  helper?: SummaryCardHelper[];
  badge?: SummaryCardBadge;
  footnote?: string;
}

interface SummaryCardGridProps {
  cards: SummaryCard[];
}

export function SummaryCardGrid({ cards }: SummaryCardGridProps) {
  if (!cards.length) {
    return null;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const valueClass = card.valueClass ?? 'text-3xl font-semibold text-slate-900';

        return (
          <div
            key={card.key}
            className="glass-tile card-surface border p-5 transition-all duration-500"
          >
            <div className="glass-glow glass-glow--tile" />
            <div className="relative z-10 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{card.label}</p>
                {card.badge && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${card.badge.className}`}>
                    {card.badge.icon}
                    {card.badge.value}
                  </span>
                )}
              </div>
              <p className={valueClass}>{card.value}</p>
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
              {card.footnote && <p className="text-xs font-medium text-slate-500">{card.footnote}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
