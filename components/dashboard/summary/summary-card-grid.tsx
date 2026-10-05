import { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  locale?: 'he' | 'en';
}

export function SummaryCardGrid({ cards, locale = 'he' }: SummaryCardGridProps) {
  if (!cards.length) return null;
  const [primary, ...supporting] = cards;
  const detailedCards = cards.filter((card) => card.secondary || card.helper?.length || card.footnote);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={locale === 'he' ? 'סיכום התיק' : 'Portfolio summary'}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-blue-50/70 to-white px-5 py-5 sm:px-6 sm:py-6">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{primary.label}</p>
          <p className="mt-2 break-words text-3xl font-semibold leading-tight tracking-tight text-slate-950 tabular-nums sm:text-4xl" dir="ltr">{primary.value}</p>
        </div>
        {primary.badge ? <span className={cn('inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-semibold tabular-nums', primary.badge.className)}>{primary.badge.icon}<bdi>{primary.badge.value}</bdi></span> : null}
      </div>
      {supporting.length > 0 ? (
        <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-3 sm:divide-y-0">
          {supporting.map((card) => <div key={card.key} className="flex min-w-0 items-center justify-between gap-3 px-5 py-3 sm:block sm:px-6 sm:py-5">
            <p className="min-w-0 text-xs font-medium leading-relaxed text-slate-500 sm:text-sm">{card.label}</p>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:mt-2 sm:justify-start">
              <p className={cn(card.valueClass ?? 'font-semibold text-slate-950', 'whitespace-nowrap text-base leading-tight tracking-tight tabular-nums sm:text-xl')} dir="ltr">{card.value}</p>
              {card.badge ? <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-xs font-semibold tabular-nums', card.badge.className)}>{card.badge.icon}<bdi>{card.badge.value}</bdi></span> : null}
            </div>
          </div>)}
        </div>
      ) : null}
      {detailedCards.length > 0 ? (
        <details className="summary-details border-t border-slate-100">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 px-5 py-3 text-xs font-medium text-slate-500 transition-colors duration-150 hover:bg-slate-50 hover:text-blue-700 sm:px-6">
            <span>{locale === 'he' ? 'פירוט נוסף ומטבעות' : 'Details and currencies'}</span>
            <ChevronDown aria-hidden="true" className="summary-chevron h-4 w-4 transition-transform duration-200" />
          </summary>
          <div className="summary-details-content grid gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
            {detailedCards.map((card) => <div key={card.key} className="min-w-0 space-y-2">
              <p className="text-xs font-semibold text-slate-700">{card.label}</p>
              {[...(card.secondary ? [card.secondary] : []), ...(card.helper ?? [])].map((detail, index) => <div key={`${card.key}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-xs">
                <span className="text-slate-500">{detail.label}</span><bdi className="font-medium tabular-nums text-slate-700">{detail.value}</bdi>
              </div>)}
              {card.footnote ? <p className="text-xs leading-relaxed text-slate-500">{card.footnote}</p> : null}
            </div>)}
          </div>
        </details>
      ) : null}
    </section>
  );
}
