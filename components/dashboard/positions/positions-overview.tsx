import { useMemo, useState } from 'react';
import { Funnel } from 'lucide-react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { cn } from '@/lib/utils';

import { PositionCard } from '@/components/portfolio/position-card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface PositionsOverviewProps {
  openTitle: string;
  closedTitle: string;
  openMetrics: PositionMetrics[];
  closedMetrics: PositionMetrics[];
  sparklineData: Record<string, HistoricalPoint[]>;
}

type PositionFilterKey =
  | 'all'
  | 'gains'
  | 'losses'
  | 'ahead'
  | 'lagging'
  | 'momentumUp'
  | 'momentumDown';

interface FilterConfig {
  key: PositionFilterKey;
  label: string;
  description: string;
  predicate: (metrics: PositionMetrics) => boolean;
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
  const [activeFilter, setActiveFilter] = useState<PositionFilterKey>('all');

  const filterConfigs = useMemo<FilterConfig[]>(() => {
    const options = t.dashboard.filters.options;

    return [
      {
        key: 'all',
        label: options.all.label,
        description: options.all.description,
        predicate: () => true,
      },
      {
        key: 'gains',
        label: options.gains.label,
        description: options.gains.description,
        predicate: metrics => metrics.positionPnLUsd > 0,
      },
      {
        key: 'losses',
        label: options.losses.label,
        description: options.losses.description,
        predicate: metrics => metrics.positionPnLUsd < 0,
      },
      {
        key: 'ahead',
        label: options.ahead.label,
        description: options.ahead.description,
        predicate: metrics => Number.isFinite(metrics.combined) && metrics.combined > 0,
      },
      {
        key: 'lagging',
        label: options.lagging.label,
        description: options.lagging.description,
        predicate: metrics => Number.isFinite(metrics.combined) && metrics.combined < 0,
      },
      {
        key: 'momentumUp',
        label: options.momentumUp.label,
        description: options.momentumUp.description,
        predicate: metrics => (metrics.dailyChange ?? 0) > 0 || (metrics.dailyChangePercent ?? 0) > 0,
      },
      {
        key: 'momentumDown',
        label: options.momentumDown.label,
        description: options.momentumDown.description,
        predicate: metrics => (metrics.dailyChange ?? 0) < 0 || (metrics.dailyChangePercent ?? 0) < 0,
      },
    ];
  }, [t.dashboard.filters.options]);

  const filterConfigMap = useMemo(
    () =>
      filterConfigs.reduce<Record<PositionFilterKey, FilterConfig>>((acc, config) => {
        acc[config.key] = config;
        return acc;
      }, {} as Record<PositionFilterKey, FilterConfig>),
    [filterConfigs]
  );

  const applyFilter = (metrics: PositionMetrics[]) => {
    const predicate = filterConfigMap[activeFilter]?.predicate ?? (() => true);
    return metrics.filter(predicate);
  };

  const filteredOpenMetrics = useMemo(() => applyFilter(openMetrics), [openMetrics, filterConfigMap, activeFilter]);
  const filteredClosedMetrics = useMemo(() => applyFilter(closedMetrics), [closedMetrics, filterConfigMap, activeFilter]);

  const hasFilteredResults = filteredOpenMetrics.length > 0 || filteredClosedMetrics.length > 0;
  const activeFilterLabel = filterConfigMap[activeFilter]?.label ?? '';
  const isFiltered = activeFilter !== 'all';

  const handleResetFilter = () => {
    setActiveFilter('all');
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">{openTitle}</h2>
          <p className="text-sm text-slate-500">{sortNotice}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={cn(
                'inline-flex h-10 items-center rounded-2xl border border-slate-200 bg-white/80 px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/70 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/30',
                isFiltered && 'border-blue-300 bg-blue-50/80 text-blue-600'
              )}
            >
              <Funnel className="h-4 w-4" />
              <span className="flex items-center gap-2">
                {isFiltered
                  ? t.dashboard.filters.activeLabel(activeFilterLabel)
                  : t.dashboard.filters.buttonLabel}
                {isFiltered && (
                  <span className="inline-flex h-5 items-center rounded-full bg-blue-100 px-2 text-xs font-semibold text-blue-600">
                    {t.dashboard.filters.badgeLabel}
                  </span>
                )}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-2xl border border-slate-100 bg-white/95 p-2 shadow-xl backdrop-blur">
            <DropdownMenuLabel className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {t.dashboard.filters.title}
            </DropdownMenuLabel>
            <p className="px-2 pb-2 text-xs text-slate-500">{t.dashboard.filters.subtitle}</p>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={activeFilter} onValueChange={value => setActiveFilter(value as PositionFilterKey)}>
              {filterConfigs.map(option => (
                <DropdownMenuRadioItem
                  key={option.key}
                  value={option.key}
                  className="items-start rounded-xl px-3 py-2 text-sm text-slate-600 data-[state=checked]:bg-blue-50/80 data-[state=checked]:text-blue-700"
                >
                  <div className="ml-5 space-y-1">
                    <p className="font-medium">{option.label}</p>
                    <p className="text-xs text-slate-500">{option.description}</p>
                  </div>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {isFiltered && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={event => {
                    event.preventDefault();
                    handleResetFilter();
                  }}
                  className="cursor-pointer rounded-xl px-3 py-2 text-sm font-medium text-blue-600 focus:bg-blue-50/70 focus:text-blue-700"
                >
                  {t.dashboard.filters.reset}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!hasFilteredResults ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-500">
          {t.dashboard.filters.emptyState}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {filteredOpenMetrics.length > 0 ? (
              filteredOpenMetrics.map(metrics => (
                <PositionCard
                  key={metrics.position.id || metrics.position.symbol}
                  metrics={metrics}
                  sparklineData={sparklineData[metrics.position.symbol] || []}
                />
              ))
            ) : (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-center text-sm text-slate-500">
                {t.dashboard.filters.noMatches}
              </div>
            )}
          </div>
          {filteredClosedMetrics.length > 0 && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h2 className="text-xl font-semibold text-slate-900">{closedTitle}</h2>
                <p className="text-sm text-slate-500">{sortNotice}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
                {filteredClosedMetrics.map(metrics => (
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
