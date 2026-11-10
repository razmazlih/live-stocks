'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, ChevronDown } from 'lucide-react';
import { buildClosePairProposals } from '@/lib/close-pair-proposals';
import { formatCurrency } from '@/lib/calculations';
import { useApp } from '@/lib/context';
import { buildStockHref } from '@/lib/navigation-context';
import type { PositionMetrics } from '@/types';

export function ClosePairProposals({ metrics }: { metrics: PositionMetrics[] }) {
  const { locale } = useApp();
  const he = locale === 'he';
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const proposals = useMemo(() => buildClosePairProposals(metrics), [metrics]);
  const money = (value: number) => formatCurrency(value, 'USD', locale);
  if (!proposals.length) return null;

  return <section className={`holding-card overflow-hidden ${expanded ? 'holding-card-open' : ''}`} aria-label={he ? 'הצעות לסגירת שתי פוזיציות' : 'Two-position exit ideas'}>
    <button type="button" aria-expanded={expanded} aria-controls={proposals.map((_, index) => `${panelId}-${index}`).join(' ')} onClick={() => setExpanded(value => !value)} className="holding-toggle flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5">
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="holding-monogram flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50/60 text-blue-600"><ArrowLeftRight className="h-4 w-4" /></span>
        <span className="min-w-0"><span className="block text-base font-semibold tracking-tight text-slate-950">{he ? 'הצעות לסגירת שתי פוזיציות' : 'Two-position exit ideas'}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{he ? 'רווח שמכסה הפסד · סגירה מלאה' : 'Profit covers loss · full exits'}</span></span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-blue-700"><span className="hidden sm:inline">{expanded ? (he ? 'פחות פרטים' : 'Less detail') : (he ? 'לפירוט החלופות' : 'Explore alternatives')}</span><ChevronDown aria-hidden className="holding-chevron h-4 w-4 text-slate-400" /></span>
    </button>

    <div data-testid="close-pair-preview" className="grid divide-y divide-slate-100 border-t border-slate-100 xl:grid-cols-3 xl:divide-y-0">
      {proposals.map((proposal, index) => <article key={`${proposal.winner.position.id ?? proposal.winner.position.symbol}-${proposal.loser.position.id ?? proposal.loser.position.symbol}`} className={`min-w-0 ${index ? 'xl:border-s xl:border-slate-100' : ''}`}>
        <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold tracking-tight text-slate-950" dir="ltr"><span>{proposal.winner.position.symbol}</span><span className="text-xs font-normal text-slate-300"> + </span><span>{proposal.loser.position.symbol}</span></h3>
            <p className="mt-1.5 text-[11px] text-slate-500">{he ? `חלופה ${index + 1}` : `Option ${index + 1}`}<span className="mx-1.5 text-slate-300">·</span>{proposal.winner.position.location === 'bank_two' ? (he ? 'בנק 2' : 'Bank 2') : (he ? 'בנק 1' : 'Bank 1')}</p>
          </div>
          <div className="shrink-0 text-end"><p className="text-[11px] text-slate-500">{he ? 'רווח משולב · USD' : 'Combined profit · USD'}</p><p className="mt-1 text-lg font-semibold tracking-tight text-emerald-700"><bdi>+{money(proposal.netProfitUsd)}</bdi></p></div>
        </div>
        <div id={`${panelId}-${index}`} aria-hidden={!expanded} ref={element => { if (expanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal">
          <div className="min-h-0 overflow-hidden">
            <div className="holding-detail-content px-4 pb-4 sm:px-5 sm:pb-5">
              <ul className="space-y-1 border-t border-slate-200/70 pt-2 text-sm">
                {[proposal.winner, proposal.loser].map(leg => <li key={leg.position.symbol} className="flex items-center justify-between gap-3">
                  <Link href={buildStockHref(leg.position.symbol, typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-blue-700 underline-offset-4 transition-colors hover:text-blue-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${leg.pnlUsd > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className="min-w-0"><bdi className="block font-medium">{leg.position.symbol}</bdi><span className="mt-0.5 block text-[11px] text-slate-500">{he ? 'כל' : 'All'} {leg.quantity.toLocaleString(locale, { maximumFractionDigits: 8 })} {he ? 'המניות' : 'shares'} · <bdi>{money(leg.currentPrice)}</bdi> {he ? 'למניה' : '/ share'}</span></span>
                  </Link>
                  <bdi className={`shrink-0 text-sm font-medium tabular-nums ${leg.pnlUsd > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{leg.pnlUsd > 0 ? '+' : ''}{money(leg.pnlUsd)}</bdi>
                </li>)}
              </ul>
              <dl className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/70 pt-3 text-xs"><dt className="text-slate-500">{he ? 'תמורת מכירה משוערת' : 'Estimated sale proceeds'}</dt><dd className="font-medium tabular-nums text-slate-900"><bdi>{money(proposal.proceedsUsd)}</bdi></dd></dl>
            </div>
          </div>
        </div>
      </article>)}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-[11px] leading-5 text-slate-500 sm:px-5">
      <p>{he ? 'USD · לפני מס ועלויות מכירה' : 'USD · before tax & exit costs'}</p>
      <p>{he ? 'חלופות נפרדות, לא תוכנית מכירה משותפת' : 'Separate alternatives, not a combined trading plan'}</p>
    </div>
    <div aria-hidden={!expanded} ref={element => { if (expanded) element?.removeAttribute('inert'); else element?.setAttribute('inert', ''); }} className="holding-reveal"><div className="min-h-0 overflow-hidden"><p className="holding-detail-content px-4 pb-4 text-[11px] leading-relaxed text-slate-500 sm:px-5">{he ? 'הדמיה בדולרים לפי המחירים הזמינים ועלות FIFO, כולל עמלות קנייה שהוזנו. מס, עמלות מכירה ושינויי מחיר אינם כלולים ועשויים לשנות את התוצאה. מיון לפי ההפסד המכוסה ואז הרווח שנותר; אותה פוזיציה עשויה להופיע בכמה חלופות. ההצעות אינן מבצעות מכירה.' : 'USD simulation using available prices and FIFO cost, including recorded purchase fees. Tax, exit fees and price changes are excluded and may change the result. Ranked by covered loss, then remaining profit; alternatives may share a holding. These ideas do not execute trades.'}</p></div></div>
  </section>;
}
