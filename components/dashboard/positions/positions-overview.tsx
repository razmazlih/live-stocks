"use client";

import { useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Check,
  Clock,
  Filter,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

import { HistoricalPoint, PositionMetrics } from '@/types';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';

import { PositionCard } from '@/components/portfolio/position-card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PositionsOverviewProps {
  openTitle: string;
  closedTitle: string;
  openMetrics: PositionMetrics[];
  closedMetrics: PositionMetrics[];
  sparklineData: Record<string, HistoricalPoint[]>;
}

type FilterKey = 'all' | 'winners' | 'losers' | 'ahead' | 'lagging' | 'recent';

const VALUE_THRESHOLD = 1e-2;

const filterPredicates: Record<FilterKey, (metrics: PositionMetrics) => boolean> = {
  all: () => true,
  winners: (metrics) => metrics.positionPnLUsd > VALUE_THRESHOLD,
  losers: (metrics) => metrics.positionPnLUsd < -VALUE_THRESHOLD,
  ahead: (metrics) => metrics.combined > VALUE_THRESHOLD,
  lagging: (metrics) => metrics.combined < -VALUE_THRESHOLD,
  recent: (metrics) => metrics.yearsHeld < 1,
};

const filterIcons: Record<FilterKey, LucideIcon> = {
  all: Sparkles,
  winners: TrendingUp,
  losers: TrendingDown,
  ahead: Target,
  lagging: AlertTriangle,
  recent: Clock,
};

interface FilterOptionConfig {
  key: FilterKey;
  label: string;
  description: string;
  icon: LucideIcon;
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

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const filterOptions: FilterOptionConfig[] = useMemo(
    () =>
      (Object.keys(filterIcons) as FilterKey[]).map((key) => ({
        key,
        label: t.dashboard.positionFilters[key].label,
        description: t.dashboard.positionFilters[key].description,
        icon: filterIcons[key],
      })),
    [t]
  );

  const activeFilterOption = filterOptions.find((option) => option.key === activeFilter) ?? filterOptions[0];

  const filteredOpenMetrics = useMemo(
    () => openMetrics.filter(filterPredicates[activeFilter]),
    [openMetrics, activeFilter]
  );

  const filteredClosedMetrics = useMemo(
    () => closedMetrics.filter(filterPredicates[activeFilter]),
    [closedMetrics, activeFilter]
  );

  const totalOpen = openMetrics.length;
  const hasFilterApplied = activeFilter !== 'all';
  const openResultLabel = t.dashboard.positionFilters.resultCount(filteredOpenMetrics.length, totalOpen);
  const showClosedSection = filteredClosedMetrics.length > 0;
  const filterEmptyState = filteredOpenMetrics.length === 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">{openTitle}</h2>
          <p className="text-sm text-muted-foreground">{sortNotice}</p>
          {hasFilterApplied && (
            <Badge className="mt-1 inline-flex rounded-full border-border/60 bg-primary/15 px-3 py-1 text-xs font-medium text-primary shadow-sm">
              {t.dashboard.positionFilters.activeBadge(activeFilterOption.label)}
            </Badge>
          )}
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* Token-aware filter trigger replacing legacy RGB palette */}
              <Button
                variant="outline"
                size="sm"
                className="group rounded-full border border-border/60 bg-surface-elevated px-4 py-2 text-muted-foreground shadow-sm transition hover:border-ring hover:bg-surface-glass hover:text-primary"
              >
                <Filter className="h-4 w-4 text-primary transition group-hover:text-primary" />
                <span className="text-sm font-medium">
                  {hasFilterApplied
                    ? activeFilterOption.label
                    : t.dashboard.positionFilters.triggerLabel}
                </span>
                <Badge className="ml-2 rounded-full border-transparent bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                  {filteredOpenMetrics.length}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 rounded-2xl border border-border/60 bg-surface-glass p-2 shadow-lg backdrop-blur-xl">
              <DropdownMenuLabel className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.dashboard.positionFilters.title}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="mx-2 my-2 bg-border/60" />
              {filterOptions.map(({ key, label, description, icon: Icon }) => {
                const isActive = activeFilter === key;
                return (
                  <DropdownMenuItem
                    key={key}
                    onSelect={() => setActiveFilter(key)}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl px-3 py-2 text-sm transition focus:bg-primary/15 focus:text-primary',
                      isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="space-y-0.5">
                      <p className="font-medium text-foreground group-focus:text-primary">
                        {label}
                      </p>
                      <p className="text-xs text-muted-foreground group-focus:text-primary">
                        {description}
                      </p>
                    </div>
                    {isActive && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-xs font-medium text-muted-foreground sm:text-right">{openResultLabel}</p>
        </div>
      </div>
      {filterEmptyState ? (
        <div className="rounded-2xl border border-dashed border-border/60 bg-surface-elevated px-6 py-10 text-center text-sm text-muted-foreground">
          {t.dashboard.positionFilters.empty}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {filteredOpenMetrics.map((metrics) => (
            <PositionCard
              key={metrics.position.id || metrics.position.symbol}
              metrics={metrics}
              sparklineData={sparklineData[metrics.position.symbol] || []}
            />
          ))}
        </div>
      )}
      {showClosedSection && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-xl font-semibold text-foreground">{closedTitle}</h2>
            <p className="text-sm text-muted-foreground">{sortNotice}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
            {filteredClosedMetrics.map((metrics) => (
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
