'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CalendarDays, Eye, GripVertical, Plus, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { WatchlistGroupSelector } from '@/components/watchlist/watchlist-group-selector';
import { TimeRangeTabs } from '@/components/watchlist/time-range-tabs';
import { TickerRow, WATCHLIST_ROW_COLUMNS } from '@/components/watchlist/ticker-row';
import { TickerCard, type TickerCardProps } from '@/components/watchlist/ticker-card';
import { Button } from '@/components/ui/button';
import { DashboardRouteShell } from '@/components/dashboard/dashboard-route-shell';
import { PageHeader } from '@/components/dashboard/page-header';
import { DashboardContainer } from '@/components/dashboard/page-primitives';
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
import { formatDate, mapCandleDataToPoints } from '@/lib/calculations';
import { cn } from '@/lib/utils';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useUrlState } from '@/hooks/use-url-state';
import { useReturnContext } from '@/hooks/use-return-context';
import { localDateParam, parseWatchlistState } from '@/lib/list-url-state';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { isNasdaqTradingHours } from '@/lib/utils/trading-hours';
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
  from: number | null;
  requestedRange: TimeRange;
  requestedFrom: number;
  lastUpdated: number | null;
}

const TICKER_CACHE_PREFIX = 'watchlist:ticker:';

interface TickerCacheEntry {
  quote: StockQuote | null;
  historical: HistoricalPoint[];
  error: string | null;
  storedAt: number;
  expiresAt: number;
  range: TimeRange;
  from: number;
  resolution: string;
}

function getTickerCacheStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch (error) {
    console.warn('Ticker cache unavailable:', error);
    return null;
  }
}

function buildTickerCacheKey(
  tickerKey: string,
  range: TimeRange,
  from: number,
  resolution: string
) {
  return `${TICKER_CACHE_PREFIX}${tickerKey}::${range}::${from}::${resolution}`;
}

function readTickerCache(key: string): TickerCacheEntry | null {
  const storage = getTickerCacheStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as TickerCacheEntry | null;
    if (!parsed || typeof parsed !== 'object') {
      storage.removeItem(key);
      return null;
    }

    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) {
      storage.removeItem(key);
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to read ticker cache entry', error);
    storage.removeItem(key);
    return null;
  }
}

function writeTickerCache(key: string, entry: TickerCacheEntry) {
  const storage = getTickerCacheStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn('Failed to write ticker cache entry', error);
  }
}

function getTickerCacheTtlMs(date: Date = new Date()): number {
  return isNasdaqTradingHours(date) ? 3 * 60 * 1000 : 60 * 60 * 1000;
}

function createEmptyGroupForm(): GroupFormState {
  return { id: null, name: '', description: '' };
}

function createEmptyTickerForm(): TickerFormState {
  return { id: null, symbol: '', display: '', imageUrl: '', note: '' };
}

function determineResolution(fromSeconds: number, toSeconds: number): string {
  const day = 24 * 60 * 60;
  const secondsRange = Math.max(toSeconds - fromSeconds, day);
  const days = secondsRange / day;

  if (days <= 3) {
    return '15';
  }

  if (days <= 10) {
    return '30';
  }

  if (days <= 45) {
    return '60';
  }

  if (days <= 180) {
    return 'D';
  }

  if (days <= 365 * 3) {
    return 'W';
  }

  return 'M';
}

function getRangeParams(range: TimeRange, startDate?: Date | null): { from: number; resolution: string } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;

  if (startDate instanceof Date && !Number.isNaN(startDate.getTime())) {
    const rawFrom = Math.floor(startDate.getTime() / 1000);
    const maxFrom = Math.max(nowSeconds - 60, 0);
    const minFrom = nowSeconds - day * 365 * 10;
    const normalizedFrom = Math.min(rawFrom, maxFrom);
    const effectiveFrom = Math.max(normalizedFrom, minFrom);
    const resolution = determineResolution(effectiveFrom, nowSeconds);
    return { from: effectiveFrom, resolution };
  }

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

