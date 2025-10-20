'use client';

import { PortfolioVisualizations } from '@/components/portfolio/portfolio-visualizations';
import { PositionMetrics, PortfolioSummary } from '@/types';

interface VisualizationsPanelProps {
  title: string;
  metrics: PositionMetrics[];
  summary: PortfolioSummary;
}

export function VisualizationsPanel({ title, metrics, summary }: VisualizationsPanelProps) {
  return (
    <div className="space-y-4 border-t border-slate-100 pt-6">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 shadow-inner">
        <PortfolioVisualizations metrics={metrics} summary={summary} />
      </div>
    </div>
  );
}
