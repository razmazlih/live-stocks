'use client';

import { useSyncExternalStore } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import styles from '@/components/portfolio/market-overview-surface.module.css';
import { subscribeLocalMarketMode } from '@/hooks/use-local-market-mode';
import { readMarketLayoutPhase } from '@/lib/demo/review';
import type { MarketPhase } from '@/lib/utils/trading-hours';
import { DashboardSurface } from './page-primitives';
import loadingStyles from './overview-skeleton.module.css';

type Locale = 'he' | 'en';

// Preserve each label or figure's real typographic line box across viewport sizes.
function Line({ width, numeric = false }: { width: string; numeric?: boolean }) {
  return <span className={loadingStyles.line} data-number={numeric || undefined} style={{ width }}>&nbsp;</span>;
}

function PaneTitle() {
  return <div className={styles.eyebrow}><Line width="1.12rem" /><Line width="9rem" /></div>;
}

function DailyPane({ leading, compact }: { leading: boolean; compact: boolean }) {
  return <div className={styles.pane} data-part="daily" data-compact={compact || undefined}>
    <PaneTitle />
    <div className={styles.metricLine}><span className={'inline-flex min-h-[44px] items-center ' + styles.metricAction}><span className={leading ? styles.bigNumber : styles.subNumber}><Line width="3.6em" /></span></span><span className={styles.percent}><Line width="3em" /></span></div>
    <div className={styles.note}><Line width="8rem" /></div>
    {leading && <div className={styles.drivers}>
      <h3><Line width="9rem" /></h3>
      <ul className={styles.rows}>{[0, 1, 2].map(row => <li key={row}>
        <span className={styles.rowName}><span className={styles.stockAction + ' inline-flex min-h-[44px] items-center'}><Line width="2.5rem" /></span></span>
        <span className={styles.diverging} /><span className={styles.rowAmount}><Line width="3.5rem" /></span>
      </li>)}</ul>
    </div>}
    <span className={styles.more}><Line width="7rem" /></span>
  </div>;
}

function TargetPane({ regular }: { regular: boolean }) {
  return <div className={styles.pane} data-part="target">
    <PaneTitle />
    <div className={styles.metricLine}><span className={'min-h-[44px] ' + (regular ? styles.subNumber : styles.bigNumber)}><Line width="4em" /></span></div>
    {!regular && <div className={styles.note}><Line width="8rem" /></div>}
    <div className={styles.comparison} />
    <dl className={styles.pair}>{[0, 1].map(i => <div key={i}>
      <dt><Line width="6rem" /></dt><dd><Line numeric width="4.75rem" /></dd>
    </div>)}</dl>
  </div>;
}

function MoverPane() {
  return <div className={styles.pane} data-part="mover">
    <PaneTitle />
    <div className={styles.moverIdentity}><bdi className={styles.stockAction + ' inline-flex min-h-[44px] items-center'}><Line width="3.5rem" /></bdi><span><Line width="6rem" /></span></div>
    <div className={styles.metricLine}><span className={styles.subNumber}><Line width="3em" /></span></div>
    <div className={styles.note}><Line width="10rem" /></div>
    <span className={styles.more}><Line width="7rem" /></span>
    <div className={styles.note}><Line width="8rem" /></div>
  </div>;
}

const serverPhase = () => null;
const initialPhases = ['regular', 'post', 'closed', 'unknown'] as const;

function MarketWorkspace({ session, initial = false }: { session: MarketPhase; initial?: boolean }) {
  const regular = session === 'regular';
  const extended = session === 'pre' || session === 'post' || session === 'overnight';
  return <div className={styles.workspace} data-solo={session === 'unknown' || undefined} data-extended={extended || undefined}
    data-entry-phase={initial ? (extended ? 'extended' : session) : undefined}>
      {regular && <DailyPane leading compact={false} />}
      <TargetPane regular={regular} />
      {!regular && session !== 'unknown' && <DailyPane leading={false} compact={extended} />}
      {extended && <MoverPane />}
  </div>;
}

function MarketShape({ phase }: { phase?: MarketPhase }) {
  const expectedPhase = useSyncExternalStore(subscribeLocalMarketMode, readMarketLayoutPhase, serverPhase);
  const session = phase ?? expectedPhase;
  return <div aria-hidden="true" className={styles.surface + ' ' + loadingStyles.market} data-market-skeleton>
    <div className={styles.balance}><span className="w-[1.15rem]"><Line width="100%" /></span><Line width="7rem" /><bdi><Line width="6rem" /></bdi></div>
    {session ? <MarketWorkspace session={session} /> : initialPhases.map(value => <MarketWorkspace key={value} session={value} initial />)}
    <div className={styles.basis}><span className={loadingStyles.basisRow}><Line width="11rem" /><Line width="5rem" /></span></div>
  </div>;
}

