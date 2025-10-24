import { HistoricalPoint, PositionMetrics } from '@/types';

import { PositionCard } from '@/components/portfolio/position-card';

interface PositionsOverviewProps {
  openTitle: string;
  openDescription?: string;
  closedTitle: string;
  closedDescription?: string;
  openMetrics: PositionMetrics[];
  closedMetrics: PositionMetrics[];
  sparklineData: Record<string, HistoricalPoint[]>;
}

export function PositionsOverview({
  openTitle,
  openDescription,
  closedTitle,
  closedDescription,
  openMetrics,
  closedMetrics,
  sparklineData,
}: PositionsOverviewProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/80 p-6 shadow-xl shadow-slate-200/40">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-900">{openTitle}</h2>
            {openDescription && <p className="text-sm text-slate-500">{openDescription}</p>}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm">
            <span>{openMetrics.length}</span>
            <span className="whitespace-nowrap">{openTitle}</span>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {openMetrics.map((metrics) => (
            <PositionCard
              key={metrics.position.id || metrics.position.symbol}
              metrics={metrics}
              sparklineData={sparklineData[metrics.position.symbol] || []}
            />
          ))}
        </div>
      </section>

      {closedMetrics.length > 0 && (
        <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900/[0.02] via-white to-white p-6 shadow-xl shadow-slate-200/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-slate-900">{closedTitle}</h2>
              {closedDescription && <p className="text-sm text-slate-500">{closedDescription}</p>}
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
              <span>{closedMetrics.length}</span>
              <span className="whitespace-nowrap">{closedTitle}</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
