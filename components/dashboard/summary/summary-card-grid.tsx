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
        const valueClass = card.valueClass ?? 'text-3xl font-semibold text-foreground';

        return (
          <div
            key={card.key}
            className="relative overflow-hidden rounded-3xl border card-surface p-5 transition-shadow duration-300"
          >
            <div className="pointer-events-none absolute -right-12 top-0 h-36 w-36 rounded-full card-glow blur-3xl" />
            <div className="relative z-10 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                {card.badge && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${card.badge.className}`}>
                    {card.badge.icon}
                    {card.badge.value}
                  </span>
                )}
              </div>
              <p className={valueClass}>{card.value}</p>
              {card.secondary && (
                <p className="text-sm text-muted-foreground">
                  {card.secondary.label}:{' '}
                  <span className="font-medium text-foreground">{card.secondary.value}</span>
                </p>
              )}
              {card.helper?.map((helper) => (
                <p key={`${card.key}-${helper.label}`} className="text-xs text-muted-foreground">
                  {helper.label}:{' '}
                  <span className="font-medium text-foreground">{helper.value}</span>
                </p>
              ))}
              {card.footnote && <p className="text-xs font-medium text-muted-foreground">{card.footnote}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
