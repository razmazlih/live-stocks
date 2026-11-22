'use client';

import Link from 'next/link';
import { Clock3, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResearchExportButton } from '@/components/portfolio/research-export-button';
import { formatLastUpdatedTime } from '@/lib/utils/portfolio-display';
import styles from './overview-header.module.css';

interface OverviewHeaderProps {
  locale: 'he' | 'en';
  lastUpdate: Date | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh(): void;
}

export function OverviewHeader({ locale, lastUpdate, loading, refreshing, onRefresh }: OverviewHeaderProps) {
  const he = locale === 'he';
  const updated = formatLastUpdatedTime(lastUpdate, locale);
  const status = loading ? he ? 'טוען את התיק…' : 'Loading portfolio…'
    : refreshing ? he ? 'מעדכן נתונים…' : 'Updating…'
    : updated ? `${he ? 'עודכן' : 'Updated'} ${updated}`
    : he ? 'טרם עודכן' : 'Not updated yet';

  return <header className={styles.header}>
    <div className={styles.titleRow}>
      <div className={styles.titleBlock}>
        <h1>{he ? 'סקירת התיק' : 'Portfolio overview'}</h1>
        <p role="status" className={styles.status}><Clock3 aria-hidden="true" /><span className="inline-flex items-center">{loading ? <><span className="sr-only">{status}</span><span aria-hidden="true" className="h-2.5 w-20 animate-pulse rounded bg-primary/10 motion-reduce:animate-none" /></> : status}</span></p>
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRefresh} disabled={loading || refreshing}
        aria-label={he ? 'רענן' : 'Refresh'} title={he ? 'רענון נתוני התיק' : 'Refresh portfolio data'} className={styles.refresh}>
        <RefreshCw aria-hidden="true" className={refreshing ? styles.spinning : undefined} />
      </Button>
    </div>
    <div className={styles.actions}>
      <Button asChild className={styles.primary}><Link href="/positions?action=add"><Plus aria-hidden="true" /><span>{he ? 'הוספת עסקה' : 'Add transaction'}</span></Link></Button>
      <div className={styles.export}><ResearchExportButton /></div>
    </div>
  </header>;
}
