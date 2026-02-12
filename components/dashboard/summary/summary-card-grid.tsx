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
            className="home-summary-card relative overflow-hidden rounded-3xl border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl"
          >
            <div className="pointer-events-none absolute -right-16 top-0 h-44 w-44 rounded-full card-glow blur-3xl" />
            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-500">{card.label}</p>
                {card.badge && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold shadow-sm ${card.badge.className}`}>
                    {card.badge.icon}
                    {card.badge.value}
                  </span>
                )}
              </div>
              <p className={`${valueClass} tracking-tight`}>{card.value}</p>

              <div className="space-y-2 rounded-2xl border border-[color:var(--color-slate-100)]/90 bg-[color:var(--color-neutral-white)]/65 px-3 py-2.5">
                {card.secondary && (
                  <p className="text-sm text-slate-500">
                    {card.secondary.label}:{' '}
                    <span className="font-semibold text-slate-700">{card.secondary.value}</span>
                  </p>
                )}
                {card.helper?.map((helper) => (
                  <p key={`${card.key}-${helper.label}`} className="text-xs text-slate-500">
                    {helper.label}:{' '}
                    <span className="font-semibold text-slate-700">{helper.value}</span>
                  </p>
                ))}
                {card.footnote && <p className="text-xs font-medium text-slate-500">{card.footnote}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
