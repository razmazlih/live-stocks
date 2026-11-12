'use client';

import Link from 'next/link';
import { ArrowUpRight, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/calculations';
import { buildStockHref } from '@/lib/navigation-context';
import type { ClosePairProposal } from '@/lib/close-pair-proposals';
import { StockLogo } from '@/components/ui/stock-logo';
import styles from './close-pair-details.module.css';

export function ClosePairDetails({ proposal, locale }: { proposal: ClosePairProposal; locale: 'he' | 'en' }) {
  const he = locale === 'he';
  const money = (value: number) => formatCurrency(value, 'USD', locale);
  const signedMoney = (value: number) => `${value > 0 ? '+' : ''}${money(value)}`;
  const returnTo = typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`;

  return <div className={styles.details}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">{he ? 'איך מתקבל העודף?' : 'How does the surplus add up?'}</h3>
      <span className="text-[11px] text-slate-500">{he ? 'כל הסבבים · USD' : 'All cycles · USD'}</span>
    </div>
    <div className={styles.equation} role="group" aria-label={he ? 'חישוב העודף מעל היעד' : 'Target surplus calculation'}>
      <dl className={styles.equationItem}>
        <dt>{he ? 'רווח מצטבר' : 'Cumulative profit'}</dt>
        <dd><bdi>{money(proposal.netProfitUsd)}</bdi></dd>
      </dl>
      <span aria-hidden="true" className={styles.operator}>−</span>
      <dl className={styles.equationItem}>
        <dt>{he ? 'יעד להיום' : 'Target to date'}</dt>
        <dd className={styles.target}><bdi>{money(proposal.targetProfitUsd)}</bdi></dd>
      </dl>
      <span aria-hidden="true" className={styles.operator}>=</span>
      <dl className={`${styles.equationItem} ${styles.result}`}>
        <dt>{he ? 'מעל היעד' : 'Above target'}</dt>
        <dd><bdi>{money(proposal.surplusUsd)}</bdi></dd>
      </dl>
    </div>

    <ul className={styles.contributions} aria-label={he ? 'התרומה של כל מניה' : 'Each stock’s contribution'}>
      {[proposal.winner, proposal.loser].map(leg => {
        const above = leg.surplusUsd >= 0;
        return <li key={leg.position.symbol} className={`${styles.stock} ${above ? styles.above : styles.below}`}>
          <div className="flex items-start justify-between gap-3">
            <Link href={buildStockHref(leg.position.symbol, returnTo)} className="group flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
              <StockLogo symbol={leg.position.symbol} display={leg.position.display} imageUrl={leg.position.imageUrl} className="h-8 w-8 rounded-lg" />
              <span className="min-w-0"><span className="flex items-center gap-1.5 font-semibold"><bdi>{leg.position.symbol}</bdi><ArrowUpRight aria-hidden className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-blue-600" /></span><span className="mt-0.5 block text-[11px] text-slate-500">{he ? 'כל' : 'All'} {leg.quantity.toLocaleString(locale, { maximumFractionDigits: 8 })} {he ? 'המניות' : 'shares'}</span></span>
            </Link>
            <div className={styles.contribution}>
              <p className="text-[10px] font-medium">{above ? he ? 'עודף מעל היעד' : 'Above target' : he ? 'חסר ליעד' : 'Below target'}</p>
              <p className="mt-0.5 text-xl font-semibold leading-tight tracking-tight tabular-nums"><bdi>{signedMoney(leg.surplusUsd)}</bdi></p>
            </div>
          </div>
          <details className={styles.accounting}>
            <summary>{he ? 'פירוט הרווח והיעד' : 'Profit & target breakdown'}</summary>
            <p className="mb-2 text-[11px] text-slate-500"><bdi>{money(leg.currentPrice)}</bdi> {he ? 'למניה כעת' : 'per share now'}</p>
          <dl className={styles.breakdown}>
            <div><dt>{he ? 'ממומש בעבר' : 'Previously realized'}</dt><dd><bdi>{signedMoney(leg.realizedPnlUsd ?? 0)}</bdi></dd></div>
            <div><dt>{he ? 'בהחזקה הנוכחית' : 'Current unrealized'}</dt><dd><bdi>{signedMoney(leg.unrealizedPnlUsd ?? leg.pnlUsd)}</bdi></dd></div>
            <div className={styles.total}><dt>{he ? 'רווח מצטבר' : 'Cumulative P/L'}</dt><dd><bdi>{signedMoney(leg.pnlUsd)}</bdi></dd></div>
            <div><dt>{he ? 'יעד אישי לכל הסבבים' : 'Personal target · all cycles'}</dt><dd className={styles.target}><bdi>{money(leg.targetProfitUsd)}</bdi></dd></div>
          </dl>
          </details>
        </li>;
      })}
    </ul>

    <div className={styles.proceeds}>
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden className="hidden h-8 w-8 sm:flex shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-white"><Wallet className="h-4 w-4 text-blue-600" /></span>
        <div><p className="text-xs font-semibold text-slate-800">{he ? 'תמורת מכירה משוערת' : 'Estimated sale proceeds'}</p><p className="mt-0.5 text-[11px] text-slate-500">{he ? 'מהמניות שייסגרו עכשיו · ברוטו' : 'From shares sold now · gross'}</p></div>
      </div>
      <p className="text-lg font-semibold tracking-tight text-slate-900 tabular-nums"><bdi>{money(proposal.proceedsUsd)}</bdi></p>
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{he ? 'מימושי העבר כלולים ברווח, לא בתמורה החדשה. לפני מס ועלויות מכירה.' : 'Past sales count toward profit, not new proceeds. Before tax and exit costs.'}</p>
  </div>;
}
