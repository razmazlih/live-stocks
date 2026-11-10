'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Layers } from 'lucide-react';
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
  // No eligible pair means no extra surface in the overview.
  if (!proposals.length) return null;

  return <section className="rounded-xl border border-slate-200 bg-white">
    <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)} className="flex min-h-14 w-full items-center gap-3 rounded-xl p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <Layers aria-hidden className="h-4 w-4 shrink-0 text-slate-500" />
      <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{he ? 'הצעות לסגירת שתי פוזיציות' : 'Two-position exit ideas'}<span className="mt-1 block text-xs font-normal text-slate-500">{he ? 'רווח שמכסה הפסד · סגירה מלאה של שתיהן' : 'Profit covers loss · close both in full'}</span></span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{proposals.length}</span>
      <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-slate-500 motion-safe:transition-transform ${expanded ? 'rotate-180' : ''}`} />
    </button>
    <div id={panelId} hidden={!expanded}>
      {expanded ? <div className="space-y-3 border-t border-slate-100 p-4 sm:p-5">
        <p className="text-xs leading-5 text-slate-500">{he ? 'עד 3 חלופות באותו חשבון: תחילה ההפסד הגדול ביותר שניתן לכסות, ואז הרווח המשולב הגבוה ביותר. כל חלופה נבחנת בנפרד; אותה פוזיציה עשויה להופיע בכמה חלופות.' : 'Up to 3 alternatives in the same account: largest covered loss first, then highest combined profit. Each alternative stands alone; a holding may appear in several alternatives.'}</p>
        {proposals.map((proposal, index) => <article key={`${proposal.winner.position.id ?? proposal.winner.position.symbol}-${proposal.loser.position.id ?? proposal.loser.position.symbol}-${index}`} className="min-w-0 rounded-lg border border-slate-200 p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-slate-900"><bdi>{proposal.winner.position.symbol} + {proposal.loser.position.symbol}</bdi><span className="ms-2 text-xs font-normal text-slate-500">{proposal.winner.position.location === 'bank_two' ? (he ? 'בנק 2' : 'Bank 2') : (he ? 'בנק 1' : 'Bank 1')}</span></h3>
          <ul className="mt-3 space-y-2 text-sm">
            {[proposal.winner, proposal.loser].map(leg => <li key={leg.position.symbol} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="min-w-0"><Link href={buildStockHref(leg.position.symbol, typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`)} className="font-medium text-blue-700 underline-offset-4 hover:underline"><bdi>{leg.position.symbol}</bdi></Link><span className="ms-2 text-xs text-slate-500">{he ? 'כל' : 'All'} {leg.quantity.toLocaleString(locale, { maximumFractionDigits: 8 })} {he ? 'המניות' : 'shares'} · {money(leg.currentPrice)} {he ? 'למניה' : '/ share'}</span></span>
              <bdi className={`font-medium tabular-nums ${leg.pnlUsd > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{leg.pnlUsd > 0 ? '+' : ''}{money(leg.pnlUsd)}</bdi>
            </li>)}
          </ul>
          <dl className="mt-3 flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
            <div><dt className="text-slate-500">{he ? 'רווח משולב לפני מס ועלויות מכירה' : 'Combined profit before tax & exit costs'}</dt><dd className="mt-1 text-base font-semibold text-emerald-700"><bdi>+{money(proposal.netProfitUsd)}</bdi></dd></div>
            <div><dt className="text-slate-500">{he ? 'תמורת מכירה משוערת' : 'Estimated sale proceeds'}</dt><dd className="mt-1 font-medium text-slate-700"><bdi>{money(proposal.proceedsUsd)}</bdi></dd></div>
          </dl>
        </article>)}
        <p className="text-xs leading-5 text-slate-500">{he ? 'הדמיה בדולרים לפי המחירים הזמינים ועלות המניות שנותרו בשיטת FIFO, כולל עמלות קנייה שהוזנו. מס, עמלות מכירה ושינויי מחיר אינם כלולים ועשויים לשנות את התוצאה. ההצעות אינן מבצעות מכירה.' : 'USD simulation using available prices and remaining FIFO cost, including recorded purchase fees. Tax, exit fees and price changes are excluded and may change the result. These ideas do not execute trades.'}</p>
      </div> : null}
    </div>
  </section>;
}
