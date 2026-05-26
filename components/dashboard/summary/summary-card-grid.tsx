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
        const hasDetails = Boolean(card.secondary || card.helper?.length || card.footnote);

        return (
          <div
            key={card.key}
            className="home-summary-card group relative overflow-hidden rounded-3xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
          >
            <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent" />
            <div className="pointer-events-none absolute -right-16 top-0 h-44 w-44 rounded-full card-glow blur-3xl" />
            <div className="relative z-10 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold tracking-wide text-slate-600">{card.label}</p>
                {card.badge && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${card.badge.className}`}>
                    {card.badge.icon}
                    {card.badge.value}
                  </span>
                )}
              </div>
              <p className={`${valueClass} leading-none tracking-tight`}>{card.value}</p>

              {hasDetails && (
              <div className="space-y-2 rounded-2xl border border-sky-100/80 bg-white/70 px-4 py-3 backdrop-blur-sm">
                {card.secondary && (
                  <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-sm">
                    <span className="font-medium text-slate-500">{card.secondary.label}:</span>
                    <span className="font-semibold text-slate-700">{card.secondary.value}</span>
                  </div>
                )}
                {card.helper?.map((helper) => (
                  <div key={`${card.key}-${helper.label}`} className="grid grid-cols-[auto_1fr] items-center gap-2 text-xs">
                    <span className="text-slate-500">{helper.label}:</span>
                    <span className="font-semibold text-slate-700">{helper.value}</span>
                  </div>
                ))}
                {card.footnote && (
                  <p className="border-t border-sky-100/70 pt-2 text-xs font-medium text-slate-500">
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
