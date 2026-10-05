'use client';

import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export function PortfolioFeedback({ children, locale }: { children: ReactNode; locale: 'he' | 'en' }) {
  const { error, hasData, loading, refreshing, reload, lastUpdate } = usePortfolioData();
  const isHebrew = locale === 'he';
  return (
    <>
      {error ? (
        <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:mx-6 lg:mx-8">
          <p>
            {hasData
              ? isHebrew ? 'לא הצלחנו לרענן. הנתונים האחרונים עדיין מוצגים.' : 'Refresh failed. Your last successful data is still shown.'
              : isHebrew ? 'לא הצלחנו לטעון את נתוני התיק.' : 'Unable to load portfolio data.'}
            {hasData && lastUpdate ? <span className="ms-2 text-xs">{isHebrew ? 'עודכן' : 'Updated'} {lastUpdate.toLocaleTimeString(isHebrew ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span> : null}
          </p>
          <Button variant="outline" disabled={loading || refreshing} onClick={() => void reload()}>
            <RefreshCw aria-hidden="true" />{isHebrew ? 'ניסיון חוזר' : 'Retry'}
          </Button>
        </div>
      ) : null}
      {error && !hasData ? null : children}
    </>
  );
}
