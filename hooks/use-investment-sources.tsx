'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import type { InvestmentSource } from '@/types';

export function mapInvestmentSource(row: Record<string, unknown>): InvestmentSource {
  return { id: String(row.id), name: String(row.name), archivedAt: row.archived_at as string | null,
    createdAt: String(row.created_at), legacyLocation: row.legacy_location as string | null };
}

const columns = 'id,name,archived_at,created_at,legacy_location';
const SourceContext = createContext<ReturnType<typeof useSourceState> | null>(null);

function useSourceState() {
  const [sources, setSources] = useState<InvestmentSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const collected: InvestmentSource[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error: queryError } = await getSupabaseClient().from('investment_sources').select(columns).order('created_at').order('id').range(offset, offset + pageSize - 1);
        if (queryError) throw queryError;
        if (request !== generation.current) return;
        collected.push(...(data ?? []).map(mapInvestmentSource));
        if (!data || data.length < pageSize) break;
      }
      if (request === generation.current) { setSources(collected); setError(null); }
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof Error ? caught.message : 'Unable to load investment sources');
    } finally { if (request === generation.current) setLoading(false); }
  }, []);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { void refresh(); return invalidate; }, [refresh, invalidate]);
  const update = useCallback(async (id: string, patch: Record<string, unknown>) => {
    const { data, error: queryError } = await getSupabaseClient().from('investment_sources').update(patch).eq('id', id).select(columns).single();
    if (queryError) throw queryError;
    const source = mapInvestmentSource(data);
    setSources(previous => previous.map(item => item.id === id ? source : item));
    return source;
  }, []);
  const createSource = useCallback(async (name: string) => {
    const { data, error: queryError } = await getSupabaseClient().from('investment_sources').insert({ name: validateSourceName(name) }).select(columns).single();
    if (queryError) throw queryError;
    const source = mapInvestmentSource(data);
    setSources(previous => [...previous, source]);
    return source;
  }, []);
  const renameSource = useCallback((id: string, name: string) => update(id, { name: validateSourceName(name) }), [update]);
  const archiveSource = useCallback((id: string) => update(id, { archived_at: new Date().toISOString() }), [update]);
  const restoreSource = useCallback((id: string) => update(id, { archived_at: null }), [update]);
  const activeSources = useMemo(() => sources.filter(source => !source.archivedAt), [sources]);
  const resolveLocation = useCallback((id: string) => sources.find(source => source.id === id || source.legacyLocation === id)?.id ?? id, [sources]);
  const sourceName = useCallback((id: string, locale: 'he' | 'en' = 'he') => sources.find(source => source.id === id || source.legacyLocation === id)?.name ?? (locale === 'he' ? 'מקור לא זמין' : 'Unavailable source'), [sources]);
  return { sources, activeSources, loading, error, refresh, createSource, renameSource, archiveSource, restoreSource, resolveLocation, sourceName };
}

export function validateSourceName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 80) throw new Error('Source name must contain 1–80 characters');
  return trimmed;
}

export function InvestmentSourcesProvider({ children }: { children: ReactNode }) {
  const value = useSourceState();
  return <SourceContext.Provider value={value}>{children}</SourceContext.Provider>;
}

export function useInvestmentSources() {
  const context = useContext(SourceContext);
  if (!context) throw new Error('useInvestmentSources requires InvestmentSourcesProvider');
  return context;
}
