import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const sourceCatalogSchema = z.array(z.object({
  id: z.string().uuid(), name: z.string().trim().min(1),
  archived_at: z.string().nullable(), created_at: z.string(),
  legacy_location: z.string().nullable(),
}));
export type SourceCatalog = z.infer<typeof sourceCatalogSchema>;

/** Ownership is enforced both by the explicit predicate and the caller's RLS session. */
export async function readSourceCatalog(supabase: SupabaseClient, userId: string): Promise<SourceCatalog> {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('investment_sources')
      .select('id,name,archived_at,created_at,legacy_location').eq('user_id', userId)
      .order('created_at').range(offset, offset + 499);
    if (error || !Array.isArray(data)) throw new Error('מקורות ההשקעה אינם זמינים כרגע.');
    rows.push(...data);
    if (data.length < 500) return sourceCatalogSchema.parse(rows);
  }
}

export function activeSourceForSync(sources: unknown, sourceId: string) {
  const source = sourceCatalogSchema.parse(sources).find(item => item.id === sourceId && item.archived_at === null);
  if (!source) throw new Error('יש לבחור מקור השקעה פעיל השייך לחשבון זה.');
  return source;
}
