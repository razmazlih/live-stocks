import { HistoricalPoint, PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { cn } from '@/lib/utils';

import { PositionCard } from '@/components/portfolio/position-card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SlidersHorizontal } from 'lucide-react';

type FilterTone = 'focus' | 'positive' | 'negative' | 'neutral';

interface PositionsOverviewFilterOption {
  key: string;
  label: string;
  description: string;
  tone?: FilterTone;
}

interface PositionsOverviewProps {
  openTitle: string;
  closedTitle: string;
  openMetrics: PositionMetrics[];
  closedMetrics: PositionMetrics[];
  sparklineData: Record<string, HistoricalPoint[]>;
  filterLabel: string;
  filterOptions: PositionsOverviewFilterOption[];
  activeFilterKey: string;
  activeFilterDescription: string;
  filterSummary?: string;
  isFilterActive: boolean;
  emptyFilteredMessage: string;
  resetLabel: string;
  onFilterChange: (key: string) => void;
}

export function PositionsOverview({
  openTitle,
  closedTitle,
  openMetrics,
  closedMetrics,
  sparklineData,
  filterLabel,
  filterOptions,
  activeFilterKey,
  activeFilterDescription,
  filterSummary,
  isFilterActive,
  emptyFilteredMessage,
  resetLabel,
  onFilterChange,
}: PositionsOverviewProps) {
  const { locale } = useApp();
  const { t } = useTranslation(locale);
  const sortNotice = t.dashboard.positionsSortedByForecast;

  const activeFilterOption = filterOptions.find((option) => option.key === activeFilterKey);
  const badgeTone: FilterTone = activeFilterOption?.tone ?? 'focus';

  const badgeToneClass: Record<FilterTone, string> = {
    focus: 'bg-blue-50 text-blue-600 ring-1 ring-blue-100',
    positive: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    negative: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    neutral: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  };

  const menuToneClass: Record<FilterTone, string> = {
    focus: 'data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-600',
    positive: 'data-[state=checked]:bg-emerald-50 data-[state=checked]:text-emerald-600',
    negative: 'data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600',
    neutral: 'data-[state=checked]:bg-slate-100 data-[state=checked]:text-slate-700',
  };

  const filterExplanation = isFilterActive
    ? [activeFilterDescription, filterSummary].filter(Boolean).join(' · ')
    : sortNotice;
  const filterMenuTitle = t.dashboard.positionsFiltersTitle;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-slate-900">{openTitle}</h2>
            {isFilterActive && activeFilterOption && (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition',
                  badgeToneClass[badgeTone]
                )}
              >
                {activeFilterOption.label}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">{filterExplanation}</p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-full border-blue-200 bg-white/80 px-4 text-sm font-medium text-blue-600 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/80 hover:text-blue-700 focus-visible:ring-0"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>{filterLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[280px] rounded-2xl border border-slate-100 bg-white/95 p-2 shadow-xl backdrop-blur-sm"
            >
              <DropdownMenuLabel className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {filterMenuTitle}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuRadioGroup value={activeFilterKey} onValueChange={onFilterChange}>
                {filterOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.key}
                    value={option.key}
                    className={cn(
                      'cursor-pointer rounded-xl px-3 py-2 text-sm transition data-[highlighted]:bg-blue-50/70 data-[highlighted]:text-blue-600',
                      menuToneClass[option.tone ?? 'focus']
                    )}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-slate-900">{option.label}</span>
                      <span className="text-xs text-slate-500">{option.description}</span>
                    </div>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {isFilterActive && (
            <button
              type="button"
              onClick={() => onFilterChange('all')}
              className="text-xs font-medium text-blue-500 underline-offset-4 transition hover:text-blue-600 hover:underline"
            >
              {resetLabel}
            </button>
          )}
        </div>
      </div>

      {isFilterActive && openMetrics.length === 0 && closedMetrics.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center text-sm text-slate-500">
          {emptyFilteredMessage}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {openMetrics.map((metrics) => (
              <PositionCard
                key={metrics.position.id || metrics.position.symbol}
                metrics={metrics}
                sparklineData={sparklineData[metrics.position.symbol] || []}
              />
            ))}
          </div>
          {closedMetrics.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h3 className="text-lg font-semibold text-slate-900">{closedTitle}</h3>
                <p className="text-sm text-slate-500">{sortNotice}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
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
        </>
      )}
    </div>
  );
}
