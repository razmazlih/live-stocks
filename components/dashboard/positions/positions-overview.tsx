"use client";

import { memo, useMemo, useState } from 'react';
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
import { computeRealizedSales } from '@/lib/positions';

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface ClosedMetricsOption {
  id: string;
  label: string;
  metrics: PositionMetrics;
  sparklineKey: string;
  sortTimestamp: number;
}

interface ClosedMetricsGroup {
  groupId: string;
  options: ClosedMetricsOption[];
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

  const groupedClosedMetrics = useMemo<ClosedMetricsGroup[]>(() => {
    const grouped = new Map<string, ClosedMetricsOption[]>();

    filteredClosedMetrics.forEach((metrics) => {
      const position = metrics.position;
      const symbolKey = position.symbol.trim().toUpperCase();
      const locationKey = position.location ?? 'bank_one';
      const groupId = `${symbolKey}::${locationKey}`;
      const sparklineKey = position.activationId ?? position.id ?? position.symbol;
      const optionId = position.activationId ?? position.id ?? `${groupId}-${position.entryDate}`;

      const sales = computeRealizedSales(position);
      let sortTimestamp = Number.NEGATIVE_INFINITY;

      sales.forEach((sale) => {
        const timestamp = new Date(sale.sellDate).getTime();
        if (!Number.isNaN(timestamp) && timestamp > sortTimestamp) {
          sortTimestamp = timestamp;
        }
      });

      if (!Number.isFinite(sortTimestamp)) {
        const fallbackTimestamp = new Date(position.entryDate).getTime();
        sortTimestamp = Number.isNaN(fallbackTimestamp) ? Number.NEGATIVE_INFINITY : fallbackTimestamp;
      }

      const optionLabel = t.dashboard.closedViewOption(
        (position.activationIndex ?? 0) + 1,
        formatClosedOptionDate(sortTimestamp, locale)
      );

      const option: ClosedMetricsOption = {
        id: optionId,
        label: optionLabel,
        metrics,
        sparklineKey,
        sortTimestamp,
      };

      const bucket = grouped.get(groupId) ?? [];
      bucket.push(option);
      grouped.set(groupId, bucket);
    });

    return Array.from(grouped.entries())
      .map(([groupId, options]) => ({
        groupId,
        options: options.sort((a, b) => b.sortTimestamp - a.sortTimestamp),
      }))
      .sort((a, b) => (b.options[0]?.sortTimestamp ?? 0) - (a.options[0]?.sortTimestamp ?? 0));
  }, [filteredClosedMetrics, locale, t.dashboard]);

