'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUrlState } from '@/hooks/use-url-state';
import { parseWatchlistState } from '@/lib/list-url-state';
import type { PostgrestError } from '@supabase/supabase-js';

import { getSupabaseClient } from '@/lib/supabase';
import {
  mapWatchlistGroup,
  mapWatchlistTicker,
  normalizeWatchlistNullableText,
  sortWatchlistGroups,
  sortWatchlistTickers,
} from '@/lib/watchlist';
import type { WatchlistGroup, WatchlistTicker } from '@/types';

type NullableString = string | null | undefined;

export interface WatchlistGroupInput {
  name: string;
  description?: NullableString;
}

export interface WatchlistTickerInput {
  symbol: string;
  display?: NullableString;
  imageUrl?: NullableString;
  note?: NullableString;
  sortOrder?: number;
}

interface UseWatchlistState {
  groups: WatchlistGroup[];
  selectedGroupId: string | null;
  selectedGroup: WatchlistGroup | null;
  loading: boolean;
  refreshing: boolean;
  error: PostgrestError | null;
  selectGroup: (groupId: string) => void;
  refresh: () => Promise<void>;
  createGroup: (input: WatchlistGroupInput) => Promise<WatchlistGroup>;
  updateGroup: (groupId: string, input: WatchlistGroupInput) => Promise<WatchlistGroup>;
  deleteGroup: (groupId: string) => Promise<void>;
  createTicker: (groupId: string, input: WatchlistTickerInput) => Promise<WatchlistTicker>;
  updateTicker: (tickerId: string, input: WatchlistTickerInput) => Promise<WatchlistTicker>;
  deleteTicker: (tickerId: string) => Promise<void>;
  reorderTickers: (groupId: string, tickers: WatchlistTicker[]) => Promise<void>;
}

const GROUP_SELECT = `
  id,
  name,
  description,
  created_at,
  updated_at,
  watchlist_tickers (
    id,
    group_id,
    symbol,
    display,
    image_url,
    note,
    sort_order,
    created_at,
    updated_at
  )
`;

