'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { CalendarDays, Eye, Layers, ListChecks, Plus, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';

import { WatchlistGroupSelector } from '@/components/watchlist/watchlist-group-selector';
import { TimeRangeTabs } from '@/components/watchlist/time-range-tabs';
import { TickerCard } from '@/components/watchlist/ticker-card';
import { Button } from '@/components/ui/button';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
import { DashboardPageShell } from '@/components/dashboard/page-shell';
import type { DashboardQuickAction } from '@/components/dashboard/quick-actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useApp } from '@/lib/context';
import { useTranslation } from '@/lib/translations';
import { formatDate, formatPercent, mapCandleDataToPoints } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import { useWatchlist } from '@/hooks/use-watchlist';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import type {
  CandleData,
  HistoricalPoint,
  StockQuote,
  TimeRange,
  WatchlistGroup as WatchlistGroupType,
  WatchlistTicker as WatchlistTickerType,
} from '@/types';
import { createEmptyGroupForm, createEmptyTickerForm } from '@/features/watchlist/forms';
import { getRangeParams } from '@/features/watchlist/range';
import {
  buildTickerCacheKey,
  getTickerCacheTtlMs,
  readTickerCache,
  writeTickerCache,
} from '@/features/watchlist/cache';
import { SortableTickerCard } from '@/features/watchlist/sortable-ticker-card';
import { buildWatchlistSignalSummary } from '@/features/watchlist/signals';
import type { GroupFormState, TickerFormState, TickerState } from '@/features/watchlist/types';
import { getWatchlistTickerKey } from '@/features/watchlist/utils';

