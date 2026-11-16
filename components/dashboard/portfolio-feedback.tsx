'use client';

import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { reconciliationQuality } from '@/lib/reconciliation-quality';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

export function PortfolioFeedback({ children, locale }: { children: ReactNode; locale: 'he' | 'en' }) {
  const { error, hasData, loading, refreshing, reload, lastUpdate, positions } = usePortfolioData();
  const isHebrew = locale === 'he';
  const { missingCommissionSymbols } = reconciliationQuality(positions);
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
      {hasData && missingCommissionSymbols.length > 0 ? (
        <div role="status" className="mx-4 mt-4 rounded-xl border border-amber-200 bg-[var(--warning-soft)] p-4 text-sm leading-relaxed text-[var(--warning-text)] dark:border-amber-900/60 sm:mx-6 lg:mx-8">
          {isHebrew ? 'חסרים פרטי עמלות בעסקאות של ' : 'Commission details are missing for '}
          <bdi dir="ltr" className="break-words font-medium">{missingCommissionSymbols.join(', ')}</bdi>
          {isHebrew
            ? '. הסכומים והרווחים שמוצגים עדיין לא כוללים את העמלות החסרות. אפשר להשלים אותן בעריכת העסקה, דרך היסטוריית הפעולות.'
            : '. The displayed amounts and profits do not include these missing fees yet. You can add them by editing the transaction in its history.'}
        </div>
      ) : null}
      {error && !hasData ? null : children}
    </>
  );
}
