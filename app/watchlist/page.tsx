'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Layers, ListChecks, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { WatchlistGroupSelector } from '@/components/watchlist/watchlist-group-selector';
import { TimeRangeTabs } from '@/components/watchlist/time-range-tabs';
import { TickerCard } from '@/components/watchlist/ticker-card';
import { Button } from '@/components/ui/button';
import { QuickActionsSection } from '@/components/dashboard/quick-actions-section';
import type { DashboardQuickAction } from '@/components/dashboard/quick-actions';
import { createCommonQuickActions } from '@/components/dashboard/common-quick-actions';
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
import { mapCandleDataToPoints } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import { useWatchlist } from '@/hooks/use-watchlist';
import type {
  CandleData,
  HistoricalPoint,
  StockQuote,
  TimeRange,
  WatchlistGroup as WatchlistGroupType,
  WatchlistTicker as WatchlistTickerType,
} from '@/types';

interface GroupFormState {
  id: string | null;
  name: string;
  description: string;
}

interface TickerFormState {
  id: string | null;
  symbol: string;
  display: string;
  imageUrl: string;
  note: string;
}

interface TickerState {
  loading: boolean;
  error: string | null;
  quote: StockQuote | null;
  historical: HistoricalPoint[];
  range: TimeRange;
  lastUpdated: number | null;
}

function createEmptyGroupForm(): GroupFormState {
  return { id: null, name: '', description: '' };
}

function createEmptyTickerForm(): TickerFormState {
  return { id: null, symbol: '', display: '', imageUrl: '', note: '' };
}

function getRangeParams(range: TimeRange): { from: number; resolution: string } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;

  switch (range) {
    case '1D':
      return { from: nowSeconds - day * 2, resolution: '60' };
    case '1W':
      return { from: nowSeconds - day * 7, resolution: '60' };
    case '1M':
      return { from: nowSeconds - day * 30, resolution: 'D' };
    case '3M':
      return { from: nowSeconds - day * 90, resolution: 'D' };
    case '6M':
      return { from: nowSeconds - day * 180, resolution: 'D' };
    case 'YTD': {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1);
      return { from: Math.floor(startOfYear.getTime() / 1000), resolution: 'D' };
    }
    case '1Y':
      return { from: nowSeconds - day * 365, resolution: 'D' };
    case 'All':
      return { from: nowSeconds - day * 365 * 5, resolution: 'W' };
    default:
      return { from: nowSeconds - day * 90, resolution: 'D' };
  }
}

