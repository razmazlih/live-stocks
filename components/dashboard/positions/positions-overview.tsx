import { HistoricalPoint, PositionMetrics } from '@/types';

import { PositionCard } from '@/components/portfolio/position-card';

interface PositionsOverviewProps {
  openTitle: string;
  closedTitle: string;
  sortingHelper: string;
  openCountLabel: string;
  closedCountLabel: string;
  emptyOpenLabel: string;
  openMetrics: PositionMetrics[];
  closedMetrics: PositionMetrics[];
  sparklineData: Record<string, HistoricalPoint[]>;
}

export function PositionsOverview({
  openTitle,
  closedTitle,
  sortingHelper,
  openCountLabel,
  closedCountLabel,
  emptyOpenLabel,
  openMetrics,
  closedMetrics,
  sparklineData,
}: PositionsOverviewProps) {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-100 bg-white/70 p-6 shadow-sm transition">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-slate-900">{openTitle}</h2>
            <p className="text-sm text-slate-500">{sortingHelper}</p>
          </div>
          <div
            className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/70 px-3 py-1 text-xs font-medium text-blue-600 shadow-sm"
            aria-label={openCountLabel}
          >
            <span className="inline-flex h-2 w-2 rounded-full bg-blue-400" aria-hidden="true" />
            <span>{openCountLabel}</span>
          </div>
        </div>

        {openMetrics.length > 0 ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {openMetrics.map((metrics) => (
              <PositionCard
                key={metrics.position.id || metrics.position.symbol}
                metrics={metrics}
                sparklineData={sparklineData[metrics.position.symbol] || []}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-10 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-600">{emptyOpenLabel}</p>
            <p className="mt-2 text-xs text-slate-400">{sortingHelper}</p>
          </div>
        )}
      </section>

      {closedMetrics.length > 0 && (
        <section className="rounded-3xl border border-slate-100 bg-gradient-to-br from-white via-white/80 to-blue-50/60 p-6 shadow-sm transition">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold text-slate-900">{closedTitle}</h2>
              <p className="text-sm text-slate-500">{sortingHelper}</p>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
              aria-label={closedCountLabel}
            >
              <span className="inline-flex h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
              <span>{closedCountLabel}</span>
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