export default function WatchlistPage() {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const isRtl = locale === 'he';

  const {
    groups,
    selectedGroupId,
    selectedGroup,
    loading,
    refreshing,
    error: watchlistError,
    selectGroup,
    refresh,
    createGroup,
    updateGroup,
    deleteGroup,
    createTicker,
    updateTicker,
    deleteTicker,
    reorderTickers,
  } = useWatchlist();

  const [range, setRange] = useState<TimeRange>('1M');
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupFormState>(createEmptyGroupForm);
  const [tickerDialogOpen, setTickerDialogOpen] = useState(false);
  const [tickerForm, setTickerForm] = useState<TickerFormState>(createEmptyTickerForm);
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>({});
  const [refreshingTickers, setRefreshingTickers] = useState(false);
  const [sortableTickers, setSortableTickers] = useState<WatchlistTickerType[]>(
    selectedGroup?.tickers ?? []
  );
  const [activeTickerId, setActiveTickerId] = useState<string | null>(null);
  const [freshnessTick, setFreshnessTick] = useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const finnhubToken = settings.finnhubToken?.trim();

  useEffect(() => {
    if (selectedGroup?.tickers) {
      setSortableTickers([...selectedGroup.tickers]);
    } else {
      setSortableTickers([]);
    }
  }, [selectedGroup]);

  const effectiveStartDate = useMemo(() => {
    if (customStartDate instanceof Date && !Number.isNaN(customStartDate.getTime())) {
      const normalized = new Date(customStartDate);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    }

    const { from } = getRangeParams(range);
    return new Date(from * 1000);
  }, [customStartDate, range]);

  const effectiveFromSeconds = useMemo(
    () => Math.floor(effectiveStartDate.getTime() / 1000),
    [effectiveStartDate]
  );

  const chartErrorMessage = t.watchlist.charts.error;
  const chartLoadingMessage = t.watchlist.charts.loading;

  const formattedStartDate = useMemo(
    () => formatDate(effectiveStartDate, locale),
    [effectiveStartDate, locale]
  );
  const hasCustomStartDate = customStartDate !== null;
  const [startDatePopoverOpen, setStartDatePopoverOpen] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setFreshnessTick((tick) => tick + 1);
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const minSelectableDate = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 10);
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const maxSelectableDate = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const handleRangeChange = useCallback((nextRange: TimeRange) => {
    setRange(nextRange);
    setCustomStartDate(null);
  }, []);

  const handleStartDateChange = useCallback((date: Date | undefined) => {
    if (!date) {
      return;
    }

    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);

    const maxDate = new Date();
    maxDate.setHours(0, 0, 0, 0);

    if (normalized > maxDate) {
      setCustomStartDate(maxDate);
    } else {
      setCustomStartDate(normalized);
    }
  }, []);

  const handleResetStartDate = useCallback(() => {
    setCustomStartDate(null);
  }, []);

  const startDateSummary = t.watchlist.filters.summary(formattedStartDate);

  useEffect(() => {
    const validKeys = new Set(
      groups.flatMap((group) => group.tickers.map((ticker) => getWatchlistTickerKey(ticker)))
    );

    setTickerStates((prev) => {
      const next: Record<string, TickerState> = {};
      for (const [key, value] of Object.entries(prev)) {
        if (validKeys.has(key)) {
          next[key] = value;
        }
      }
      return next;
    });
  }, [groups]);

  const fetchTickerData = useCallback(
    async (
      ticker: WatchlistTickerType,
      options?: { range?: TimeRange; force?: boolean; startDate?: Date | null }
    ) => {
      const targetRange = options?.range ?? range;
      const startDateForFetch = options?.startDate ?? effectiveStartDate;
      const { from, resolution } = getRangeParams(targetRange, startDateForFetch);
      const key = getWatchlistTickerKey(ticker);
      const cacheKey = buildTickerCacheKey(key, targetRange, from, resolution);

      if (!options?.force) {
        const cached = readTickerCache(cacheKey);
        if (cached) {
          setTickerStates((prev) => ({
            ...prev,
            [key]: {
              quote: cached.quote ?? null,
              historical: Array.isArray(cached.historical)
                ? (cached.historical as HistoricalPoint[])
                : [],
              loading: false,
              error: cached.error ?? null,
              range: targetRange,
              from,
              lastUpdated:
                typeof cached.storedAt === 'number' ? cached.storedAt : Date.now(),
            },
          }));
          return;
        }
      }

      setTickerStates((prev) => {
        const existing = prev[key];
        if (
          !options?.force &&
          existing &&
          existing.loading &&
          existing.range === targetRange &&
          existing.from === from
        ) {
          return prev;
        }

        return {
          ...prev,
          [key]: {
            quote: existing?.quote ?? null,
            historical: existing?.historical ?? [],
            loading: true,
            error: null,
            range: targetRange,
            from,
            lastUpdated: existing?.lastUpdated ?? null,
          },
        };
      });

      try {
        const symbol = ticker.symbol.toUpperCase();
        const nowSeconds = Math.floor(Date.now() / 1000);

        const quoteParams = new URLSearchParams({ symbol });
        if (finnhubToken) {
          quoteParams.set('token', finnhubToken);
        }
        if (options?.force) {
          quoteParams.set('forceRefresh', '1');
        }

        const candlesParams = new URLSearchParams({
          symbol,
          resolution,
          from: String(from),
          to: String(nowSeconds),
        });

        const [quoteResponse, candlesResponse] = await Promise.all([
          fetch(`/api/quote?${quoteParams.toString()}`),
          fetch(`/api/candles?${candlesParams.toString()}`),
        ]);

        let quote: StockQuote | null = null;
        if (quoteResponse.ok) {
          quote = (await quoteResponse.json()) as StockQuote;
        } else {
          const payload = (await quoteResponse.json().catch(() => null)) as { error?: string } | null;
          if (payload?.error) {
            console.warn('Quote API error:', payload.error);
          }
        }

        let historical: HistoricalPoint[] = [];
        let errorMessage: string | null = null;

        if (candlesResponse.ok) {
          const payload = (await candlesResponse.json()) as (CandleData & { error?: string }) | { error: string };
          if ('error' in payload && payload.error) {
            const normalized = payload.error.toLowerCase();
            if (!normalized.includes('no data')) {
              errorMessage = chartErrorMessage;
            }
          } else {
            historical = mapCandleDataToPoints(payload as CandleData);
          }
        } else {
          const payload = (await candlesResponse.json().catch(() => null)) as { error?: string } | null;
          if (payload?.error && payload.error.toLowerCase().includes('no data')) {
            historical = [];
          } else {
            errorMessage = chartErrorMessage;
          }
        }

        const fetchedAt = Date.now();
        writeTickerCache(cacheKey, {
          quote,
          historical,
          error: errorMessage,
          storedAt: fetchedAt,
          expiresAt: fetchedAt + getTickerCacheTtlMs(new Date(fetchedAt)),
          range: targetRange,
          from,
          resolution,
        });

        setTickerStates((prev) => ({
          ...prev,
          [key]: {
            quote,
            historical,
            loading: false,
            error: errorMessage,
            range: targetRange,
            from,
            lastUpdated: fetchedAt,
          },
        }));
      } catch (error) {
        console.error('Failed to load ticker data', error);
        const failedAt = Date.now();
        setTickerStates((prev) => ({
          ...prev,
          [key]: {
            quote: prev[key]?.quote ?? null,
            historical: prev[key]?.historical ?? [],
            loading: false,
            error: chartErrorMessage,
            range: targetRange,
            from,
            lastUpdated: failedAt,
          },
        }));
      }
    },
    [chartErrorMessage, effectiveStartDate, finnhubToken, range]
  );

  useEffect(() => {
    if (!selectedGroup) {
      return;
    }

    selectedGroup.tickers.forEach((ticker) => {
      const key = getWatchlistTickerKey(ticker);
      const state = tickerStates[key];
      const shouldLoad =
        !state ||
        state.range !== range ||
        state.from !== effectiveFromSeconds;

      if (shouldLoad) {
        fetchTickerData(ticker, { range, startDate: effectiveStartDate }).catch((error) => {
          console.error('Failed to load ticker data', error);
        });
      }
    });
  }, [
    effectiveFromSeconds,
    effectiveStartDate,
    fetchTickerData,
    range,
    selectedGroup,
    tickerStates,
  ]);

  const timeRangeLabels = useMemo(() => t.watchlist.timeRange, [t.watchlist.timeRange]);

  const renderTickerCount = useCallback(
    (group: WatchlistGroupType) => t.watchlist.groups.count(group.tickers.length),
    [t.watchlist.groups]
  );

  const handleGroupDialogChange = useCallback((open: boolean) => {
    setGroupDialogOpen(open);
    if (!open) {
      setGroupForm(createEmptyGroupForm());
    }
  }, []);

  const handleTickerDialogChange = useCallback((open: boolean) => {
    setTickerDialogOpen(open);
    if (!open) {
      setTickerForm(createEmptyTickerForm());
    }
  }, []);

  const openCreateGroupDialog = useCallback(() => {
    setGroupForm(createEmptyGroupForm());
    setGroupDialogOpen(true);
  }, []);

  const openEditGroupDialog = useCallback((group: WatchlistGroupType) => {
    setGroupForm({
      id: group.id ?? null,
      name: group.name,
      description: group.description ?? '',
    });
    setGroupDialogOpen(true);
  }, []);

  const openCreateTickerDialog = useCallback(() => {
    setTickerForm(createEmptyTickerForm());
    setTickerDialogOpen(true);
  }, []);

  const openEditTickerDialog = useCallback((ticker: WatchlistTickerType) => {
    setTickerForm({
      id: ticker.id ?? null,
      symbol: ticker.symbol,
      display: ticker.display ?? '',
      imageUrl: ticker.imageUrl ?? '',
      note: ticker.note ?? '',
    });
    setTickerDialogOpen(true);
  }, []);

  const handleGroupSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedName = groupForm.name.trim();
      if (!trimmedName) {
        toast.error(t.watchlist.groups.errors.nameRequired);
        return;
      }

      try {
        if (groupForm.id) {
          await updateGroup(groupForm.id, {
            name: trimmedName,
            description: groupForm.description,
          });
          toast.success(t.watchlist.notifications.groupUpdated);
        } else {
          await createGroup({
            name: trimmedName,
            description: groupForm.description,
          });
          toast.success(t.watchlist.notifications.groupCreated);
        }
        setGroupDialogOpen(false);
        setGroupForm(createEmptyGroupForm());
      } catch (error) {
        console.error('Failed to save group', error);
        toast.error(t.watchlist.notifications.error);
      }
    },
    [createGroup, groupForm, t.watchlist.groups.errors.nameRequired, t.watchlist.notifications.error, t.watchlist.notifications.groupCreated, t.watchlist.notifications.groupUpdated, updateGroup]
  );

  const handleTickerSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedGroupId) {
        toast.error(t.watchlist.tickers.errors.groupRequired);
        return;
      }

      const trimmedSymbol = tickerForm.symbol.trim();
      if (!trimmedSymbol) {
        toast.error(t.watchlist.tickers.errors.symbolRequired);
        return;
      }

      try {
        if (tickerForm.id) {
          const updated = await updateTicker(tickerForm.id, {
            symbol: trimmedSymbol,
            display: tickerForm.display,
            imageUrl: tickerForm.imageUrl,
            note: tickerForm.note,
          });
          toast.success(t.watchlist.notifications.tickerUpdated);
          await fetchTickerData(updated, { force: true, startDate: effectiveStartDate });
        } else {
          const created = await createTicker(selectedGroupId, {
            symbol: trimmedSymbol,
            display: tickerForm.display,
            imageUrl: tickerForm.imageUrl,
            note: tickerForm.note,
          });
          toast.success(t.watchlist.notifications.tickerCreated);
          await fetchTickerData(created, { force: true, startDate: effectiveStartDate });
        }

        setTickerDialogOpen(false);
        setTickerForm(createEmptyTickerForm());
      } catch (error) {
        console.error('Failed to save ticker', error);
        toast.error(t.watchlist.notifications.error);
      }
    },
    [
      createTicker,
      effectiveStartDate,
      fetchTickerData,
      selectedGroupId,
      t.watchlist.notifications.error,
      t.watchlist.notifications.tickerCreated,
      t.watchlist.notifications.tickerUpdated,
      t.watchlist.tickers.errors.groupRequired,
      t.watchlist.tickers.errors.symbolRequired,
      tickerForm,
      updateTicker,
    ]
  );

  const handleDeleteGroup = useCallback(
    async (group: WatchlistGroupType) => {
      if (!group.id) {
        return;
      }
      const confirmed = window.confirm(t.watchlist.confirm.deleteGroup);
      if (!confirmed) {
        return;
      }

      try {
        await deleteGroup(group.id);
        toast.success(t.watchlist.notifications.groupDeleted);
      } catch (error) {
        console.error('Failed to delete group', error);
        toast.error(t.watchlist.notifications.error);
      }
    },
    [deleteGroup, t.watchlist.confirm.deleteGroup, t.watchlist.notifications.error, t.watchlist.notifications.groupDeleted]
  );

  const handleDeleteTicker = useCallback(
    async (ticker: WatchlistTickerType) => {
      if (!ticker.id) {
        return;
      }
      const confirmed = window.confirm(t.watchlist.confirm.deleteTicker);
      if (!confirmed) {
        return;
      }

      try {
        await deleteTicker(ticker.id);
        toast.success(t.watchlist.notifications.tickerDeleted);
      } catch (error) {
        console.error('Failed to delete ticker', error);
        toast.error(t.watchlist.notifications.error);
      }
    },
    [deleteTicker, t.watchlist.confirm.deleteTicker, t.watchlist.notifications.error, t.watchlist.notifications.tickerDeleted]
  );

  const handleRefreshAll = useCallback(async () => {
    if (refreshingTickers) {
      return;
    }

    setRefreshingTickers(true);
    try {
      if (selectedGroup) {
        await Promise.all(
          selectedGroup.tickers.map((ticker) =>
            fetchTickerData(ticker, { force: true, startDate: effectiveStartDate })
          )
        );
      }
      await refresh();
      toast.success(t.watchlist.notifications.refreshed);
    } catch (error) {
      console.error('Failed to refresh watchlist', error);
      toast.error(t.watchlist.notifications.error);
    } finally {
      setRefreshingTickers(false);
    }
  }, [
    effectiveStartDate,
    fetchTickerData,
    refresh,
    refreshingTickers,
    selectedGroup,
    t.watchlist.notifications.error,
    t.watchlist.notifications.refreshed,
  ]);

  const handleSelectGroup = useCallback(
    (groupId: string) => {
      selectGroup(groupId);
    },
    [selectGroup]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTickerId(String(event.active.id));
  }, []);

  const handleDragCancel = useCallback(() => {
    setActiveTickerId(null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTickerId(null);

      const { active, over } = event;
      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = sortableTickers.findIndex((ticker) => getWatchlistTickerKey(ticker) === active.id);
      const newIndex = sortableTickers.findIndex((ticker) => getWatchlistTickerKey(ticker) === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      if (!selectedGroup?.id) {
        return;
      }

      const previousTickers = sortableTickers;
      const nextTickers = arrayMove(sortableTickers, oldIndex, newIndex).map((ticker, index) => ({
        ...ticker,
        sortOrder: index,
      }));

      setSortableTickers(nextTickers);

      try {
        await reorderTickers(selectedGroup.id, nextTickers);
        toast.success(t.watchlist.notifications.orderUpdated);
      } catch (error) {
        console.error('Failed to reorder tickers', error);
        setSortableTickers([...previousTickers]);
        toast.error(t.watchlist.notifications.error);
      }
    },
    [
      reorderTickers,
      selectedGroup,
      sortableTickers,
      t.watchlist.notifications.error,
      t.watchlist.notifications.orderUpdated,
    ]
  );

  const totalTickers = useMemo(
    () => groups.reduce((acc, group) => acc + group.tickers.length, 0),
    [groups]
  );
  const { groups: formatGroupCount, tickers: formatTickerCount, viewing: formatViewing } = t.watchlist.meta;
  const groupSummary = formatGroupCount(groups.length);
  const tickerSummary = formatTickerCount(totalTickers);
  const selectedGroupSummary = selectedGroup
    ? `${formatViewing(selectedGroup.name)} · ${renderTickerCount(selectedGroup)}`
    : null;

  const metaBadges = [
    {
      key: 'groups',
      icon: Layers,
      label: groupSummary,
      className: 'bg-blue-50 text-blue-600',
      iconClassName: 'text-blue-500',
    },
    {
      key: 'tickers',
      icon: ListChecks,
      label: tickerSummary,
      className: 'bg-[color:var(--color-neutral-white)]/70 text-slate-600',
      iconClassName: 'text-overlay-blue-500',
    },
  ] as const;

  const quickActions: DashboardQuickAction[] = useMemo(() => {
    const baseActions = createCommonQuickActions(t, {
      include: ['reload'],
      overrides: {
        reload: {
          label: t.watchlist.actions.refreshAll,
          onClick: handleRefreshAll,
          disabled: loading || refreshingTickers,
          iconClassName: refreshingTickers ? 'animate-spin' : undefined,
        },
      },
    });

    const extraActions: DashboardQuickAction[] = [
      {
        key: 'newGroup',
        icon: Plus,
        label: t.watchlist.actions.newGroup,
        onClick: openCreateGroupDialog,
        className: 'bg-[var(--color-primary-600)] text-white shadow-sm hover:bg-[var(--color-primary-650)]',
      },
      {
        key: 'newTicker',
        icon: Plus,
        label: t.watchlist.actions.newTicker,
        onClick: openCreateTickerDialog,
        variant: 'secondary',
        disabled: !selectedGroup,
      },
    ];

    const reloadAction = baseActions.find((action) => action.key === 'reload');

    return [
      ...(reloadAction ? [reloadAction] : []),
      ...extraActions,
    ];
  }, [
    t,
    handleRefreshAll,
    loading,
    refreshingTickers,
    openCreateGroupDialog,
    openCreateTickerDialog,
    selectedGroup,
  ]);

  const watchlistSignalSummary = useMemo(
    () => buildWatchlistSignalSummary(sortableTickers, tickerStates, Date.now() + freshnessTick * 0),
    [freshnessTick, sortableTickers, tickerStates],
  );

  const activeRangeLabel = timeRangeLabels[range] ?? range;
  const watchlistCopy = locale === 'he'
    ? {
        focusLabel: 'פוקוס נוכחי',
        focusHint: 'כל הקבוצות, הטווחים והכרטיסים נשארים באותו זרם עבודה מהיר.',
        collectionsLabel: 'קבוצות מעקב',
        collectionsHint: 'רכז רשימות לפי רעיון, סקטור או תזמון כניסה.',
        workspaceLabel: 'מרחב מעקב',
        workspaceHint: 'שליטה בטווח, תאריך התחלה והוספת מניות נשארת קרובה לכרטיסים.',
        controlLabel: 'בקרה',
        controlHint: 'הגדר את טווח הצפייה לכל הקבוצה והוסף טיקרים בלי לצאת מההקשר.',
        emptyWorkspaceHint: 'צור קבוצה כדי להתחיל לבנות רצף מעקב מסודר.',
        emptyTickersHint: 'הוסף את המניה הראשונה כדי להפוך את הקבוצה למשטח עבודה חי.',
      }
    : {
        focusLabel: 'Current focus',
        focusHint: 'Groups, ranges, and cards stay in one fast scanning flow.',
        collectionsLabel: 'Watchlist collections',
        collectionsHint: 'Organize lists by idea, sector, or timing.',
        workspaceLabel: 'Watchlist workspace',
        workspaceHint: 'Range, start-date, and add-ticker controls stay close to the cards.',
        controlLabel: 'Control rail',
        controlHint: 'Set the viewing range for the whole group and add tickers without leaving context.',
        emptyWorkspaceHint: 'Create a group to start building a structured watchlist workflow.',
        emptyTickersHint: 'Add the first ticker to turn this group into a live workspace.',
      };
  const momentumToneClass = watchlistSignalSummary.averageMomentum >= 0 ? 'text-emerald-600' : 'text-rose-600';
  const syncToneClass = watchlistSignalSummary.loadingCount > 0
    ? 'bg-amber-50 text-amber-700'
    : watchlistSignalSummary.staleCount > 0
      ? 'bg-rose-50 text-rose-700'
      : 'bg-[color:var(--color-emerald-50)] text-emerald-700';
  const overviewCardClass =
    'group relative isolate overflow-hidden rounded-[26px] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-4 shadow-[0_22px_48px_-36px_rgba(15,23,42,0.55)] transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_56px_-36px_rgba(15,23,42,0.62)] motion-reduce:transform-none sm:p-5';
  const overviewIconShellClass =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.05rem] border border-white/80 bg-white/88 text-[var(--color-primary-700)] shadow-[0_18px_28px_-22px_rgba(37,99,235,0.65)]';

  return (
    <DashboardPageShell direction={isRtl ? 'rtl' : 'ltr'}>
      <div className="dashboard-page-container rebuild-page-container dashboard-page-container-tight overflow-x-clip">
        <div className="space-y-6">
          <header className="relative isolate overflow-hidden rounded-[32px] border border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(244,249,255,0.95)_52%,rgba(236,253,245,0.82))] px-4 py-5 shadow-[0_34px_70px_-44px_rgba(15,23,42,0.62)] sm:px-7 sm:py-7">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.18),transparent_40%)]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent"
            />
            <div className="relative z-10 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(21rem,26rem)] xl:items-start xl:gap-8">
              <div className="max-w-3xl space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/80 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-slate-600)] shadow-[0_14px_24px_-18px_rgba(15,23,42,0.4)]">
                  <Eye className="h-3.5 w-3.5" />
                  {locale === 'he' ? 'לוח מעקב חי' : 'Live watchlist'}
                </div>
                <div className="space-y-2.5">
                  <h1 className="max-w-3xl text-balance text-[clamp(2.1rem,5vw,3.65rem)] font-black tracking-tight text-[var(--color-primary-900)]">
                    {t.watchlist.title}
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-[var(--color-slate-600)] sm:text-base">
                    {t.watchlist.subtitle}
                  </p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-medium [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 2xl:grid-cols-4 2xl:max-w-none">
                  {metaBadges.map((badge) => {
                    const Icon = badge.icon;
                    return (
                      <span
                        key={badge.key}
                        className={cn(
                          'inline-flex min-h-14 min-w-[11rem] shrink-0 items-center gap-3 rounded-[1.15rem] border border-white/75 px-3.5 py-2.5 text-left shadow-[0_18px_34px_-28px_rgba(15,23,42,0.42)] backdrop-blur-sm sm:min-w-0',
                          badge.className
                        )}
                      >
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/80 shadow-[0_10px_18px_-14px_rgba(15,23,42,0.45)]">
                          <Icon className={cn('h-4 w-4', badge.iconClassName)} />
                        </span>
                        <span className="min-w-0 break-words text-[0.78rem] font-semibold leading-5">{badge.label}</span>
                      </span>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-[12rem] rounded-[1.3rem] border border-white/70 bg-white/75 px-4 py-3 shadow-[0_20px_32px_-26px_rgba(15,23,42,0.42)]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                      {watchlistCopy.focusLabel}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                      {selectedGroupSummary ?? t.watchlist.status.empty}
                    </p>
                  </div>
                  <div className="min-w-[14rem] flex-1 rounded-[1.3rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.6),rgba(255,255,255,0.3))] px-4 py-3 text-sm leading-6 text-[var(--color-slate-600)] shadow-[0_16px_30px_-26px_rgba(15,23,42,0.35)]">
                    {watchlistCopy.focusHint}
                  </div>
                </div>
              </div>

              <QuickActionsSection
                title={t.watchlist.actionsTitle}
                actions={quickActions}
                className="w-full min-w-0 rounded-[28px] border-white/70 bg-white/68 shadow-[0_28px_52px_-36px_rgba(15,23,42,0.58)] xl:max-w-xl xl:self-start xl:before:absolute xl:before:bottom-6 xl:before:-inset-x-0 xl:before:right-full xl:before:top-6 xl:before:w-px xl:before:bg-gradient-to-b xl:before:from-transparent xl:before:via-[rgba(148,163,184,0.42)] xl:before:to-transparent"
              >
                <div className="mt-4 rounded-[1.35rem] border border-white/75 bg-[linear-gradient(145deg,rgba(255,255,255,0.92),rgba(240,249,255,0.7))] px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)]">
                    {watchlistCopy.workspaceLabel}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--color-primary-900)]">
                    {selectedGroupSummary ?? t.watchlist.status.empty}
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-slate-600">
                    {watchlistCopy.workspaceHint}
                  </p>
                </div>
              </QuickActionsSection>
            </div>
          </header>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-12">
            <div className={cn(overviewCardClass, 'xl:col-span-3')}>
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.16),transparent_68%)]" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <span className={overviewIconShellClass}>
                    <Layers className="h-4.5 w-4.5" />
                  </span>
                  <span className="rounded-full bg-[color:var(--color-blue-50)] px-2.5 py-1 text-xs font-semibold text-[var(--color-blue-700)]">
                    {selectedGroup ? renderTickerCount(selectedGroup) : tickerSummary}
                  </span>
                </div>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  {locale === 'he' ? 'קבוצה פעילה' : 'Active group'}
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="text-2xl font-semibold tracking-tight text-slate-900">
                    {groupSummary}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {selectedGroupSummary ?? (locale === 'he' ? 'בחר קבוצה כדי לראות את הקשר שלה.' : 'Choose a group to see its context.')}
                </p>
              </div>
            </div>

            <div className={cn(overviewCardClass, 'xl:col-span-3')}>
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(37,99,235,0.14),transparent_68%)]" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <span className={overviewIconShellClass}>
                    <CalendarDays className="h-4.5 w-4.5" />
                  </span>
                  <span className="rounded-full bg-[color:var(--color-primary-050)] px-2.5 py-1 text-xs font-semibold text-[var(--color-primary-700)]">
                    {formattedStartDate}
                  </span>
                </div>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  {locale === 'he' ? 'טווח נוכחי' : 'Current range'}
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="text-2xl font-semibold tracking-tight text-slate-900">
                    {activeRangeLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{startDateSummary}</p>
              </div>
            </div>

            <div className={cn(overviewCardClass, 'xl:col-span-3')}>
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.15),transparent_68%)]" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <span className={cn(overviewIconShellClass, momentumToneClass)}>
                    <Eye className="h-4.5 w-4.5" />
                  </span>
                  <span className="rounded-full bg-[color:var(--color-slate-100)] px-2.5 py-1 text-xs font-semibold text-slate-600">
                    {watchlistSignalSummary.samples}
                  </span>
                </div>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  {locale === 'he' ? 'תנופת קבוצה' : 'Group momentum'}
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className={cn('text-2xl font-semibold tracking-tight', momentumToneClass)}>
                    {watchlistSignalSummary.averageMomentum > 0 ? '+' : ''}
                    {formatPercent(watchlistSignalSummary.averageMomentum, locale)}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {locale === 'he'
                    ? `${watchlistSignalSummary.positiveCount} עולים · ${watchlistSignalSummary.negativeCount} יורדים · ${watchlistSignalSummary.neutralCount} יציבים`
                    : `${watchlistSignalSummary.positiveCount} rising · ${watchlistSignalSummary.negativeCount} falling · ${watchlistSignalSummary.neutralCount} steady`}
                </p>
              </div>
            </div>

            <div className={cn(overviewCardClass, 'xl:col-span-3')}>
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.16),transparent_68%)]" />
              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <span className={overviewIconShellClass}>
                    <RefreshCw className="h-4.5 w-4.5" />
                  </span>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', syncToneClass)}>
                    {watchlistSignalSummary.loadingCount > 0
                      ? locale === 'he'
                        ? `${watchlistSignalSummary.loadingCount} נטענים`
                        : `${watchlistSignalSummary.loadingCount} loading`
                      : watchlistSignalSummary.staleCount > 0
                        ? locale === 'he'
                          ? `${watchlistSignalSummary.staleCount} מיושנים`
                          : `${watchlistSignalSummary.staleCount} stale`
                        : locale === 'he'
                          ? 'מעודכן'
                          : 'Synced'}
                  </span>
                </div>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  {locale === 'he' ? 'סנכרון' : 'Sync state'}
                </p>
                <div className="mt-2 flex items-end justify-between gap-3">
                  <span className="text-2xl font-semibold tracking-tight text-slate-900">
                    {watchlistSignalSummary.readyCount}/{watchlistSignalSummary.totalTickers}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span className="rounded-full bg-[color:var(--color-emerald-50)] px-2.5 py-1 text-emerald-700">
                    {locale === 'he'
                      ? `${watchlistSignalSummary.freshCount} מוכנים`
                      : `${watchlistSignalSummary.freshCount} ready`}
                  </span>
                  <span className="rounded-full bg-[color:var(--color-amber-50)] px-2.5 py-1 text-[color:var(--color-amber-700)]">
                    {locale === 'he'
                      ? `${watchlistSignalSummary.loadingCount} נטענים`
                      : `${watchlistSignalSummary.loadingCount} loading`}
                  </span>
                  <span className="rounded-full bg-[color:var(--color-rose-50)] px-2.5 py-1 text-rose-700">
                    {locale === 'he'
                      ? `${watchlistSignalSummary.staleCount} מיושנים`
                      : `${watchlistSignalSummary.staleCount} stale`}
                  </span>
                  {watchlistSignalSummary.errorCount > 0 ? (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                      {locale === 'he'
                        ? `${watchlistSignalSummary.errorCount} שגיאות`
                        : `${watchlistSignalSummary.errorCount} errors`}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="relative isolate overflow-hidden rounded-[28px] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(255,251,235,0.84))] p-4 shadow-[0_24px_48px_-36px_rgba(15,23,42,0.52)] sm:col-span-2 sm:p-5 xl:col-span-12">
              <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-56 bg-[radial-gradient(circle_at_right,rgba(245,158,11,0.16),transparent_66%)]" />
              <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    {locale === 'he' ? 'רוחב תצוגה' : 'View span'}
                  </p>
                  <div className="mt-2 flex items-end gap-3">
                    <span className="text-2xl font-semibold tracking-tight text-slate-900">
                      {watchlistSignalSummary.noteCount}
                    </span>
                    <span className="rounded-full bg-[color:var(--color-amber-50)] px-2.5 py-1 text-xs font-semibold text-[color:var(--color-amber-600)]">
                      {locale === 'he' ? 'הערות' : 'Notes'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    {locale === 'he'
                      ? 'ככל שיש יותר הערות, כך התצוגה הופכת עשירה יותר.'
                      : 'Notes add context without crowding the cards.'}
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[19rem]">
                  <div className="rounded-[1.15rem] border border-white/75 bg-white/78 px-4 py-3 shadow-[0_18px_30px_-24px_rgba(15,23,42,0.36)]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      {watchlistCopy.collectionsLabel}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{groupSummary}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{watchlistCopy.collectionsHint}</p>
                  </div>
                  <div className="rounded-[1.15rem] border border-white/75 bg-white/78 px-4 py-3 shadow-[0_18px_30px_-24px_rgba(15,23,42,0.36)]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      {watchlistCopy.workspaceLabel}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{tickerSummary}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {locale === 'he'
                        ? `${watchlistSignalSummary.noteCount} כרטיסים כוללים הערות.`
                        : `${watchlistSignalSummary.noteCount} cards include notes.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)] xl:items-start 2xl:gap-8">
            <aside className="space-y-4 xl:sticky xl:top-6">
              <div className="relative overflow-hidden rounded-[30px] border border-[color:var(--color-slate-200)]/80 bg-[linear-gradient(180deg,rgba(250,252,255,0.98),rgba(244,247,252,0.92))] p-3 shadow-[0_28px_56px_-42px_rgba(15,23,42,0.5)]">
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.1),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.24),transparent_36%)]" />
                <div className="relative z-10 mb-3 space-y-1 px-1">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/75 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)] shadow-[0_12px_22px_-18px_rgba(15,23,42,0.35)]">
                    <Layers className="h-3.5 w-3.5" />
                    {watchlistCopy.collectionsLabel}
                  </div>
                  <p className="text-sm leading-6 text-slate-500">{watchlistCopy.collectionsHint}</p>
                </div>
              <WatchlistGroupSelector
                groups={groups}
                selectedGroupId={selectedGroupId}
                onSelect={handleSelectGroup}
                onCreate={openCreateGroupDialog}
                onEdit={openEditGroupDialog}
                onDelete={handleDeleteGroup}
                isLoading={loading}
                isRefreshing={refreshing}
                title={t.watchlist.groups.title}
                description={t.watchlist.groups.description}
                addLabel={t.watchlist.actions.newGroup}
                emptyStateText={t.watchlist.groups.empty}
                loadingText={t.watchlist.groups.loading}
                renderTickerCount={renderTickerCount}
                editLabel={t.watchlist.actions.editGroup}
                deleteLabel={t.watchlist.actions.deleteGroup}
                className="w-full min-w-0 border-white/70 bg-white/72 shadow-none"
              />
              </div>
            </aside>

            <div className="flex w-full flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-white/85 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-slate-500)] shadow-[0_12px_22px_-18px_rgba(15,23,42,0.35)]">
                    <ListChecks className="h-3.5 w-3.5" />
                    {watchlistCopy.workspaceLabel}
                  </div>
                  <p className="text-sm leading-6 text-slate-500">{watchlistCopy.workspaceHint}</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--color-slate-200)]/80 bg-white/85 px-3 py-2 text-xs font-semibold text-slate-600 shadow-[0_14px_24px_-18px_rgba(15,23,42,0.32)]">
                  <RefreshCw className={cn('h-3.5 w-3.5 text-[var(--color-primary-500)]', refreshingTickers ? 'animate-spin' : undefined)} />
                  <span>{selectedGroupSummary ?? t.watchlist.status.empty}</span>
                </div>
              </div>

              {watchlistError ? (
                <Alert
                  variant="destructive"
                  className="rounded-[28px] border border-[color:var(--color-rose-200)] bg-[linear-gradient(135deg,rgba(255,241,242,0.95),rgba(255,255,255,0.88))] px-6 py-5 text-rose-700 shadow-[0_24px_48px_-36px_rgba(225,29,72,0.42)]"
                >
                  <AlertTitle className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/80 bg-white/75 shadow-[0_14px_26px_-18px_rgba(190,24,93,0.4)]">
                      <RefreshCw className="h-4.5 w-4.5" />
                    </span>
                    <span>{t.watchlist.status.errorTitle}</span>
                  </AlertTitle>
                  <AlertDescription className="mt-3 flex flex-wrap items-center gap-3 text-rose-600">
                    <span className="max-w-2xl">{t.watchlist.status.error}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRefreshAll}
                      className="gap-2 rounded-full border-rose-200 bg-white text-rose-700 shadow-sm hover:bg-rose-50"
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t.watchlist.actions.retry}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {selectedGroup ? (
                <div className="space-y-6">
                  <section className="relative overflow-hidden rounded-[30px] border border-[color:var(--color-slate-200)]/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,249,253,0.94))] px-4 py-4 shadow-[0_28px_58px_-42px_rgba(15,23,42,0.48)] sm:px-6 sm:py-6">
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.16),transparent_34%)]" />
                    <div className="space-y-5">
                      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-slate-600)] shadow-[0_14px_24px_-18px_rgba(15,23,42,0.34)]">
                            <Layers className="h-3.5 w-3.5" />
                            {renderTickerCount(selectedGroup)}
                          </div>
                          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                            {selectedGroup.name}
                          </h2>
                          {selectedGroup.description ? (
                            <p className="max-w-2xl text-sm leading-6 text-slate-500">
                              {selectedGroup.description}
                            </p>
                          ) : null}
                        </div>

                        <div
                          className={cn(
                            'flex w-full max-w-3xl min-w-0 flex-col gap-4',
                            isRtl ? 'lg:items-start' : 'lg:items-end'
                          )}
                        >
                          <div className="w-full rounded-[26px] border border-[color:var(--color-slate-200)]/75 bg-[linear-gradient(160deg,rgba(248,250,252,0.98),rgba(255,255,255,0.82)_54%,rgba(239,246,255,0.8))] p-4 shadow-[0_20px_38px_-30px_rgba(15,23,42,0.48)] sm:p-5">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                  {watchlistCopy.controlLabel}
                                </p>
                                <p className="text-sm text-slate-500">
                                  {watchlistCopy.controlHint}
                                </p>
                              </div>
                              <span className="hidden rounded-full border border-white/80 bg-[color:var(--color-neutral-white)]/88 px-2.5 py-1 text-[11px] font-semibold text-slate-600 shadow-sm sm:inline-flex">
                                {startDateSummary}
                              </span>
                            </div>

                            <div className="mt-4 space-y-4">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-[1.15rem] border border-white/75 bg-white/78 px-4 py-3 shadow-[0_14px_26px_-20px_rgba(15,23,42,0.32)]">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                    {locale === 'he' ? 'טווח פעיל' : 'Active range'}
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900">{activeRangeLabel}</p>
                                  <p className="mt-1 text-xs leading-5 text-slate-500">{startDateSummary}</p>
                                </div>
                                <div className="rounded-[1.15rem] border border-white/75 bg-white/78 px-4 py-3 shadow-[0_14px_26px_-20px_rgba(15,23,42,0.32)]">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                    {locale === 'he' ? 'פוקוס קבוצה' : 'Group focus'}
                                  </p>
                                  <p className="mt-1 text-sm font-semibold text-slate-900">
                                    {selectedGroupSummary ?? t.watchlist.status.empty}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-slate-500">{watchlistCopy.workspaceHint}</p>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                                  {locale === 'he' ? 'טווח זמן' : 'Time range'}
                                </p>
                                <TimeRangeTabs value={range} onChange={handleRangeChange} labels={timeRangeLabels} />
                              </div>

                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                <Popover open={startDatePopoverOpen} onOpenChange={setStartDatePopoverOpen}>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        'flex min-h-11 w-full items-center gap-3 rounded-full border-white/80 bg-[color:var(--color-neutral-white)]/90 px-4 py-2 text-left text-sm shadow-[0_14px_24px_-18px_rgba(15,23,42,0.28)] transition-colors hover:border-[color:var(--color-slate-300)] hover:bg-[color:var(--color-slate-50)]',
                                        hasCustomStartDate
                                          ? 'ring-1 ring-[color:var(--color-slate-300)]'
                                          : undefined
                                      )}
                                    >
                                      <CalendarDays className="h-4 w-4 shrink-0 text-slate-500" />
                                      <div className="flex min-w-0 flex-1 flex-col leading-tight">
                                        <span className="text-xs font-medium text-slate-500">
                                          {t.watchlist.filters.startDateLabel}
                                        </span>
                                        <span
                                          className={cn(
                                            'text-sm font-semibold text-slate-700',
                                            hasCustomStartDate ? 'text-slate-900' : undefined
                                          )}
                                        >
                                          {formattedStartDate}
                                        </span>
                                      </div>
                                      {hasCustomStartDate ? (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                          {t.watchlist.filters.customBadge}
                                        </span>
                                      ) : null}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent
                                    align={isRtl ? 'end' : 'start'}
                                    className="w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] p-4 shadow-lg"
                                  >
                                    <div className="flex flex-col gap-3">
                                      <p className="text-sm font-medium text-slate-700">
                                        {t.watchlist.filters.startDateDescription}
                                      </p>
                                      <Calendar
                                        mode="single"
                                        selected={customStartDate ?? effectiveStartDate}
                                        defaultMonth={customStartDate ?? effectiveStartDate}
                                        onSelect={(date) => {
                                          if (!date) {
                                            return;
                                          }
                                          handleStartDateChange(date);
                                          setStartDatePopoverOpen(false);
                                        }}
                                        toDate={maxSelectableDate}
                                        fromDate={minSelectableDate}
                                        initialFocus
                                      />
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          handleResetStartDate();
                                          setStartDatePopoverOpen(false);
                                        }}
                                        className="justify-start text-slate-600 hover:text-blue-600"
                                      >
                                        {t.watchlist.filters.resetStartDate}
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                                <Button
                                  size="sm"
                                  className="min-h-11 w-full gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-primary-500),var(--color-primary-650))] text-white shadow-[0_18px_32px_-20px_rgba(37,99,235,0.6)] hover:bg-[var(--color-primary-700)] sm:w-auto"
                                  onClick={openCreateTickerDialog}
                                >
                                  <Plus className="h-4 w-4" />
                                  {t.watchlist.actions.newTicker}
                                </Button>
                              </div>

                              <div className="flex flex-col gap-2 rounded-[1.2rem] border border-[color:var(--color-blue-100)]/80 bg-[color:var(--color-blue-50)]/55 px-4 py-3 text-xs leading-5 text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.62)] sm:flex-row sm:items-center sm:justify-between">
                                <span>
                                  {locale === 'he'
                                    ? 'טווח הזמן מחושב לכל הכרטיסים בקבוצה, והסידור נשמר בגרירה בלבד.'
                                    : 'The range applies to the whole group, and drag-and-drop only changes order.'}
                                </span>
                                <span className="rounded-full border border-white/75 bg-[color:var(--color-neutral-white)] px-2.5 py-1 font-semibold text-slate-600">
                                  {startDateSummary}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  {sortableTickers.length ? (
                    <DndContext
                      sensors={sensors}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragCancel={handleDragCancel}
                    >
                      <SortableContext
                        items={sortableTickers.map((ticker) => getWatchlistTickerKey(ticker))}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
                          {sortableTickers.map((ticker) => {
                            const tickerKey = getWatchlistTickerKey(ticker);
                            const state = tickerStates[tickerKey];
                            const historical = state?.historical ?? [];
                            const basePoint = historical.length ? historical[0] : null;
                            const basePriceValue =
                              typeof basePoint?.close === 'number' && Number.isFinite(basePoint.close)
                                ? basePoint.close
                                : null;
                            const baseTimestamp =
                              typeof basePoint?.timestamp === 'number' && Number.isFinite(basePoint.timestamp)
                                ? basePoint.timestamp
                                : null;
                            const baseDateValue = baseTimestamp
                              ? (() => {
                                  const date = new Date(baseTimestamp);
                                  return Number.isNaN(date.getTime()) ? null : date;
                                })()
                              : null;
                            const latestHistorical =
                              historical.length > 0 ? historical[historical.length - 1] : null;
                            const fallbackCurrentPrice =
                              typeof latestHistorical?.close === 'number' &&
                              Number.isFinite(latestHistorical.close)
                                ? latestHistorical.close
                                : null;
                            const quotePrice =
                              typeof state?.quote?.c === 'number' && Number.isFinite(state.quote.c)
                                ? state.quote.c
                                : null;
                            const currentPriceValue = quotePrice ?? fallbackCurrentPrice ?? null;

                            return (
                              <SortableTickerCard
                                key={tickerKey}
                                id={tickerKey}
                                isActive={activeTickerId === tickerKey}
                              >
                                <TickerCard
                                  ticker={ticker}
                                  quote={state?.quote}
                                  historical={historical}
                                  range={range}
                                  locale={locale}
                                  loading={state?.loading}
                                  error={state?.error}
                                  onEdit={openEditTickerDialog}
                                  onDelete={handleDeleteTicker}
                                  onRefresh={(item) =>
                                    fetchTickerData(item, {
                                      force: true,
                                      startDate: effectiveStartDate,
                                    })
                                  }
                                  priceLabel={t.watchlist.labels.price}
                                  changeLabel={t.watchlist.labels.changeSince}
                                  noteLabel={t.watchlist.labels.note}
                                  emptySeriesLabel={t.watchlist.charts.empty}
                                  errorLabel={t.watchlist.charts.error}
                                  loadingLabel={chartLoadingMessage}
                                  refreshLabel={t.watchlist.actions.refreshTicker}
                                  editLabel={t.watchlist.actions.editTicker}
                                  deleteLabel={t.watchlist.actions.deleteTicker}
                                  basePrice={basePriceValue}
                                  baseDate={baseDateValue ?? effectiveStartDate}
                                  currentPrice={currentPriceValue}
                                  basePriceLabel={t.watchlist.labels.basePrice}
                                  hoverLabel={t.watchlist.labels.hover}
                                  startDateLabel={t.watchlist.labels.startDate}
                                  className="border-[color:var(--color-slate-200)] bg-[color:var(--color-neutral-white)] shadow-sm"
                                />
                              </SortableTickerCard>
                            );
                          })}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 rounded-[28px] border border-dashed border-[color:var(--color-slate-200)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-10 text-center text-sm text-slate-500 shadow-[0_24px_48px_-38px_rgba(15,23,42,0.42)]">
                      <span className="inline-flex h-14 w-14 items-center justify-center rounded-[1.3rem] border border-[color:var(--color-blue-100)]/80 bg-[color:var(--color-blue-50)]/85 text-[var(--color-primary-600)] shadow-[0_18px_30px_-22px_rgba(37,99,235,0.38)]">
                        <Plus className="h-5 w-5" />
                      </span>
                      <div className="space-y-1.5">
                        <p className="text-base font-semibold text-slate-900">{t.watchlist.status.noTickers}</p>
                        <p className="max-w-md text-xs leading-6 text-slate-500">{watchlistCopy.emptyTickersHint}</p>
                      </div>
                      <Button
                        onClick={openCreateTickerDialog}
                        className="gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-primary-500),var(--color-primary-650))] text-white shadow-[0_18px_32px_-20px_rgba(37,99,235,0.6)] hover:bg-[var(--color-primary-700)]"
                      >
                        <Plus className="h-4 w-4" />
                        {t.watchlist.actions.newTicker}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[30px] border border-dashed border-[color:var(--color-slate-200)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-12 text-center text-sm text-slate-500 shadow-[0_26px_52px_-40px_rgba(15,23,42,0.45)]">
                  <span className="inline-flex h-14 w-14 items-center justify-center rounded-[1.3rem] border border-[color:var(--color-blue-100)]/80 bg-[color:var(--color-blue-50)]/85 text-[var(--color-primary-600)] shadow-[0_18px_30px_-22px_rgba(37,99,235,0.38)]">
                    <Layers className="h-5 w-5" />
                  </span>
                  <div className="space-y-1.5">
                    <p className="text-base font-semibold text-slate-900">{t.watchlist.status.empty}</p>
                    <p className="max-w-md text-xs leading-6 text-slate-500">{watchlistCopy.emptyWorkspaceHint}</p>
                  </div>
                  <Button
                    onClick={openCreateGroupDialog}
                    className="gap-2 rounded-full bg-[linear-gradient(135deg,var(--color-primary-600),var(--color-primary-650))] text-white shadow-[0_18px_32px_-20px_rgba(37,99,235,0.6)] hover:bg-[var(--color-primary-650)]"
                  >
                    <Plus className="h-4 w-4" />
                    {t.watchlist.actions.newGroup}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Dialog open={groupDialogOpen} onOpenChange={handleGroupDialogChange}>
        <DialogContent className="w-[min(34rem,calc(100vw-1rem))] max-w-none sm:w-[min(34rem,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>
              {groupForm.id ? t.watchlist.groups.editTitle : t.watchlist.groups.createTitle}
            </DialogTitle>
            <DialogDescription>
              {groupForm.id ? t.watchlist.groups.editDescription : t.watchlist.groups.createDescription}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleGroupSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">{t.watchlist.groups.name}</Label>
              <Input
                id="group-name"
                value={groupForm.name}
                onChange={(event) =>
                  setGroupForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder={t.watchlist.groups.namePlaceholder}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-description">{t.watchlist.groups.descriptionLabel}</Label>
              <Textarea
                id="group-description"
                value={groupForm.description}
                onChange={(event) =>
                  setGroupForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder={t.watchlist.groups.descriptionPlaceholder}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleGroupDialogChange(false)}>
                {t.watchlist.actions.cancel}
              </Button>
              <Button type="submit">
                {groupForm.id ? t.watchlist.groups.saveChanges : t.watchlist.groups.saveCreate}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={tickerDialogOpen} onOpenChange={handleTickerDialogChange}>
        <DialogContent className="w-[min(44rem,calc(100vw-1rem))] max-w-none sm:w-[min(44rem,calc(100vw-2rem))]">
          <DialogHeader>
            <DialogTitle>
              {tickerForm.id ? t.watchlist.tickers.editTitle : t.watchlist.tickers.createTitle}
            </DialogTitle>
            <DialogDescription>
              {tickerForm.id ? t.watchlist.tickers.editDescription : t.watchlist.tickers.createDescription}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTickerSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ticker-symbol">{t.watchlist.tickers.symbol}</Label>
                <Input
                  id="ticker-symbol"
                  value={tickerForm.symbol}
                  onChange={(event) =>
                    setTickerForm((prev) => ({ ...prev, symbol: event.target.value }))
                  }
                  placeholder={t.watchlist.tickers.symbolPlaceholder}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ticker-display">{t.watchlist.tickers.display}</Label>
                <Input
                  id="ticker-display"
                  value={tickerForm.display}
                  onChange={(event) =>
                    setTickerForm((prev) => ({ ...prev, display: event.target.value }))
                  }
                  placeholder={t.watchlist.tickers.displayPlaceholder}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ticker-image">{t.watchlist.tickers.imageUrl}</Label>
                <Input
                  id="ticker-image"
                  value={tickerForm.imageUrl}
                  onChange={(event) =>
                    setTickerForm((prev) => ({ ...prev, imageUrl: event.target.value }))
                  }
                  placeholder={t.watchlist.tickers.imageUrlPlaceholder}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticker-note">{t.watchlist.tickers.note}</Label>
              <Textarea
                id="ticker-note"
                value={tickerForm.note}
                onChange={(event) =>
                  setTickerForm((prev) => ({ ...prev, note: event.target.value }))
                }
                placeholder={t.watchlist.tickers.notePlaceholder}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleTickerDialogChange(false)}>
                {t.watchlist.actions.cancel}
              </Button>
              <Button type="submit">
                {tickerForm.id ? t.watchlist.tickers.saveChanges : t.watchlist.tickers.saveCreate}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