interface SortableTickerCardProps {
  id: string;
  isActive: boolean;
  disabled?: boolean;
  sorting: boolean;
  symbol: string;
  locale: 'he' | 'en';
  children: ReactNode;
}

function SortableTickerCard({ id, isActive, disabled = false, sorting, symbol, locale, children }: SortableTickerCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: disabled || !sorting });
  const style: CSSProperties = { transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition };
  return <div ref={setNodeRef} style={style} role="group" aria-roledescription={sorting ? 'sortable' : undefined} className={cn('relative flex min-w-0 items-center border-b border-slate-100 last:border-b-0', isDragging && 'z-30 bg-white shadow-lg', isActive && 'ring-2 ring-inset ring-blue-300')}>
    {sorting ? <button type="button" {...attributes} {...listeners} disabled={disabled} aria-label={`${locale === 'he' ? 'הזזת' : 'Reorder'} ${symbol}`} className="ms-2 flex h-11 w-7 shrink-0 touch-none items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500"><GripVertical aria-hidden className="h-4 w-4" /></button> : null}
    <div className="min-w-0 flex-1">{children}</div>
  </div>;
}

function parseWatchlistView(params: URLSearchParams) {
  return { ...parseWatchlistState(params), search: (params.get('q') ?? '').slice(0, 200), stock: (params.get('stock') ?? '').slice(0, 200) };
}

