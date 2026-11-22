import { DashboardContainer, DashboardMain } from '@/components/dashboard/page-primitives';
import { Skeleton } from '@/components/ui/skeleton';
import chart from '@/components/portfolio/stock-detail-chart.module.css';
import styles from './stock-detail-view.module.css';

export function StockChartSkeleton() {
  return <div className={chart.panel} aria-hidden="true">
    <div className={chart.heading}><div className="flex items-center gap-2"><Skeleton className="h-4 w-40" /><span className={chart.unit}><span className="invisible">USD</span></span></div></div>
    <div className={chart.references}>{[0, 1].map(index => <div key={index}><Skeleton className="h-3 w-14" /><Skeleton className="mt-2 h-5 w-16 sm:mt-0" /></div>)}</div>
    <div className={chart.ranges}>{Array.from({ length: 8 }, (_, index) => <div key={index} className="grid min-h-[2.75rem] place-items-center"><Skeleton className="h-3 w-5" /></div>)}</div>
    <Skeleton className={chart.plot} />
    <div className={chart.dates}><div className="flex h-[1.5em] items-center"><Skeleton className="h-2.5 w-12" /></div><Skeleton className="h-2.5 w-12" /></div>
    <div className={chart.key}><div className="flex h-11 items-center"><Skeleton className="h-3 w-20" /></div></div>
  </div>;
}

export function StockRecordsSkeleton() {
  return <div aria-hidden="true" className={styles.records}>
    {[0, 1].map(record => <div key={record} className={styles.record}>
      <div className="flex h-[60px] items-center gap-2 px-3 sm:px-4"><Skeleton className="h-8 w-8 rounded-lg" /><Skeleton className="h-3 w-28" /><Skeleton className="ms-auto h-3 w-12" /></div>
    </div>)}
  </div>;
}

export function StockDetailSkeleton({ locale = 'he' }: { locale?: 'he' | 'en' }) {
  return <DashboardContainer className={styles.page}>
    <span data-page-loading="true" role="status" className="sr-only">{locale === 'he' ? 'טוען את פרטי המניה' : 'Loading stock details'}</span>
    <div aria-hidden="true" className={styles.toolbar}><Skeleton className="my-4 h-3 w-24" /><Skeleton className="h-9 w-9 rounded-xl" /></div>
    <DashboardMain className={styles.main}>
      <div className={styles.hero} aria-hidden="true">
        <div className={styles.heroTop}>
          <div className="flex items-center gap-3"><Skeleton className="h-12 w-12 rounded-2xl" /><div><div className="mb-1 flex min-h-[27px] items-center gap-2"><Skeleton className="h-3 w-12" /><Skeleton className="h-5 w-12 rounded-full" /></div><div className="flex h-7 items-center sm:h-8"><Skeleton className="h-5 w-28" /></div></div></div>
          <div className={styles.quote}><div className="mb-1 flex h-[16.5px] items-center"><Skeleton className="h-3 w-20" /></div><Skeleton className="h-[30px] w-28 sm:h-9" /><div className="mt-2 flex h-4 items-center"><Skeleton className="h-3 w-16" /></div></div>
        </div>
        <dl className={styles.metrics}>{[0, 1, 2].map(index => <div key={index}>
          <dt><span className="inline-block h-[.8em] w-3/4 max-w-[6rem] rounded bg-slate-400/20" /></dt>
          <dd><Skeleton className="h-[1.5em] w-2/3 max-w-[5rem]" /></dd>
          <p><span className="inline-block h-[.8em] w-3/4 max-w-[7rem] rounded bg-slate-400/20" /></p>
        </div>)}</dl>
      </div>
      <StockChartSkeleton />
      <StockRecordsSkeleton />
    </DashboardMain>
  </DashboardContainer>;
}
