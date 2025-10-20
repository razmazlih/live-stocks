import { HistoricalPoint, PositionMetrics } from '@/types';

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
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">{openTitle}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {openMetrics.map((metrics) => (
          <PositionCard
            key={metrics.position.id || metrics.position.symbol}
            metrics={metrics}
            sparklineData={sparklineData[metrics.position.symbol] || []}
          />
        ))}
      </div>
      {closedMetrics.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900">{closedTitle}</h2>
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
