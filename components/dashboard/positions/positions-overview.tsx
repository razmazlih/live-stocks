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
  const handleResetFilter = () => setActiveFilter('all');

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
  const closedGroupCountLabel = t.dashboard.closedViewCount(groupedClosedMetrics.length);
  const clearFilterLabel = locale === 'he' ? 'נקה סינון' : 'Clear filter';
  const ActiveFilterIcon = activeFilterOption.icon;
  const filterStateLabel = hasFilterApplied
    ? t.dashboard.positionFilters.activeBadge(activeFilterOption.label)
    : locale === 'he'
      ? 'כל הפוזיציות הפעילות'
      : 'All active positions';
  const filterStateDescription = hasFilterApplied
    ? activeFilterOption.description
    : locale === 'he'
      ? 'מוצג כרגע מבט מלא, מסודר לפי פער התחזית כדי לזהות מהר מה דורש תשומת לב.'
      : 'Showing the full open-position set, still sorted by forecast gap so the most actionable names stay on top.';
  const openResultsLabel = locale === 'he' ? 'תוצאות פתוחות' : 'Open results';
  const openCardsSummary = locale === 'he'
    ? `${filteredOpenMetrics.length} כרטיסים זמינים בסקירה`
    : `${filteredOpenMetrics.length} cards ready in the overview`;
  const filterPanelLabel = locale === 'he' ? 'בקרת סינון' : 'Filter controls';
  const cardsPanelLabel = locale === 'he' ? 'רשימת כרטיסים' : 'Card grid';
  const closedPanelDescription = locale === 'he'
    ? 'כל קבוצה מייצגת מניה סגורה, עם מעבר מהיר בין סגירות קודמות של אותה אחזקה.'
    : 'Each group represents a closed symbol, with fast switching between prior closeouts for the same holding.';

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,251,255,0.92))] p-3 shadow-[0_24px_50px_-36px_rgba(15,23,42,0.4)] backdrop-blur-sm sm:p-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(191,219,254,0.55),transparent_68%)]"
        />
        <div className="relative space-y-4 sm:space-y-5">
          <div className="rounded-[28px] border border-slate-200/80 bg-[color:var(--color-neutral-white)]/84 px-4 py-4 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.34)] backdrop-blur-sm sm:px-5 sm:py-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[clamp(1.1rem,2vw,1.55rem)] font-semibold leading-tight tracking-tight text-slate-900">
                    {openTitle}
                  </h2>
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    {openResultLabel}
                  </Badge>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-slate-500">{sortNotice}</p>
              </div>
              <div className="flex items-start">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  {openResultsLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
            <div
              className={cn(
                'rounded-[26px] border px-4 py-4 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.32)] backdrop-blur-sm sm:px-5',
                hasFilterApplied
                  ? 'border-blue-200/90 bg-[linear-gradient(145deg,rgba(239,246,255,0.96),rgba(255,255,255,0.9))]'
                  : 'border-slate-200/80 bg-[linear-gradient(145deg,rgba(248,250,252,0.92),rgba(255,255,255,0.88))]'
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border shadow-sm',
                      hasFilterApplied
                        ? 'border-blue-200 bg-white text-blue-700'
                        : 'border-slate-200 bg-white text-slate-500'
                    )}
                  >
                    <ActiveFilterIcon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {filterStateLabel}
                    </p>
                    <p className="text-sm leading-6 text-slate-600">{filterStateDescription}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-semibold shadow-sm',
                      hasFilterApplied
                        ? 'border-blue-100 bg-overlay-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    )}
                  >
                    {filteredOpenMetrics.length}/{totalOpen}
                  </Badge>
                  {hasFilterApplied ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3 text-xs font-semibold text-slate-500 hover:bg-white hover:text-slate-900"
                      onClick={handleResetFilter}
                    >
                      {clearFilterLabel}
                    </Button>
                  ) : (
                    <Badge
                      variant="outline"
                      className="rounded-full border-dashed border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-500"
                    >
                      {t.dashboard.positionFilters.triggerLabel}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[26px] border border-slate-200/80 bg-[color:var(--color-neutral-white)]/88 p-3 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.32)] backdrop-blur-sm sm:p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {filterPanelLabel}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="group h-auto min-h-[5.25rem] w-full items-center justify-between gap-3 rounded-[22px] border-slate-200/90 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] px-4 py-3 text-left text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-overlay-blue-50 hover:text-blue-700"
                  >
                    <Filter className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 transition group-hover:text-blue-600" />
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {t.dashboard.positionFilters.title}
                      </span>
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {hasFilterApplied
                          ? activeFilterOption.label
                          : t.dashboard.positionFilters.triggerLabel}
                      </span>
                    </span>
                    <Badge className="shrink-0 rounded-full border-transparent bg-[rgba(59,130,246,0.1)] px-2.5 py-1 text-center text-xs font-semibold tabular-nums text-blue-700">
                      {filteredOpenMetrics.length}/{totalOpen}
                    </Badge>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-[min(24rem,calc(100vw-1rem))] rounded-[22px] border border-slate-100 bg-[rgba(255,255,255,0.97)] p-2.5 shadow-[0_24px_46px_-26px_rgba(15,23,42,0.42)] backdrop-blur-xl sm:w-80"
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
                          'group flex items-start gap-3 rounded-[18px] px-3 py-2.5 text-left text-sm leading-5 transition focus:bg-[rgba(239,246,255,0.78)] focus:text-blue-700',
                          isActive ? 'bg-[rgba(239,246,255,0.72)] text-blue-700' : 'text-slate-600'
                        )}
                      >
                        <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-500">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 space-y-0.5">
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
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.86))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {cardsPanelLabel}
                </p>
                <p className="text-sm text-slate-500">{openCardsSummary}</p>
              </div>
              <Badge
                variant="outline"
                className="rounded-full border-slate-200 bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm"
              >
                {openResultLabel}
              </Badge>
            </div>

            {filterEmptyState ? (
              <div className="rounded-[24px] border border-dashed border-slate-200 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(248,250,252,0.8))] px-5 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm">
                  <ActiveFilterIcon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-base font-semibold tracking-tight text-slate-900">
                  {t.dashboard.positionFilters.empty}
                </p>
                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                  {hasFilterApplied ? activeFilterOption.description : sortNotice}
                </p>
                {hasFilterApplied ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 rounded-full border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    onClick={handleResetFilter}
                  >
                    {clearFilterLabel}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
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
          </div>
        </div>
      </section>
      {showClosedSection && (
        <section className="relative space-y-4 rounded-[32px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(241,245,249,0.88))] p-3 shadow-[0_22px_48px_-38px_rgba(15,23,42,0.38)] sm:p-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,rgba(226,232,240,0.8),transparent_72%)]"
          />
          <div className="relative rounded-[28px] border border-slate-200/80 bg-white/82 px-4 py-4 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.26)] backdrop-blur-sm sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[clamp(1.1rem,2vw,1.5rem)] font-semibold leading-tight tracking-tight text-slate-900">
                    {closedTitle}
                  </h2>
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700 shadow-sm"
                  >
                    {closedGroupCountLabel}
                  </Badge>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-slate-500">{closedPanelDescription}</p>
              </div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400 sm:text-right">
                {t.dashboard.closedViewSelectorLabel}
              </p>
            </div>
          </div>
          <div className="relative grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
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
        </section>
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
          <div className="rounded-[24px] border border-blue-100/90 bg-[linear-gradient(145deg,rgba(239,246,255,0.9),rgba(255,255,255,0.94))] p-3.5 shadow-[0_18px_30px_-24px_rgba(37,99,235,0.32)]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                {selectorLabel}
              </p>
              <Badge className="rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                {countLabel(group.options.length)}
              </Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!previousOption}
                aria-label={locale === 'he' ? 'סגירה קודמת' : 'Previous close'}
                title={locale === 'he' ? 'סגירה קודמת' : 'Previous close'}
                className="h-10 w-full rounded-2xl border-blue-200 bg-white/95 p-0 text-blue-700 shadow-sm hover:bg-white disabled:opacity-40 sm:w-10"
                onClick={() => previousOption && setSelectedId(previousOption.id)}
              >
                {locale === 'he' ? '→' : '←'}
              </Button>

              <Select value={resolvedSelectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="h-10 w-full rounded-2xl border-blue-200 bg-white/95 text-[13px] font-semibold text-slate-800 shadow-sm ring-0 focus:ring-2 focus:ring-blue-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 rounded-2xl border-blue-100 bg-white/95">
                  {group.options.map((option) => (
                    <SelectItem
                      key={option.id}
                      value={option.id}
                      className="rounded-xl py-2 text-sm data-[highlighted]:bg-blue-50 data-[highlighted]:text-blue-700"
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
                aria-label={locale === 'he' ? 'סגירה הבאה' : 'Next close'}
                title={locale === 'he' ? 'סגירה הבאה' : 'Next close'}
                className="h-10 w-full rounded-2xl border-blue-200 bg-white/95 p-0 text-blue-700 shadow-sm hover:bg-white disabled:opacity-40 sm:w-10"
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