const WIDE_WATCHLIST = '(min-width: 1280px)';
const getWideSnapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(WIDE_WATCHLIST).matches;
const subscribeWide = (notify: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(WIDE_WATCHLIST);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const getServerWideSnapshot = () => false;

export default function WatchlistPage() {
  const { locale, settings } = useApp();
  const { t } = useTranslation(locale);
  const isRtl = locale === 'he';
  const isWide = useSyncExternalStore(subscribeWide, getWideSnapshot, getServerWideSnapshot);

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

  const [{ range, customStartDate, search, stock }, patchUrl, sourceUrl] = useUrlState(parseWatchlistView);
  const setCustomStartDate = useCallback((date: Date | null) => patchUrl({ from: localDateParam(date) }), [patchUrl]);
  const requests = useRef(new Map<string, { identity: string; controller: AbortController }>());
  useReturnContext(!loading && Boolean(selectedGroup));
  useEffect(() => () => { requests.current.forEach((request) => request.controller.abort()); }, []);
  const formFocusRef = useRef<HTMLElement | null>(null);
  const restoreFormFocus = (event: Event) => { event.preventDefault(); formFocusRef.current?.focus(); };
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
  const [sorting, setSorting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewTransitionRef = useRef(false);
  const previewContentRef = useRef<HTMLDivElement>(null);
  const normalizedSearch = search.trim().toLocaleLowerCase(locale);
  const visibleTickers = useMemo(() => normalizedSearch
    ? sortableTickers.filter((ticker) => `${ticker.symbol} ${ticker.display ?? ''}`.toLocaleLowerCase(locale).includes(normalizedSearch))
    : sortableTickers, [sortableTickers, normalizedSearch, locale]);
  const focusedTicker = visibleTickers.find((ticker) => getTickerKey(ticker) === stock) ?? visibleTickers[0] ?? null;
  const focusedState = focusedTicker ? tickerStates[getTickerKey(focusedTicker)] : undefined;
  const focusedKey = focusedTicker ? `${getTickerKey(focusedTicker)}:${focusedState?.range}:${focusedState?.from}:${focusedState?.lastUpdated}` : 'empty';
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(WIDE_WATCHLIST);
    const close = () => { if (media.matches) setPreviewOpen(false); };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, []);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );


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
    patchUrl({ range: nextRange, from: null });
  }, [patchUrl]);

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
  }, [setCustomStartDate]);

  const handleResetStartDate = useCallback(() => {
    setCustomStartDate(null);
  }, [setCustomStartDate]);


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
      options?: { range?: TimeRange; force?: boolean; startDate?: Date | null }
    ) => {
      const targetRange = options?.range ?? range;
      const startDateForFetch = options?.startDate ?? effectiveStartDate;
      const { from, resolution } = getRangeParams(targetRange, startDateForFetch);
      const key = getTickerKey(ticker);
      const cacheKey = buildTickerCacheKey(key, targetRange, from, resolution);
      const previousRequest = requests.current.get(key);
      if (!options?.force && previousRequest?.identity === cacheKey) return;
      previousRequest?.controller.abort();
      const controller = new AbortController();
      const request = { identity: cacheKey, controller };
      requests.current.set(key, request);
      const isCurrent = () => requests.current.get(key) === request && !controller.signal.aborted;

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
              requestedRange: targetRange,
              requestedFrom: from,
              lastUpdated:
                typeof cached.storedAt === 'number' ? cached.storedAt : Date.now(),
            },
          }));
          requests.current.delete(key);
          return;
        }
      }

      setTickerStates((prev) => {
        const existing = prev[key];
        return {
          ...prev,
          [key]: {
            quote: existing?.quote ?? null,
            historical: existing?.historical ?? [],
            loading: true,
            error: null,
            range: existing?.range ?? targetRange,
            from: existing?.from ?? from,
            requestedRange: targetRange,
            requestedFrom: from,
            lastUpdated: existing?.lastUpdated ?? null,
          },
        };
      });

      try {
        const symbol = ticker.symbol.toUpperCase();
        const nowSeconds = Math.floor(Date.now() / 1000);

        const quoteParams = new URLSearchParams({ symbol });
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
          fetch(`/api/quote?${quoteParams.toString()}`, { signal: controller.signal }),
          fetch(`/api/candles?${candlesParams.toString()}`, { signal: controller.signal }),
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
        let errorMessage: string | null = quoteResponse.ok ? null : chartErrorMessage;

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

        if (!isCurrent()) return;
        if (errorMessage) throw new Error(errorMessage);
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
            requestedRange: targetRange,
            requestedFrom: from,
            lastUpdated: fetchedAt,
          },
        }));
      } catch (error) {
        if (!isCurrent()) return;
        console.error('Failed to load ticker data', error);
        setTickerStates((prev) => ({
          ...prev,
          [key]: {
            quote: prev[key]?.quote ?? null,
            historical: prev[key]?.historical ?? [],
            loading: false,
            error: chartErrorMessage,
            range: prev[key]?.range ?? targetRange,
            from: prev[key]?.from ?? from,
            requestedRange: targetRange,
            requestedFrom: from,
            lastUpdated: prev[key]?.lastUpdated ?? null,
          },
        }));
      } finally {
        if (requests.current.get(key) === request) requests.current.delete(key);
      }
    },
    [chartErrorMessage, effectiveStartDate, range]
  );

  useEffect(() => {
    if (!selectedGroup) {
      return;
    }

    selectedGroup.tickers.forEach((ticker) => {
      const key = getTickerKey(ticker);
      const state = tickerStates[key];
      const shouldLoad =
        !state ||
        state.requestedRange !== range ||
        state.requestedFrom !== effectiveFromSeconds;

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

  const timeRangeLabels = useMemo(() => ({ ...t.watchlist.timeRange, All: locale === 'he' ? 'הכל' : 'All' }), [t.watchlist.timeRange, locale]);

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
    formFocusRef.current = document.getElementById('watchlist-new-group');
    setGroupForm(createEmptyGroupForm());
    setGroupDialogOpen(true);
  }, []);

  const openEditGroupDialog = useCallback((group: WatchlistGroupType) => {
    formFocusRef.current = document.getElementById(`watchlist-group-menu-${group.id}`);
    setGroupForm({
      id: group.id ?? null,
      name: group.name,
      description: group.description ?? '',
    });
    setGroupDialogOpen(true);
  }, []);

  const openCreateTickerDialog = useCallback(() => {
    formFocusRef.current = document.getElementById('watchlist-add-stock');
    setTickerForm(createEmptyTickerForm());
    setTickerDialogOpen(true);
  }, []);

  const openEditTickerDialog = useCallback((ticker: WatchlistTickerType) => {
    formFocusRef.current = document.getElementById(`watchlist-select-${getTickerKey(ticker)}`);
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
      setPreviewOpen(false);
      setSorting(false);
      patchUrl({ stock: null });
      selectGroup(groupId);
    },
    [selectGroup, patchUrl]
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
      if (normalizedSearch || !over || active.id === over.id) {
        return;
      }

      const oldIndex = sortableTickers.findIndex((ticker) => getTickerKey(ticker) === active.id);
      const newIndex = sortableTickers.findIndex((ticker) => getTickerKey(ticker) === over.id);

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
      normalizedSearch,
      selectedGroup,
      sortableTickers,
      t.watchlist.notifications.error,
      t.watchlist.notifications.orderUpdated,
    ]
  );

  const selectTicker = (ticker: WatchlistTickerType) => {
    patchUrl({ stock: getTickerKey(ticker) });
    if (!isWide) setPreviewOpen(true);
  };
  const presentationProps = (ticker: WatchlistTickerType): TickerCardProps => {
    const state = tickerStates[getTickerKey(ticker)];
    const historical = state?.historical ?? [];
    const first = historical[0];
    const last = historical[historical.length - 1];
    const quotePrice = state?.quote?.c;
    return {
      ticker, quote: state?.quote, historical, range: state?.range ?? range,
      returnTo: sourceUrl || '/watchlist', lastUpdated: state?.lastUpdated, locale,
      loading: state?.loading ?? loading, error: state?.error,
      onEdit: (item) => { previewTransitionRef.current = previewOpen; setPreviewOpen(false); openEditTickerDialog(item); },
      onDelete: handleDeleteTicker,
      onRefresh: (item) => { void fetchTickerData(item, { force: true, startDate: effectiveStartDate }); },
      priceLabel: t.watchlist.labels.price, changeLabel: isRtl ? 'שינוי בטווח' : 'Period change',
      noteLabel: t.watchlist.labels.note, emptySeriesLabel: t.watchlist.charts.empty,
      errorLabel: t.watchlist.charts.error, loadingLabel: chartLoadingMessage,
      refreshLabel: t.watchlist.actions.refreshTicker, editLabel: t.watchlist.actions.editTicker,
      deleteLabel: t.watchlist.actions.deleteTicker,
      basePrice: first && Number.isFinite(first.close) ? first.close : null,
      baseDate: first && Number.isFinite(first.timestamp) ? new Date(first.timestamp) : state?.from ? new Date(state.from * 1000) : null,
      currentPrice: typeof quotePrice === 'number' && Number.isFinite(quotePrice) ? quotePrice : last && Number.isFinite(last.close) ? last.close : null,
      basePriceLabel: t.watchlist.labels.basePrice, hoverLabel: t.watchlist.labels.hover, startDateLabel: t.watchlist.labels.startDate,
    };
  };

  return (
    <DashboardRouteShell activeKey="watchlist" locale={locale}>
      <DashboardContainer>
        <PageHeader className="[&_h1]:text-[32px] sm:[&_h1]:text-[40px]" title={isRtl ? 'המעקב שלי' : 'My watchlist'} subtitle={isRtl ? 'המניות שמעניינות אותך, במקום אחד.' : 'The stocks on your radar, in one place.'} icon={Eye}
          actions={<div className="flex items-center gap-2"><Button id="watchlist-add-stock" onClick={openCreateTickerDialog} disabled={!selectedGroup || loading} className="rounded-xl px-5"><Plus aria-hidden />{t.watchlist.actions.newTicker}</Button><Button variant="outline" size="icon" aria-label={t.watchlist.actions.refreshAll} title={t.watchlist.actions.refreshAll} disabled={loading || refreshingTickers || refreshing} onClick={handleRefreshAll} className="rounded-xl bg-white"><RefreshCw aria-hidden className={cn('h-4 w-4', (refreshingTickers || refreshing) && 'animate-spin')} /></Button></div>} />
        <main className="mt-5 space-y-5">
          <WatchlistGroupSelector groups={groups} selectedGroupId={selectedGroupId} onSelect={handleSelectGroup} onCreate={openCreateGroupDialog} onEdit={openEditGroupDialog} onDelete={handleDeleteGroup} isLoading={loading} isRefreshing={refreshing} title={t.watchlist.groups.title} addLabel={t.watchlist.actions.newGroup} emptyStateText={t.watchlist.groups.empty} loadingText={t.watchlist.groups.loading} renderTickerCount={renderTickerCount} editLabel={t.watchlist.actions.editGroup} deleteLabel={t.watchlist.actions.deleteGroup} />
          {watchlistError ? <Alert variant="destructive" className="rounded-xl border-amber-200 bg-amber-50 text-amber-900"><AlertTitle>{t.watchlist.status.errorTitle}</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{t.watchlist.status.error}</span><Button variant="outline" onClick={handleRefreshAll}>{t.watchlist.actions.retry}</Button></AlertDescription></Alert> : null}
          {loading && !selectedGroup ? <div aria-busy="true" className="min-h-[500px] animate-pulse rounded-2xl border border-slate-200 bg-white motion-reduce:animate-none"><p role="status" className="p-8 text-center text-sm text-slate-500">{t.watchlist.groups.loading}</p></div> : selectedGroup ? <section aria-label={isRtl ? 'מרחב המעקב' : 'Watchlist workspace'} className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-4 border-b border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><h2 className="text-sm font-semibold text-slate-900">{isRtl ? 'טווח ההשוואה' : 'Comparison period'}</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">{isRtl ? 'השינוי והגרפים בכל המניות לפי הטווח שבחרת' : 'Changes and charts across all stocks use this period'}</p></div>
              <div className="relative w-full sm:max-w-[280px]"><Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input type="search" aria-label={isRtl ? 'חיפוש מניה בקבוצה' : 'Search stocks in group'} placeholder={isRtl ? 'חיפוש מניה' : 'Find a stock'} value={search} onChange={(event) => patchUrl({ q: event.target.value })} className="rounded-xl border-slate-200 bg-white shadow-none ps-9 pe-10 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none" />{search ? <button type="button" aria-label={isRtl ? 'ניקוי החיפוש' : 'Clear search'} onClick={() => patchUrl({ q: null })} className="absolute end-0 top-0 flex h-11 w-10 items-center justify-center text-slate-400 hover:text-slate-800"><X aria-hidden className="h-4 w-4" /></button> : null}</div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3"><TimeRangeTabs dir={isRtl ? 'rtl' : 'ltr'} value={range} onChange={handleRangeChange} labels={timeRangeLabels} className="min-w-0 flex-1" /><Popover open={startDatePopoverOpen} onOpenChange={setStartDatePopoverOpen}><PopoverTrigger asChild><Button variant="outline" aria-label={isRtl ? 'בחירת תאריך התחלה' : 'Choose start date'} title={isRtl ? 'בחירת תאריך התחלה' : 'Choose start date'} className={cn('h-[52px] shrink-0 gap-2 rounded-xl border-slate-200 bg-white px-3 text-slate-600 shadow-none', hasCustomStartDate && 'border-blue-300 bg-blue-50 text-blue-700')}><CalendarDays aria-hidden className="h-4 w-4" /><span className="hidden text-xs font-medium sm:inline">{isRtl ? 'תאריך התחלה' : 'Start date'}</span></Button></PopoverTrigger><PopoverContent align={isRtl ? 'end' : 'start'} className="w-auto rounded-xl bg-white p-4"><p className="mb-3 text-sm font-medium text-slate-800">{t.watchlist.filters.startDateDescription}</p><Calendar mode="single" selected={customStartDate ?? effectiveStartDate} defaultMonth={customStartDate ?? effectiveStartDate} onSelect={(date) => { if (date) { handleStartDateChange(date); setStartDatePopoverOpen(false); } }} toDate={maxSelectableDate} fromDate={minSelectableDate} initialFocus /><Button variant="ghost" className="mt-2 w-full text-blue-700" onClick={() => { handleResetStartDate(); setStartDatePopoverOpen(false); }}>{t.watchlist.filters.resetStartDate}</Button></PopoverContent></Popover></div>
            </div>
            {hasCustomStartDate ? <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-blue-50/50 px-5 py-2 text-xs text-slate-600"><span>{t.watchlist.filters.summary(formattedStartDate)}</span><Button variant="ghost" size="sm" onClick={handleResetStartDate} className="text-blue-700">{t.watchlist.filters.resetStartDate}</Button></div> : null}
            <div className="grid min-w-0 xl:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
              <div className="flex min-h-[430px] min-w-0 flex-col xl:min-h-[650px]">
                <div className="px-4 pb-4 pt-5 sm:px-5"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-950 sm:text-xl">{isRtl ? 'מניות במעקב' : 'Stocks on your radar'}</h2><span dir="ltr" className="text-xs text-slate-400">{visibleTickers.length} / {sortableTickers.length}</span></div><p className="mt-1 text-xs text-slate-500">{isRtl ? 'בחרו מניה לצפייה בגרף.' : 'Choose a stock to explore its chart.'}</p></div>
                {visibleTickers.length ? <>
                  <div className="hidden items-center gap-2 border-b border-slate-100 px-4 pb-3 text-xs font-medium text-slate-500 sm:flex"><div className="grid min-w-0 flex-1 gap-2" style={{gridTemplateColumns:WATCHLIST_ROW_COLUMNS}}>{[isRtl ? 'מניה' : 'Stock', isRtl ? 'מחיר' : 'Price', isRtl ? 'יומי' : 'Today', isRtl ? 'בטווח' : 'Period', isRtl ? 'מגמה' : 'Trend'].map((label, index) => <span key={label} className={index ? 'text-end' : undefined}>{label}</span>)}</div><span className="w-10 shrink-0" /></div>
                  <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}><SortableContext items={visibleTickers.map(getTickerKey)} strategy={verticalListSortingStrategy}>{visibleTickers.map((ticker) => <SortableTickerCard key={getTickerKey(ticker)} id={getTickerKey(ticker)} symbol={ticker.symbol} locale={locale} sorting={sorting} disabled={Boolean(normalizedSearch)} isActive={activeTickerId === getTickerKey(ticker)}><TickerRow {...presentationProps(ticker)} selected={getTickerKey(focusedTicker ?? ticker) === getTickerKey(ticker)} onSelect={() => selectTicker(ticker)} /></SortableTickerCard>)}</SortableContext></DndContext>
                </> : <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-14 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-400"><Search aria-hidden className="h-5 w-5" /></div><p className="text-sm text-slate-500">{normalizedSearch ? isRtl ? 'לא נמצאו מניות שמתאימות לחיפוש.' : 'No stocks match your search.' : t.watchlist.status.noTickers}</p><Button variant={normalizedSearch ? 'outline' : 'default'} onClick={() => normalizedSearch ? patchUrl({ q: null }) : openCreateTickerDialog()}>{normalizedSearch ? isRtl ? 'ניקוי החיפוש' : 'Clear search' : t.watchlist.actions.newTicker}</Button></div>}
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3"><p role="status" className="text-xs text-slate-400">{normalizedSearch ? isRtl ? `${visibleTickers.length} מתוך ${sortableTickers.length} מניות · הסדר נשמר בזמן חיפוש` : `${visibleTickers.length} of ${sortableTickers.length} stocks · Reordering paused during search` : selectedGroup.description || ''}</p><Button variant="ghost" size="sm" disabled={Boolean(normalizedSearch) || sortableTickers.length < 2} aria-pressed={sorting} onClick={() => setSorting((value) => !value)} className="gap-2 text-slate-500"><GripVertical aria-hidden className="h-4 w-4" />{sorting ? isRtl ? 'סיום סידור' : 'Done reordering' : isRtl ? 'סידור הרשימה' : 'Reorder list'}</Button></div>
              </div>
              <aside aria-label={isRtl ? 'המניה שנבחרה' : 'Selected stock'} className="hidden min-w-0 border-s border-slate-200 xl:block">{isWide && focusedTicker ? <TickerCard key={focusedKey} {...presentationProps(focusedTicker)} /> : <div className="flex h-full min-h-[400px] items-center justify-center p-8 text-center text-sm text-slate-400">{isRtl ? 'הגרף של המניה שתבחרו יופיע כאן.' : 'Your selected stock’s chart will appear here.'}</div>}</aside>
            </div>
          </section> : <div className="flex min-h-[430px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><Eye aria-hidden className="h-8 w-8 text-blue-500" /><h2 className="text-xl font-semibold text-slate-950">{isRtl ? 'מקום למניות שמעניינות אותך' : 'A home for stocks on your radar'}</h2><p className="max-w-sm text-sm text-slate-500">{isRtl ? 'צרו קבוצה ראשונה והוסיפו מניות כדי להתחיל לעקוב.' : 'Create your first group and add stocks to start following them.'}</p><Button onClick={openCreateGroupDialog}><Plus aria-hidden />{t.watchlist.actions.newGroup}</Button></div>}
        </main>
      </DashboardContainer>
      <Dialog open={!isWide && previewOpen && Boolean(focusedTicker)} onOpenChange={setPreviewOpen}>
        <DialogContent ref={previewContentRef} onOpenAutoFocus={(event) => { event.preventDefault(); const close = previewContentRef.current?.querySelector<HTMLButtonElement>(':scope > button:last-child'); close?.setAttribute('aria-label', isRtl ? 'סגירה' : 'Close'); close?.focus(); }} dir={isRtl ? 'rtl' : 'ltr'} onCloseAutoFocus={(event) => { event.preventDefault(); if (!previewTransitionRef.current && focusedTicker) document.getElementById(`watchlist-select-${getTickerKey(focusedTicker)}`)?.focus(); previewTransitionRef.current = false; }} className="left-0 top-auto bottom-0 max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-t-3xl border-slate-200 bg-white p-0 pt-4 [&>button:last-child]:left-4 [&>button:last-child]:right-auto [&>button:last-child]:top-1 [&>button:last-child]:rounded-full [&>button:last-child]:focus:ring-blue-500 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:max-w-[620px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <DialogHeader className="sr-only"><DialogTitle>{focusedTicker ? `${isRtl ? 'גרף' : 'Chart'} ${focusedTicker.symbol}` : isRtl ? 'גרף מניה' : 'Stock chart'}</DialogTitle><DialogDescription>{isRtl ? 'מחיר המניה, השינוי והגרף בטווח שנבחר.' : 'Stock price, performance and chart for the selected period.'}</DialogDescription></DialogHeader>
          {!isWide && previewOpen && focusedTicker ? <TickerCard key={focusedKey} {...presentationProps(focusedTicker)} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={groupDialogOpen} onOpenChange={handleGroupDialogChange}>
        <DialogContent onCloseAutoFocus={restoreFormFocus} dir={isRtl ? 'rtl' : 'ltr'} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl sm:w-[calc(100%_-_2rem)] sm:rounded-3xl border-slate-200 bg-white p-5 sm:p-7">
          <DialogHeader className="text-start sm:text-start">
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
        <DialogContent onCloseAutoFocus={restoreFormFocus} dir={isRtl ? 'rtl' : 'ltr'} className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl sm:w-[calc(100%_-_2rem)] sm:rounded-3xl border-slate-200 bg-white p-5 sm:p-7">
          <DialogHeader className="text-start sm:text-start">
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
                  dir="ltr"
                  autoComplete="off"
                  className="h-12 rounded-xl font-semibold tracking-wide"
                  value={tickerForm.symbol}
                  onChange={(event) =>
                    setTickerForm((prev) => ({ ...prev, symbol: event.target.value.toUpperCase() }))
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
              <details className="space-y-2 md:col-span-2"><summary className="cursor-pointer text-xs text-slate-400">{isRtl ? 'לוגו מותאם אישית (אופציונלי)' : 'Custom logo (optional)'}</summary>
                <Label htmlFor="ticker-image">{t.watchlist.tickers.imageUrl}</Label>
                <Input
                  id="ticker-image"
                  value={tickerForm.imageUrl}
                  onChange={(event) =>
                    setTickerForm((prev) => ({ ...prev, imageUrl: event.target.value }))
                  }
                  placeholder={t.watchlist.tickers.imageUrlPlaceholder}
                />
              </details>
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
    </DashboardRouteShell>
  );
}
