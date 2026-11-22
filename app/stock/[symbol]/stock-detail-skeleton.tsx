import { DashboardContainer, DashboardMain } from '@/components/dashboard/page-primitives';
import { Skeleton } from '@/components/ui/skeleton';
import chart from '@/components/portfolio/stock-detail-chart.module.css';
import styles from './stock-detail-view.module.css';

export function StockChartSkeleton() {
  return <div className={chart.panel} aria-hidden="true">
    <div className={chart.heading}><Skeleton className="h-5 w-40" /></div>
    <div className={chart.references}>{[0, 1].map(index => <div key={index}><Skeleton className="h-3 w-14" /><Skeleton className="mt-2 h-5 w-16 sm:mt-0" /></div>)}</div>
    <div className={chart.ranges}>{Array.from({ length: 8 }, (_, index) => <div key={index} className="grid min-h-[2.75rem] place-items-center"><Skeleton className="h-3 w-5" /></div>)}</div>
    <Skeleton className={chart.plot} />
    <Skeleton className="my-4 h-3 w-24" />
  </div>;
}

export function StockDetailSkeleton({ locale = 'he' }: { locale?: 'he' | 'en' }) {
  return <DashboardContainer className={styles.page}>
    <span role="status" className="sr-only">{locale === 'he' ? 'טוען את פרטי המניה' : 'Loading stock details'}</span>
    <div aria-hidden="true" className={styles.toolbar}><Skeleton className="my-4 h-3 w-24" /><Skeleton className="h-9 w-9 rounded-xl" /></div>
    <DashboardMain className={styles.main}>
      <div className={styles.hero} aria-hidden="true">
        <div className={styles.heroTop}>
          <div className="flex items-center gap-3"><Skeleton className="h-12 w-12 rounded-2xl" /><div className="space-y-2"><Skeleton className="h-3 w-12" /><Skeleton className="h-6 w-28" /></div></div>
          <div className={styles.quote}><Skeleton className="mb-2 h-3 w-20" /><Skeleton className="h-9 w-28" /><Skeleton className="mt-2 h-3 w-16" /></div>
        </div>
        <div className={styles.metrics}>{[0, 1, 2].map(index => <div key={index} className="space-y-2"><Skeleton className="h-3 w-3/4 max-w-[6rem]" /><Skeleton className="h-5 w-2/3 max-w-[5rem]" /><Skeleton className="h-2 w-3/4 max-w-[7rem]" /></div>)}</div>
      </div>
      <StockChartSkeleton />
    </DashboardMain>
  </DashboardContainer>;
}
