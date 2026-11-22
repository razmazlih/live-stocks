import { LineChart } from 'lucide-react';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/dashboard/page-header';
import type { DashboardQuickAction } from '@/components/dashboard/quick-actions';
import { Skeleton } from '@/components/ui/skeleton';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { translations } from '@/lib/translations';
import type { Locale } from '@/types';

export function PerformanceHeader({ locale, updated, loading = true, quickActions, actions }: {
  locale: Locale;
  updated?: string | null;
  loading?: boolean;
  quickActions?: DashboardQuickAction[];
  actions?: ReactNode;
}) {
  const he = locale === 'he';
  const t = translations[locale];
  return <PageHeader
    title={he ? 'ביצועים' : 'Performance'}
    subtitle={he ? 'התפתחות התיק, היעד האישי והרווחים שמומשו.' : 'Portfolio history, your personal target and realized returns.'}
    icon={LineChart}
    metaBadges={[{ key: 'updated', label: `${t.app.updated} ${updated ?? '—'}`, loading }]}
    quickActions={quickActions}
    actions={actions ?? <><Skeleton className="h-11 w-11 rounded-lg sm:w-20" /><Skeleton className="h-11 w-28 rounded-lg" /></>}
  />;
}

export function PerformanceTabsList({ locale, disabled }: { locale: Locale; disabled?: boolean }) {
  const he = locale === 'he';
  const triggerClass = 'min-h-11 px-3 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 sm:px-6';
  return <TabsList aria-label={he ? 'תצוגת ביצועים' : 'Performance view'} className="mb-5 grid h-auto w-full grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 sm:inline-flex sm:w-auto">
    <TabsTrigger disabled={disabled} value="history" className={triggerClass}>{he ? 'לאורך זמן' : 'History'}</TabsTrigger>
    <TabsTrigger disabled={disabled} value="targets" className={triggerClass}>{he ? 'מול היעד' : 'Personal target'}</TabsTrigger>
    <TabsTrigger disabled={disabled} value="realized" className={triggerClass}>{he ? 'רווח ממומש' : 'Realized returns'}</TabsTrigger>
  </TabsList>;
}
