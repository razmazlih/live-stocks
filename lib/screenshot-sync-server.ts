import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Principal } from '@/lib/auth/server';
import { betterAuthConfiguration } from '@/lib/auth/better-auth-config';
import { mapPositionRow } from '@/lib/positions';
import { buildScreenshotSyncPlan, screenshotSyncInputSchema } from '@/lib/screenshot-sync';

const envelopeSchema = z.object({ version: z.literal(1), owner: z.string(), expires: z.number(), fingerprint: z.string().regex(/^[a-f0-9]{32}$/), input: screenshotSyncInputSchema, lotIds: z.array(z.string().uuid()), importSymbols: z.array(z.string()), canApply: z.boolean() }).strict();
function key() { return createHash('sha256').update('livestocks:screenshot-sync:v1:').update(betterAuthConfiguration().secret).digest(); }
function seal(value: z.infer<typeof envelopeSchema>) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from('livestocks:screenshot-sync:v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function openScreenshotProposal(token: string, owner: string) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(token) || token.length > 50000) throw new Error();
    const bytes = Buffer.from(token, 'base64url'), decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from('livestocks:screenshot-sync:v1'));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const proposal = envelopeSchema.parse(JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')));
    if (proposal.owner !== owner || proposal.expires <= Date.now() || proposal.lotIds.length !== proposal.input.rows.length) throw new Error();
    return proposal;
  } catch { throw new Error('ההצעה אינה זמינה לחשבון זה או שפג תוקפה. יש להכין הצעה חדשה בצ׳אט.'); }
}
async function readSnapshot(principal: Principal) {
  const { data, error } = await principal.supabase.rpc('screenshot_sync_snapshot');
  if (error || !data || !Array.isArray(data.positions) || !Array.isArray(data.lots) || !/^[a-f0-9]{32}$/.test(data.fingerprint)) throw new Error('סנכרון הצילומים אינו זמין כרגע.');
  return data;
}
function planFor(input: z.infer<typeof screenshotSyncInputSchema>, snapshot: Awaited<ReturnType<typeof readSnapshot>>) {
  return buildScreenshotSyncPlan(input, snapshot.positions.map((row: Parameters<typeof mapPositionRow>[0]) => mapPositionRow({ ...row, position_lots: snapshot.lots.filter((lot: { position_id: string }) => lot.position_id === row.id) })));
}
export async function prepareScreenshotSync(principal: Principal, raw: unknown) {
  const input = screenshotSyncInputSchema.parse(raw), snapshot = await readSnapshot(principal), plan = planFor(input, snapshot);
  const expires = Date.now() + 15 * 60 * 1000;
  const token = seal({ version: 1, owner: principal.userId, expires, fingerprint: snapshot.fingerprint, input, lotIds: input.rows.map(() => randomUUID()), importSymbols: plan.changes.map(row => row.symbol), canApply: plan.canApply });
  return { plan, expiresAt: new Date(expires).toISOString(), reviewUrl: `${betterAuthConfiguration().origin}/positions/sync#${token}`, instructions: 'פתח את קישור הסקירה ואשר באתר. אין שינוי בתיק לפני אישור. שורות חסומות דורשות תיקון פרטים בצ׳אט; היסטוריה קיימת אינה מוחלפת.' };
}
export async function reviewScreenshotSync(principal: Principal, token: string) {
  const proposal = openScreenshotProposal(token, principal.userId), snapshot = await readSnapshot(principal);
  return { input: proposal.input, plan: planFor(proposal.input, snapshot), stale: snapshot.fingerprint !== proposal.fingerprint, expiresAt: new Date(proposal.expires).toISOString() };
}
export async function applyScreenshotSync(principal: Principal, token: string) {
  if (principal.kind !== 'web') throw new Error('נדרש אישור באתר.');
  const proposal = openScreenshotProposal(token, principal.userId);
  // SQL checks freshness and exact replay atomically. No administrator client or MCP write capability.
  if (!proposal.canApply) throw new Error('יש להשלים את כל השורות החסומות בצ׳אט לפני שמירה.');
  const rows = proposal.input.rows.map((row, index) => ({ ...row, location: proposal.input.location, lotId: proposal.lotIds[index] })).filter(row => proposal.importSymbols.includes(row.symbol));
  const { data, error } = await principal.supabase.rpc('apply_screenshot_sync', { p_expected: proposal.fingerprint, p_rows: rows });
  if (error) throw new Error('לא נשמר שינוי. ההצעה חסרה פרטים או שהתיק השתנה; הכינו הצעה חדשה בצ׳אט.');
  return data;
}