  const totalOpen = openMetrics.length;
  const hasFilterApplied = activeFilter !== 'all';
  const openResultLabel = t.dashboard.positionFilters.resultCount(filteredOpenMetrics.length, totalOpen);
  const showClosedSection = groupedClosedMetrics.length > 0;
  const filterEmptyState = filteredOpenMetrics.length === 0;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">{openTitle}</h2>
          <p className="text-sm text-slate-500">{sortNotice}</p>
          {hasFilterApplied && (
            <Badge className="mt-1 inline-flex max-w-full rounded-full border-blue-100 bg-overlay-blue-50 px-3 py-1 text-xs font-medium text-blue-600 shadow-sm">
              {t.dashboard.positionFilters.activeBadge(activeFilterOption.label)}
            </Badge>
          )}
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="group w-full justify-between rounded-full border-slate-200 bg-[color:var(--color-neutral-white)]/70 px-4 py-2 text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-overlay-blue-50 hover:text-blue-600 sm:w-auto sm:justify-start"
              >
                <Filter className="h-4 w-4 text-blue-500 transition group-hover:text-blue-600" />
                <span className="min-w-0 flex-1 text-left text-sm font-medium sm:flex-none">
                  {hasFilterApplied
                    ? activeFilterOption.label
                    : t.dashboard.positionFilters.triggerLabel}
                </span>
                <Badge className="ml-2 shrink-0 rounded-full border-transparent bg-[color:var(--color-blue-500)]/10 px-2 py-0.5 text-xs font-semibold text-blue-600">
                  {filteredOpenMetrics.length}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-100 bg-[color:var(--color-neutral-white)]/95 p-2 shadow-lg sm:w-80"
            >
              <DropdownMenuLabel className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t.dashboard.positionFilters.title}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="mx-2 my-2 bg-slate-100" />
              {filterOptions.map(({ key, label, description, icon: Icon }) => {
                const isActive = activeFilter === key;
                return (
                  <DropdownMenuItem
                    key={key}
                    onSelect={() => setActiveFilter(key)}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl px-3 py-2 text-sm transition focus:bg-[color:var(--color-blue-50)]/70 focus:text-blue-700',
                      isActive ? 'bg-[color:var(--color-blue-50)]/60 text-blue-700' : 'text-slate-600'
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-500">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="space-y-0.5">
                      <p className="font-medium text-slate-900 group-focus:text-blue-700">
                        {label}
                      </p>
                      <p className="text-xs text-slate-500 group-focus:text-blue-600">
                        {description}
                      </p>
                    </div>
                    {isActive && <Check className="ml-auto h-4 w-4 text-blue-500" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-xs font-medium text-slate-400 sm:text-right">{openResultLabel}</p>
        </div>
      </div>
      {filterEmptyState ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-[color:var(--color-neutral-white)]/60 px-6 py-10 text-center text-sm text-slate-500">
          {t.dashboard.positionFilters.empty}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
          {filteredOpenMetrics.map((metrics) => {
            const sparklineKey =
              metrics.position.activationId ?? metrics.position.id ?? metrics.position.symbol;
            return (
              <PositionCard
                key={metrics.position.id || metrics.position.symbol}
                metrics={metrics}
                sparklineData={sparklineData[sparklineKey] || []}
              />
            );
          })}
        </div>
      )}
      {showClosedSection && (
        <div className="space-y-3 sm:space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <h2 className="text-xl font-semibold text-slate-900">{closedTitle}</h2>
            <p className="text-sm text-slate-500">{sortNotice}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3">
            {groupedClosedMetrics.map((group) => {
              return (
                <ClosedPositionGroupCard
                  key={`closed-group-${group.groupId}`}
                  group={group}
                  sparklineData={sparklineData}
                  locale={locale}
                  selectorLabel={t.dashboard.closedViewSelectorLabel}
                  countLabel={t.dashboard.closedViewCount}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface ClosedPositionGroupCardProps {
  group: ClosedMetricsGroup;
  sparklineData: Record<string, HistoricalPoint[]>;
  locale: 'he' | 'en';
  selectorLabel: string;
  countLabel: (count: number) => string;
}

const ClosedPositionGroupCard = memo(function ClosedPositionGroupCard({
  group,
  sparklineData,
  locale,
  selectorLabel,
  countLabel,
}: ClosedPositionGroupCardProps) {
  const [selectedId, setSelectedId] = useState(group.options[0]?.id ?? '');
  const resolvedSelectedId = group.options.some((option) => option.id === selectedId)
    ? selectedId
    : group.options[0]?.id ?? '';
  const selectedOption = group.options.find((option) => option.id === resolvedSelectedId) ?? group.options[0];
  if (!selectedOption) {
    return null;
  }

  const hasMultipleOptions = group.options.length > 1;
  const selectedIndex = group.options.findIndex((option) => option.id === selectedOption.id);
  const previousOption = selectedIndex > 0 ? group.options[selectedIndex - 1] : null;
  const nextOption =
    selectedIndex >= 0 && selectedIndex < group.options.length - 1
      ? group.options[selectedIndex + 1]
      : null;

  return (
    <PositionCard
      metrics={selectedOption.metrics}
      sparklineData={sparklineData[selectedOption.sparklineKey] || []}
      closedSelector={
        hasMultipleOptions ? (
          <div className="rounded-2xl border border-blue-100/90 bg-gradient-to-br from-blue-50/80 to-sky-50/60 p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700">
                {selectorLabel}
              </p>
              <Badge className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                {countLabel(group.options.length)}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!previousOption}
                className="h-9 w-full rounded-xl border-blue-200 bg-white/90 p-0 text-blue-700 hover:bg-white disabled:opacity-40 sm:w-9"
                onClick={() => previousOption && setSelectedId(previousOption.id)}
              >
                {locale === 'he' ? '→' : '←'}
              </Button>

              <Select value={resolvedSelectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="h-9 w-full rounded-xl border-blue-200 bg-white/95 text-[13px] font-semibold text-slate-800 shadow-sm ring-0 focus:ring-2 focus:ring-blue-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 rounded-xl border-blue-100 bg-white/95">
                  {group.options.map((option) => (
                    <SelectItem
                      key={option.id}
                      value={option.id}
                      className="rounded-lg py-2 text-sm data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!nextOption}
                className="h-9 w-full rounded-xl border-blue-200 bg-white/90 p-0 text-blue-700 hover:bg-white disabled:opacity-40 sm:w-9"
                onClick={() => nextOption && setSelectedId(nextOption.id)}
              >
                {locale === 'he' ? '←' : '→'}
              </Button>
            </div>
          </div>
        ) : null
      }
    />
  );
});

function formatClosedOptionDate(timestamp: number, locale: 'he' | 'en') {
  if (!Number.isFinite(timestamp)) {
    return locale === 'he' ? 'ללא תאריך' : 'No date';
  }

  return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp));
}
