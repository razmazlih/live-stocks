import { HistoricalPoint, PositionMetrics } from '@/types';

import { PositionCard } from '@/components/portfolio/position-card';
import { Badge } from '@/components/ui/badge';
import { ArrowUpRight } from 'lucide-react';

interface PositionsOverviewProps {
  openTitle: string;
  closedTitle: string;
  openMetrics: PositionMetrics[];
  closedMetrics: PositionMetrics[];
  sparklineData: Record<string, HistoricalPoint[]>;
  sortingLabel: string;
  sortingDescription: string;
}

export function PositionsOverview({
  openTitle,
  closedTitle,
  openMetrics,
  closedMetrics,
  sparklineData,
  sortingLabel,
  sortingDescription,
}: PositionsOverviewProps) {
  const renderSection = (title: string, metrics: PositionMetrics[]) => (
    <section className="space-y-6 rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {sortingLabel}
          </p>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{sortingDescription}</p>
        </div>
        <Badge className="flex items-center gap-1.5 border-emerald-100 bg-emerald-50 text-emerald-700 shadow-none">
          <ArrowUpRight className="h-4 w-4" />
          <span className="text-xs font-medium">{sortingLabel}</span>
        </Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <PositionCard
            key={metric.position.id || metric.position.symbol}
            metrics={metric}
            sparklineData={sparklineData[metric.position.symbol] || []}
          />
        ))}
      </div>
    </section>
  );

  return (
    <div className="space-y-6">
      {renderSection(openTitle, openMetrics)}
      {closedMetrics.length > 0 && (
        <section className="space-y-6 rounded-3xl border border-slate-100 bg-gradient-to-b from-white/85 via-white/75 to-slate-50/70 p-6 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {sortingLabel}
              </p>
              <h2 className="text-xl font-semibold text-slate-900">{closedTitle}</h2>
              <p className="text-sm text-slate-500">{sortingDescription}</p>
            </div>
            <Badge className="flex items-center gap-1.5 border-slate-200 bg-slate-100 text-slate-700 shadow-none">
              <ArrowUpRight className="h-4 w-4" />
              <span className="text-xs font-medium">{sortingLabel}</span>
            </Badge>
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
        </section>
      )}
    </div>
  );
}
