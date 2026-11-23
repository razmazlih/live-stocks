import { demoRequest } from '@/lib/demo/client';
import { getSupabaseClient } from '@/lib/supabase';

/** Edit just this field so a concurrent currency or appearance edit survives. */
export async function persistAnnualTarget(annualGrowthRate: number, demo: boolean) {
  if (!Number.isFinite(annualGrowthRate) || annualGrowthRate < 0 || annualGrowthRate > 1) {
    throw new RangeError('Annual growth rate must be between zero and one.');
  }
  if (demo) {
    await demoRequest('settings', { method: 'PATCH', body: JSON.stringify({ annualGrowthRate }) });
    return;
  }
  const db = getSupabaseClient();
  const values = { annual_growth_rate: annualGrowthRate };
  const updateActive = () => db.from('settings').update(values).eq('is_active', true).select('id').maybeSingle();
  const update = await updateActive();
  if (update.error) throw update.error;
  if (update.data) return;
  const insert = await db.from('settings').insert(values);
  if (insert.error?.code === '23505') {
    const retry = await updateActive();
    if (retry.data && !retry.error) return;
    throw retry.error ?? insert.error;
  }
  if (insert.error) throw insert.error;
}
