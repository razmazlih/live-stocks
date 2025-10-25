import { HistoricalPoint, PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';

import { PositionCard } from '@/components/portfolio/position-card';

interface PositionsOverviewProps {
  openTitle: string;
  closedTitle: string;
  openMetrics: PositionMetrics[];
  closedMetrics: PositionMetrics[];
  sparklineData: Record<string, HistoricalPoint[]>;
}

export function PositionsOverview({
  openTitle,
  closedTitle,
  openMetrics,
  closedMetrics,
  sparklineData,
}: PositionsOverviewProps) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const sortNotice = t.dashboard.positionsSortedByForecast;
  const hasOpen = openMetrics.length > 0;
  const hasClosed = closedMetrics.length > 0;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{openTitle}</h2>
          {hasOpen && <p className="text-sm text-slate-500">{sortNotice}</p>}
        </div>
        {hasOpen ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {openMetrics.map((metrics) => (
              <PositionCard
                key={metrics.position.id || metrics.position.symbol}
                metrics={metrics}
                sparklineData={sparklineData[metrics.position.symbol] || []}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-500">
            {t.dashboard.noOpenPositions}
          </div>
        )}
      </div>

      {hasClosed && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">{closedTitle}</h2>
            <p className="text-sm text-slate-500">{sortNotice}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {closedMetrics.map((metrics) => (
              <PositionCard
                key={`closed-${metrics.position.id || metrics.position.symbol}`}
                metrics={metrics}
                sparklineData={sparklineData[metrics.position.symbol] || []}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
