'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';

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
import { Badge } from '@/components/ui/badge';
import {
  Filter,
  Layers,
  TrendingDown,
  TrendingUp,
  Target,
  Gauge,
  Hourglass,
  Timer,
} from 'lucide-react';

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
  const { positionFilters } = t.dashboard;

  type PositionFilter =
    | 'all'
    | 'winners'
    | 'losers'
    | 'forecastAhead'
    | 'forecastBehind'
    | 'longTerm'
    | 'shortTerm';

  interface FilterOption {
    value: PositionFilter;
    label: string;
    description: string;
    icon: ReactNode;
  }

  const filterOptions: FilterOption[] = useMemo(
    () => [
      {
        value: 'all',
        label: positionFilters.options.all.label,
        description: positionFilters.options.all.description,
        icon: <Layers className="h-4 w-4 text-slate-400" />, 
      },
      {
        value: 'winners',
        label: positionFilters.options.winners.label,
        description: positionFilters.options.winners.description,
        icon: <TrendingUp className="h-4 w-4 text-emerald-500" />, 
      },
      {
        value: 'losers',
        label: positionFilters.options.losers.label,
        description: positionFilters.options.losers.description,
        icon: <TrendingDown className="h-4 w-4 text-rose-500" />, 
      },
      {
        value: 'forecastAhead',
        label: positionFilters.options.forecastAhead.label,
        description: positionFilters.options.forecastAhead.description,
        icon: <Target className="h-4 w-4 text-indigo-500" />, 
      },
      {
        value: 'forecastBehind',
        label: positionFilters.options.forecastBehind.label,
        description: positionFilters.options.forecastBehind.description,
        icon: <Gauge className="h-4 w-4 text-amber-500" />, 
      },
      {
        value: 'longTerm',
        label: positionFilters.options.longTerm.label,
        description: positionFilters.options.longTerm.description,
        icon: <Hourglass className="h-4 w-4 text-slate-500" />, 
      },
      {
        value: 'shortTerm',
        label: positionFilters.options.shortTerm.label,
        description: positionFilters.options.shortTerm.description,
        icon: <Timer className="h-4 w-4 text-slate-500" />, 
      },
    ],
    [positionFilters]
  );

  const [activeFilter, setActiveFilter] = useState<PositionFilter>('all');

  const filterMetrics = useCallback(
    (items: PositionMetrics[]) => {
      switch (activeFilter) {
        case 'winners':
          return items.filter((item) => Number.isFinite(item.positionPnLUsd) && item.positionPnLUsd > 0);
        case 'losers':
          return items.filter((item) => Number.isFinite(item.positionPnLUsd) && item.positionPnLUsd < 0);
        case 'forecastAhead':
          return items.filter((item) => Number.isFinite(item.combined) && item.combined > 0);
        case 'forecastBehind':
          return items.filter((item) => Number.isFinite(item.combined) && item.combined < 0);
        case 'longTerm':
          return items.filter((item) => Number.isFinite(item.yearsHeld) && item.yearsHeld >= 3);
        case 'shortTerm':
          return items.filter((item) => Number.isFinite(item.yearsHeld) && item.yearsHeld < 1);
        default:
          return items;
      }
    },
    [activeFilter]
  );

  const filteredOpenMetrics = useMemo(
    () => filterMetrics(openMetrics),
    [filterMetrics, openMetrics]
  );
  const filteredClosedMetrics = useMemo(
    () => filterMetrics(closedMetrics),
    [filterMetrics, closedMetrics]
  );

  const activeOption = filterOptions.find((option) => option.value === activeFilter) ?? filterOptions[0];
  const totalPositions = openMetrics.length + closedMetrics.length;
  const filteredCount = filteredOpenMetrics.length + filteredClosedMetrics.length;
  const activeLabel = positionFilters.activeLabel(activeOption.label);
  const resultLabel = positionFilters.resultsLabel(filteredCount, totalPositions);
  const noMatchesMessage = positionFilters.noMatches;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white/60 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Filter className="h-4 w-4 text-slate-400" />
              <span>{positionFilters.triggerLabel}</span>
            </div>
            <p className="text-xs text-slate-500">{activeLabel}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                {resultLabel}
              </Badge>
              <span className="max-w-xs text-left sm:max-w-none">{activeOption.description}</span>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto inline-flex items-center gap-2 whitespace-nowrap">
                {activeOption.icon}
                <span>{activeOption.label}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>{positionFilters.menuLabel}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={activeFilter} onValueChange={(value) => setActiveFilter(value as PositionFilter)}>
                {filterOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    className="flex-col items-start gap-1"
                  >
                    <div className="flex w-full items-center gap-2 text-sm font-medium text-slate-700">
                      {option.icon}
                      <span>{option.label}</span>
                    </div>
                    <p className="text-xs font-normal text-slate-500">{option.description}</p>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-xl font-semibold text-slate-900">{openTitle}</h2>
          <p className="text-sm text-slate-500">{sortNotice}</p>
        </div>
        {filteredOpenMetrics.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {filteredOpenMetrics.map((metrics) => (
              <PositionCard
                key={metrics.position.id || metrics.position.symbol}
                metrics={metrics}
                sparklineData={sparklineData[metrics.position.symbol] || []}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
            {openMetrics.length === 0 ? t.dashboard.sectionPositionsEmpty : noMatchesMessage}
          </div>
        )}
      </div>

      {closedMetrics.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">{closedTitle}</h2>
            <p className="text-sm text-slate-500">{sortNotice}</p>
          </div>
          {filteredClosedMetrics.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
              {filteredClosedMetrics.map((metrics) => (
                <PositionCard
                  key={`closed-${metrics.position.id || metrics.position.symbol}`}
                  metrics={metrics}
                  sparklineData={sparklineData[metrics.position.symbol] || []}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center text-sm text-slate-500">
              {noMatchesMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
