'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isNasdaqTradingHours } from '@/lib/utils/trading-hours';
import type { StockQuote, WatchlistTicker } from '@/types';

interface QuoteEntry {
  quote?: StockQuote;
  updated?: number;
  error?: boolean;
}

export function useWatchlistQuotes(tickers: WatchlistTicker[] | undefined) {
  const [quotes, setQuotes] = useState<Record<string, QuoteEntry>>({});
  const cache = useRef<Record<string, QuoteEntry>>({});
  const generations = useRef(new Map<string, number>());
  const storageKeys = useRef(new Map<string, string>());
  useEffect(() => {
    const keys = new Map<string, string>();
    let restored = false;
    for (const ticker of tickers ?? []) {
      const symbol = ticker.symbol.trim().toUpperCase();
      if (!ticker.id) continue;
      const key = `watchlist:quote:${ticker.id}:${symbol}`;
      keys.set(symbol, key);
      if (cache.current[symbol]) continue;
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as QuoteEntry | null;
        if (saved?.quote && Number.isFinite(saved.quote.c) && saved.quote.c > 0 && Number.isFinite(saved.updated)) {
          cache.current[symbol] = saved;
          restored = true;
        }
      } catch { /* Market data can still be loaded when browser storage is unavailable. */ }
    }
    storageKeys.current = keys;
    if (restored) setQuotes({ ...cache.current });
  }, [tickers]);
  const symbolsKey = [...new Set(tickers?.map(ticker => ticker.symbol.toUpperCase()))].sort().join(',');
  const load = useCallback(async (symbols: string[], force = false, signal?: AbortSignal) => {
    const ttl = isNasdaqTradingHours(new Date()) ? 3 * 60_000 : 60 * 60_000;
    const pending = [...new Set(symbols)].filter(symbol => {
      const updated = cache.current[symbol]?.updated;
      return force || updated === undefined || Date.now() - updated >= ttl;
    });
    for (let offset = 0; offset < pending.length && !signal?.aborted; offset += 40) {
      const batch = pending.slice(offset, offset + 40);
      const tickets = batch.map(symbol => {
        const generation = (generations.current.get(symbol) ?? 0) + 1;
        generations.current.set(symbol, generation);
        return generation;
      });
      const params = new URLSearchParams({ symbols: batch.join(',') });
      if (force) params.set('forceRefresh', '1');
      let results: Record<string, StockQuote> = {};
      try {
        const response = await fetch(`/api/quotes?${params}`, { signal });
        if (response.ok) results = (await response.json()).quotes ?? {};
      } catch { /* Keep the last quote when offline. */ }
      if (signal?.aborted) return;
      for (const [index, symbol] of batch.entries()) {
        if (tickets[index] !== generations.current.get(symbol)) continue;
        const quote = results[symbol];
        if (quote && Number.isFinite(quote.c) && quote.c > 0) {
          const entry = { quote, updated: Date.now() };
          cache.current[symbol] = entry;
          const key = storageKeys.current.get(symbol);
          try { if (key) localStorage.setItem(key, JSON.stringify(entry)); } catch { /* Keep the in-memory quote. */ }
        } else {
          cache.current[symbol] = { ...cache.current[symbol], error: true };
        }
      }
      setQuotes({ ...cache.current });
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (symbolsKey) void load(symbolsKey.split(','), false, controller.signal);
    return () => controller.abort();
  }, [symbolsKey, load]);
  return { quotes, refreshQuotes: load };
}