function getTickerKey(ticker: WatchlistTickerType): string {
  return ticker.id ?? ticker.symbol;
}

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
  } = useWatchlist();

  const [range, setRange] = useState<TimeRange>('1M');
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupFormState>(createEmptyGroupForm);
  const [tickerDialogOpen, setTickerDialogOpen] = useState(false);
  const [tickerForm, setTickerForm] = useState<TickerFormState>(createEmptyTickerForm);
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>({});
  const [refreshingTickers, setRefreshingTickers] = useState(false);

  const finnhubToken = settings.finnhubToken?.trim();

  const chartErrorMessage = t.watchlist.charts.error;
  const chartLoadingMessage = t.watchlist.charts.loading;

  useEffect(() => {
    const validKeys = new Set(
      groups.flatMap((group) => group.tickers.map((ticker) => getTickerKey(ticker)))
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
      options?: { range?: TimeRange; force?: boolean }
    ) => {
      const targetRange = options?.range ?? range;
      const key = getTickerKey(ticker);

      setTickerStates((prev) => {
        const existing = prev[key];
        if (!options?.force && existing && existing.loading && existing.range === targetRange) {
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
            lastUpdated: existing?.lastUpdated ?? null,
          },
        };
      });

      try {
        const symbol = ticker.symbol.toUpperCase();
        const nowSeconds = Math.floor(Date.now() / 1000);
        const { from, resolution } = getRangeParams(targetRange);

        const quoteParams = new URLSearchParams({ symbol });
        if (finnhubToken) {
          quoteParams.set('token', finnhubToken);
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

        setTickerStates((prev) => ({
          ...prev,
          [key]: {
            quote,
            historical,
            loading: false,
            error: errorMessage,
            range: targetRange,
            lastUpdated: Date.now(),
          },
        }));
      } catch (error) {
        console.error('Failed to load ticker data', error);
        setTickerStates((prev) => ({
          ...prev,
          [key]: {
            quote: prev[key]?.quote ?? null,
            historical: prev[key]?.historical ?? [],
            loading: false,
            error: chartErrorMessage,
            range: targetRange,
            lastUpdated: Date.now(),
          },
        }));
      }
    },
    [chartErrorMessage, finnhubToken, range]
  );

  useEffect(() => {
    if (!selectedGroup) {
      return;
    }

    selectedGroup.tickers.forEach((ticker) => {
      const key = getTickerKey(ticker);
      const state = tickerStates[key];
      if (!state || state.range !== range) {
        fetchTickerData(ticker, { range }).catch((error) => {
          console.error('Failed to load ticker data', error);
        });
      }
    });
  }, [fetchTickerData, range, selectedGroup, tickerStates]);

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
          await fetchTickerData(updated, { force: true });
        } else {
          const created = await createTicker(selectedGroupId, {
            symbol: trimmedSymbol,
            display: tickerForm.display,
            imageUrl: tickerForm.imageUrl,
            note: tickerForm.note,
          });
          toast.success(t.watchlist.notifications.tickerCreated);
          await fetchTickerData(created, { force: true });
        }

        setTickerDialogOpen(false);
        setTickerForm(createEmptyTickerForm());
      } catch (error) {
        console.error('Failed to save ticker', error);
        toast.error(t.watchlist.notifications.error);
      }
    },
    [createTicker, fetchTickerData, selectedGroupId, t.watchlist.notifications.error, t.watchlist.notifications.tickerCreated, t.watchlist.notifications.tickerUpdated, t.watchlist.tickers.errors.groupRequired, t.watchlist.tickers.errors.symbolRequired, tickerForm, updateTicker]
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
        await Promise.all(selectedGroup.tickers.map((ticker) => fetchTickerData(ticker, { force: true })));
      }
      await refresh();
      toast.success(t.watchlist.notifications.refreshed);
    } catch (error) {
      console.error('Failed to refresh watchlist', error);
      toast.error(t.watchlist.notifications.error);
    } finally {
      setRefreshingTickers(false);
    }
  }, [fetchTickerData, refresh, refreshingTickers, selectedGroup, t.watchlist.notifications.error, t.watchlist.notifications.refreshed]);

  const handleSelectGroup = useCallback(
    (groupId: string) => {
      selectGroup(groupId);
    },
    [selectGroup]
  );

  const tickerList = selectedGroup?.tickers ?? [];

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
      className: 'bg-white/70 text-slate-600',
      iconClassName: 'text-blue-500/80',
    },
  ] as const;

  const quickActions: DashboardQuickAction[] = useMemo(() => {
    const commonActions = createCommonQuickActions(t, {
      exclude: ['watchlist'],
      overrides: {
        reload: {
          onClick: handleRefreshAll,
          disabled: loading || refreshingTickers,
          iconClassName: refreshingTickers ? 'animate-spin' : undefined,
          label: t.watchlist.actions.refreshAll,
          ariaLabel: t.watchlist.actions.refreshAll,
          labelClassName: 'hidden sm:inline',
        },
      },
    });

    const reloadAction = commonActions.find((action) => action.key === 'reload');
    const otherCommonActions = commonActions.filter((action) => action.key !== 'reload');

    const watchlistActions: DashboardQuickAction[] = [
      {
        key: 'newGroup',
        icon: Plus,
        label: t.watchlist.actions.newGroup,
        onClick: openCreateGroupDialog,
        className: 'bg-[#1E3A8A] text-white shadow-sm hover:bg-[#1E40AF]',
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

    return [
      ...(reloadAction ? [reloadAction] : []),
      ...watchlistActions,
      ...otherCommonActions,
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

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-[#EEF5FF]"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#E4F1FF] via-[#F8FBFF] to-[#E3EEFF]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_60%)]" />
      <div className="relative">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <header className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/80 px-6 py-8 shadow-xl backdrop-blur-sm">
            <div className="pointer-events-none absolute -right-12 top-0 h-48 w-48 rounded-full bg-blue-200/60 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-6">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-blue-100 p-3 text-blue-600 shadow-inner">
                    <Eye className="h-6 w-6" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-[#0F172A] sm:text-4xl">{t.watchlist.title}</h1>
                    <p className="mt-2 max-w-xl text-base text-slate-600">{t.watchlist.subtitle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 sm:text-sm">
                  {metaBadges.map((badge) => {
                    const Icon = badge.icon;
                    return (
                      <span
                        key={badge.key}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-full px-3 py-1 shadow-sm',
                          badge.className
                        )}
                      >
                        <Icon className={cn('h-4 w-4', badge.iconClassName)} />
                        <span>{badge.label}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <QuickActionsSection title={t.watchlist.actionsTitle} actions={quickActions}>
                <p className="mt-4 text-xs text-slate-500">
                  {selectedGroupSummary ?? t.watchlist.status.empty}
                </p>
              </QuickActionsSection>
            </div>
          </header>

          <div
            className={cn(
              'mt-10 flex flex-col gap-8 lg:gap-10',
              isRtl ? 'lg:flex-row-reverse' : 'lg:flex-row'
            )}
          >
            <div className="lg:w-80 lg:flex-none">
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
              />
            </div>

            <div className="flex flex-1 flex-col gap-6">
              {watchlistError ? (
                <Alert
                  variant="destructive"
                  className="rounded-3xl border border-rose-200/70 bg-rose-50/80 px-6 py-5 text-rose-700 shadow-inner backdrop-blur-sm"
                >
                  <AlertTitle>{t.watchlist.status.errorTitle}</AlertTitle>
                  <AlertDescription className="mt-2 flex flex-wrap items-center gap-2 text-rose-600">
                    <span>{t.watchlist.status.error}</span>
                    <Button size="sm" variant="outline" onClick={handleRefreshAll} className="gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {t.watchlist.actions.retry}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {selectedGroup ? (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-white/60 bg-white/80 p-6 shadow-xl backdrop-blur-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <h2 className="text-2xl font-semibold text-slate-800">{selectedGroup.name}</h2>
                        {selectedGroup.description ? (
                          <p className="max-w-xl text-sm text-slate-500">{selectedGroup.description}</p>
                        ) : null}
                        <p className="text-xs font-medium text-slate-400">
                          {renderTickerCount(selectedGroup)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <TimeRangeTabs
                          value={range}
                          onChange={setRange}
                          labels={timeRangeLabels}
                          className="min-w-[220px] lg:min-w-[260px]"
                        />
                        <Button
                          size="sm"
                          onClick={openCreateTickerDialog}
                          className="gap-2 rounded-full bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]"
                        >
                          <Plus className="h-4 w-4" />
                          {t.watchlist.actions.newTicker}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {tickerList.length ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {tickerList.map((ticker) => {
                        const state = tickerStates[getTickerKey(ticker)];
                        return (
                          <TickerCard
                            key={ticker.id ?? ticker.symbol}
                            ticker={ticker}
                            quote={state?.quote}
                            historical={state?.historical}
                            range={range}
                            locale={locale}
                            loading={state?.loading}
                            error={state?.error}
                            onEdit={openEditTickerDialog}
                            onDelete={handleDeleteTicker}
                            onRefresh={(item) => fetchTickerData(item, { force: true })}
                            priceLabel={t.watchlist.labels.price}
                            changeLabel={t.watchlist.labels.change}
                            noteLabel={t.watchlist.labels.note}
                            emptySeriesLabel={t.watchlist.charts.empty}
                            errorLabel={t.watchlist.charts.error}
                            loadingLabel={chartLoadingMessage}
                            refreshLabel={t.watchlist.actions.refreshTicker}
                            editLabel={t.watchlist.actions.editTicker}
                            deleteLabel={t.watchlist.actions.deleteTicker}
                            className="border-white/60 bg-white/90 shadow-lg backdrop-blur-sm"
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-white/60 bg-white/60 p-10 text-center text-sm text-slate-500 shadow-inner backdrop-blur-sm">
                      <p>{t.watchlist.status.noTickers}</p>
                      <Button
                        onClick={openCreateTickerDialog}
                        className="gap-2 rounded-full bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]"
                      >
                        <Plus className="h-4 w-4" />
                        {t.watchlist.actions.newTicker}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-white/60 bg-white/60 p-12 text-center text-sm text-slate-500 shadow-inner backdrop-blur-sm">
                  <p>{t.watchlist.status.empty}</p>
                  <Button
                    onClick={openCreateGroupDialog}
                    className="gap-2 rounded-full bg-[#1E3A8A] text-white shadow-sm hover:bg-[#1E40AF]"
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
        <DialogContent>
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
        <DialogContent>
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
    </div>
  );
}
