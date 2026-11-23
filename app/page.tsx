'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { DashboardContainer, DashboardMain, DashboardSurface } from '@/components/dashboard/page-primitives';
import { OverviewHeader } from '@/components/dashboard/overview-header';
import { LocalMarketSwitcher } from '@/components/dashboard/local-market-switcher';
import { Button } from '@/components/ui/button';
import { MarketOverviewSkeleton, OverviewSkeleton } from '@/components/dashboard/overview-skeleton';
import { OverviewHoldings } from '@/components/portfolio/overview-holdings';
import { ClosePairProposals } from '@/components/portfolio/close-pair-proposals';
import { usePortfolioData } from '@/hooks/use-portfolio-data';
import { useUrlState } from '@/hooks/use-url-state';
import { useReturnContext } from '@/hooks/use-return-context';
import { useApp } from '@/lib/context';
import { StockInspectorProvider } from '@/components/portfolio/stock-inspector';
import { MarketOverviewSurface } from '@/components/portfolio/market-overview-surface';
import { useInvestmentSources } from '@/hooks/use-investment-sources';
import { parsePerformanceOptions } from '@/lib/performance-display';

export default function HomePage() {
  const { locale, settings, saveAnnualTarget } = useApp();
  const he = locale === 'he';
  const { loading, refreshing, summary, marketOverview, marketPending, previewTarget, streamStatus, metrics, positions, sparklineData, contextSparklineData, lastUpdate, reload } = usePortfolioData();
  useReturnContext(!loading);
  const { sourceName } = useInvestmentSources();
  const [performanceOptions] = useUrlState(parsePerformanceOptions);
  return <StockInspectorProvider><DashboardRouteShell activeKey="dashboard" locale={locale}>
    <DashboardContainer>
      <OverviewHeader locale={locale} lastUpdate={lastUpdate} loading={loading} refreshing={refreshing} onRefresh={reload} streamStatus={streamStatus} />
      <DashboardMain className="mt-5">
        {loading ? <OverviewSkeleton locale={locale} /> : positions.length === 0 ? <DashboardSurface><div className="flex flex-col items-center gap-4 py-16 text-center"><h2 className="text-xl font-semibold">{he ? 'התיק שלך מתחיל כאן' : 'Your portfolio starts here'}</h2><p className="max-w-md text-sm text-slate-500">{he ? 'הוסף את העסקה הראשונה כדי לראות את ההחזקות והביצועים מול היעד האישי.' : 'Add your first transaction to see your holdings and performance against your personal target.'}</p><Button asChild><Link href="/positions?action=add"><Plus aria-hidden />{he ? 'הוספת עסקה' : 'Add transaction'}</Link></Button></div></DashboardSurface> : <div className="dashboard-content-enter space-y-6">
          {marketPending ? <MarketOverviewSkeleton locale={locale} phase={marketOverview?.phase} /> :
            <MarketOverviewSurface marketOverview={marketOverview} summary={summary} positions={positions} currency={settings.currency} locale={locale} options={performanceOptions} sourceName={sourceName}
              targetControls={{ rate: settings.annualGrowthRate, project: previewTarget, save: saveAnnualTarget }} />}
          <ClosePairProposals metrics={metrics} positions={positions} sparklineData={sparklineData} />
          <OverviewHoldings metrics={metrics} sparklineData={sparklineData} contextSparklineData={contextSparklineData} positions={positions} />
        </div>}
      </DashboardMain>
      <LocalMarketSwitcher locale={locale} />
    </DashboardContainer>
  </DashboardRouteShell></StockInspectorProvider>;
}
