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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const valueClass = card.valueClass ?? 'text-2xl font-semibold text-slate-950';
        const hasDetails = Boolean(card.secondary || card.helper?.length || card.footnote);

        return (
          <div
            key={card.key}
            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors duration-200 hover:border-blue-200"
          >
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-500">{card.label}</p>
                {card.badge && (
                  <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${card.badge.className}`}>
                    {card.badge.icon}
                    {card.badge.value}
                  </span>
                )}
              </div>
              <p className={`${valueClass.replace('text-3xl', 'text-2xl')} leading-none tracking-tight`}>{card.value}</p>

              {hasDetails && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                {card.secondary && (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-sm">
                    <span className="min-w-0 break-words font-medium text-slate-500">{card.secondary.label}:</span>
                    <span className="shrink-0 whitespace-nowrap text-end font-semibold tabular-nums text-slate-700">{card.secondary.value}</span>
                  </div>
                )}
                {card.helper?.map((helper) => (
                  <div key={`${card.key}-${helper.label}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
                    <span className="min-w-0 break-words text-slate-500">{helper.label}:</span>
                    <span className="shrink-0 whitespace-nowrap text-end font-semibold tabular-nums text-slate-700">{helper.value}</span>
                  </div>
                ))}
                {card.footnote && (
                  <p className="border-t border-slate-200 pt-2 text-xs font-medium text-slate-500">
                    {card.footnote}
                  </p>
                )}
              </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