export function useWatchlist(): UseWatchlistState {
  const [groups, setGroups] = useState<WatchlistGroup[]>([]);
  const [{ group: selectedGroupId }, patchUrl] = useUrlState(parseWatchlistState);
  const groupRef = useRef(selectedGroupId);
  groupRef.current = selectedGroupId;
  const setSelectedGroupId = useCallback((value: string | null | ((previous: string | null) => string | null)) => {
    const next = typeof value === 'function' ? value(groupRef.current) : value;
    groupRef.current = next;
    patchUrl({ group: next });
  }, [patchUrl]);
  const requestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<PostgrestError | null>(null);

  const loadGroups = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setRefreshing(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error: queryError } = await supabase
        .from('watchlist_groups')
        .select(GROUP_SELECT)
        .order('name', { ascending: true })
        .order('sort_order', { foreignTable: 'watchlist_tickers', ascending: true })
        .order('created_at', { foreignTable: 'watchlist_tickers', ascending: true });

      if (queryError) {
        throw queryError;
      }

      if (requestId !== requestIdRef.current) return;
      const mapped = (data ?? []).map(mapWatchlistGroup);
      const sorted = sortWatchlistGroups(mapped);
      setGroups(sorted);
      setError(null);

      if (sorted.length === 0) {
        setSelectedGroupId(null);
        return;
      }

      setSelectedGroupId((current) => {
        if (!current) {
          return sorted[0]?.id ?? null;
        }

        const stillExists = sorted.some((group) => group.id === current);
        return stillExists ? current : sorted[0]?.id ?? null;
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Failed to load watchlist groups:', err);
      setError(err as PostgrestError);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [setSelectedGroupId]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) {
      return null;
    }
    return groups.find((group) => group.id === selectedGroupId) ?? null;
  }, [groups, selectedGroupId]);

  const selectGroup = useCallback((groupId: string) => {
    setSelectedGroupId(groupId);
  }, [setSelectedGroupId]);

  const createGroup = useCallback<UseWatchlistState['createGroup']>(
    async (input) => {
      const payload = {
        name: input.name.trim(),
        description: normalizeWatchlistNullableText(input.description),
      };

      const supabase = getSupabaseClient();
      const { data, error: insertError } = await supabase
        .from('watchlist_groups')
        .insert(payload)
        .select(GROUP_SELECT)
        .single();

      if (insertError) {
        throw insertError;
      }

      const mapped = mapWatchlistGroup(data);
      setGroups((prev) => sortWatchlistGroups([...prev, mapped]));
      setSelectedGroupId(mapped.id ?? null);
      return mapped;
    },
    [setSelectedGroupId]
  );

  const updateGroup = useCallback<UseWatchlistState['updateGroup']>(
    async (groupId, input) => {
      const payload = {
        name: input.name.trim(),
        description: normalizeWatchlistNullableText(input.description),
      };

      const supabase = getSupabaseClient();
      const { data, error: updateError } = await supabase
        .from('watchlist_groups')
        .update(payload)
        .eq('id', groupId)
        .select(GROUP_SELECT)
        .single();

      if (updateError) {
        throw updateError;
      }

      const mapped = mapWatchlistGroup(data);
      setGroups((prev) => {
        const next = prev.map((group) => (group.id === groupId ? mapped : group));
        return sortWatchlistGroups(next);
      });
      return mapped;
    },
    []
  );

  const deleteGroup = useCallback<UseWatchlistState['deleteGroup']>(async (groupId) => {
    const supabase = getSupabaseClient();
    const { error: deleteError } = await supabase.from('watchlist_groups').delete().eq('id', groupId);

    if (deleteError) {
      throw deleteError;
    }

    setGroups((prev) => prev.filter((group) => group.id !== groupId));
    setSelectedGroupId((current) => current === groupId ? groups.find((group) => group.id !== groupId)?.id ?? null : current);
  }, [groups, setSelectedGroupId]);

  const createTicker = useCallback<UseWatchlistState['createTicker']>(
    async (groupId, input) => {
      const group = groups.find((item) => item.id === groupId);
      const nextSortOrder = input.sortOrder ?? (group?.tickers.length ?? 0);

      const payload = {
        group_id: groupId,
        symbol: input.symbol.trim().toUpperCase(),
        display: normalizeWatchlistNullableText(input.display),
        image_url: normalizeWatchlistNullableText(input.imageUrl),
        note: normalizeWatchlistNullableText(input.note),
        sort_order: nextSortOrder,
      };

      const supabase = getSupabaseClient();
      const { data, error: insertError } = await supabase
        .from('watchlist_tickers')
        .insert(payload)
        .select(
          `id, group_id, symbol, display, image_url, note, sort_order, created_at, updated_at`
        )
        .single();

      if (insertError) {
        throw insertError;
      }

      const mapped = mapWatchlistTicker(data);
      setGroups((prev) =>
        prev.map((item) =>
          item.id === groupId
            ? { ...item, tickers: sortWatchlistTickers([...item.tickers, mapped]) }
            : item
        )
      );

      return mapped;
    },
    [groups]
  );

  const updateTicker = useCallback<UseWatchlistState['updateTicker']>(
    async (tickerId, input) => {
      const payload = {
        symbol: input.symbol.trim().toUpperCase(),
        display: normalizeWatchlistNullableText(input.display),
        image_url: normalizeWatchlistNullableText(input.imageUrl),
        note: normalizeWatchlistNullableText(input.note),
        sort_order: typeof input.sortOrder === 'number' ? input.sortOrder : undefined,
      };

      const supabase = getSupabaseClient();
      const { data, error: updateError } = await supabase
        .from('watchlist_tickers')
        .update(payload)
        .eq('id', tickerId)
        .select(
          `id, group_id, symbol, display, image_url, note, sort_order, created_at, updated_at`
        )
        .single();

      if (updateError) {
        throw updateError;
      }

      const mapped = mapWatchlistTicker(data);
      setGroups((prev) =>
        prev.map((group) => {
          if (group.id !== mapped.groupId) {
            return group;
          }
          const nextTickers = group.tickers.map((ticker) => (ticker.id === tickerId ? mapped : ticker));
          return { ...group, tickers: sortWatchlistTickers(nextTickers) };
        })
      );

      return mapped;
    },
    []
  );

  const deleteTicker = useCallback<UseWatchlistState['deleteTicker']>(async (tickerId) => {
    const supabase = getSupabaseClient();
    const { error: deleteError } = await supabase.from('watchlist_tickers').delete().eq('id', tickerId);

    if (deleteError) {
      throw deleteError;
    }

    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        tickers: group.tickers.filter((ticker) => ticker.id !== tickerId),
      }))
    );
  }, []);

  const reorderTickers = useCallback<UseWatchlistState['reorderTickers']>(
    async (groupId, tickers) => {
      if (!groupId) {
        return;
      }

      const normalizedTickers = tickers.map((ticker, index) => ({
        ...ticker,
        sortOrder: index,
      }));

      setGroups((prev) =>
        prev.map((group) => (group.id === groupId ? { ...group, tickers: normalizedTickers } : group))
      );

      const updates = normalizedTickers
        .map((ticker) =>
          ticker.id
            ? {
                id: ticker.id,
                sort_order: ticker.sortOrder ?? 0,
              }
            : null
        )
        .filter((value): value is { id: string; sort_order: number } => value !== null);

      try {
        if (updates.length > 0) {
          const supabase = getSupabaseClient();
          const { error: updateError } = await supabase
            .from('watchlist_tickers')
            .upsert(updates, { onConflict: 'id' });

          if (updateError) {
            throw updateError;
          }
        }
      } catch (error) {
        await loadGroups();
        throw error;
      }

      await loadGroups();
    },
    [loadGroups]
  );

  return {
    groups,
    selectedGroupId,
    selectedGroup,
    loading,
    refreshing,
    error,
    selectGroup,
    refresh: loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    createTicker,
    updateTicker,
    deleteTicker,
    reorderTickers,
  };
}