export function MarketOverviewSkeleton({ locale, phase }: { locale: Locale; phase?: MarketPhase }) {
  return <div role="status"><span className="sr-only">{locale === 'he' ? 'טוען את נתוני המסחר' : 'Loading market data'}</span><MarketShape phase={phase} /></div>;
}

function ProposalSkeleton() {
  return <div aria-hidden="true" className="overflow-hidden rounded-[var(--panel-radius)] border border-slate-200 bg-white">
    <div className="flex min-h-12 items-center justify-between gap-2 px-4 py-3 text-base sm:px-5 sm:text-lg"><Line width="10rem" /><Line width="3.5rem" /></div>
    <div className="grid items-start gap-2 border-t border-slate-100 p-2 sm:px-3">
      <div className="holding-card">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-1 pt-2.5 sm:px-5">
          <div><div className="flex gap-1.5"><Skeleton className="h-[30px] w-11" /><Skeleton className="h-[30px] w-11" /></div><div className="mt-1 text-xs leading-4"><Line width="4rem" /></div></div>
          <div className="text-end"><div className="text-[11px]"><Line width="6rem" /></div><div className="mt-1 text-2xl leading-tight"><Line numeric width="4rem" /></div></div>
        </div>
        <div className="px-4 pb-1 sm:px-5"><Skeleton className="h-9 rounded-lg" /></div>
        <div className="mx-4 flex min-h-8 items-center justify-between gap-3 border-t border-slate-100 pb-2 pt-1.5 text-xs sm:mx-5"><Line width="7rem" /><Line width="4rem" /></div>
      </div>
    </div>
  </div>;
}

function HoldingCardSkeleton() {
  return <div className="holding-card overview-holding-card px-4 pb-3 pt-4 sm:px-5">
    <div className="flex items-center gap-3"><Skeleton className="h-11 w-11 rounded-xl" /><div><div className="text-base"><Line width="3rem" /></div><div className="mt-0.5 text-xs"><Line width="5rem" /></div></div></div>
    {[false, true].map(secondary => <div key={String(secondary)} className={'mt-3 grid grid-cols-2 gap-3' + (secondary ? ' border-t border-slate-200 pt-2' : '')}>
      {[0, 1].map(column => <div key={column} className={column ? 'border-s border-slate-200 ps-3' : ''}>
        <div className="text-xs"><Line width="5rem" /></div><div className={secondary ? 'mt-1 text-base' : 'text-xl'}><Line numeric={secondary} width="4rem" /></div>
      </div>)}
    </div>)}
    <Skeleton className="mt-3 h-20 rounded-lg" />
  </div>;
}

function HoldingsSkeleton() {
  return <DashboardSurface className="rounded-xl p-4 sm:p-5">
    <div aria-hidden="true">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="text-xl"><Line width="8rem" /></div><Skeleton className="h-11 w-full rounded-lg sm:w-56" /></div>
      <div className="mb-4 flex min-h-[44px] items-center justify-between gap-3 text-xs"><Skeleton className="h-8 w-24" /><Line width="8rem" /></div>
      <table className="hidden w-full text-sm xl:table">
        <thead><tr className="bg-slate-50 text-xs">{Array.from({ length: 7 }, (_, i) => <th key={i} className={'px-3 py-3 ' + (i ? 'text-end' : 'text-start')}><Line width="3.5rem" /></th>)}<th /></tr></thead>
        <tbody className="divide-y divide-slate-100">{[0, 1, 2].map(row => <tr key={row}>
          <td className="px-3 py-3"><div className="flex min-h-[44px] items-center gap-2.5"><Skeleton className="h-9 w-9 rounded-lg" /><div><Line width="3rem" /><div className="text-xs"><Line width="4rem" /></div></div></div></td>
          {Array.from({ length: 5 }, (_, i) => <td key={i} className="px-3 py-3 text-end"><Line width="3.5rem" /></td>)}
          <td className="w-36 px-3 py-3"><Skeleton className="h-8 w-full" /></td><td className="text-end"><Line width="1rem" /></td>
        </tr>)}</tbody>
      </table>
      <div className="space-y-2 xl:hidden">{[0, 1, 2].map(row => <HoldingCardSkeleton key={row} />)}</div>
    </div>
  </DashboardSurface>;
}

export function OverviewSkeleton({ locale }: { locale: Locale }) {
  return <div data-page-loading role="status" className="flex flex-col gap-6">
    <span className="sr-only">{locale === 'he' ? 'טוען את התיק' : 'Loading portfolio'}</span>
    <MarketShape /><ProposalSkeleton /><HoldingsSkeleton />
  </div>;
}
