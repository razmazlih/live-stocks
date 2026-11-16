import { z } from 'zod';
import { requireWebPrincipal, requireSameOrigin, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { reviewScreenshotSync, applyScreenshotSync, reviseScreenshotDates, suggestScreenshotDate } from '@/lib/screenshot-sync-server';
export const dynamic = 'force-dynamic';
const token = z.string().min(1).max(50000);
const dates = z.array(z.object({ symbol: z.string().min(1).max(32), acquiredOn: z.string().nullable(), estimatedAcquiredOn: z.string().nullable().optional() }).strict()).min(1).max(100);
const input = z.discriminatedUnion('action', [
  z.object({ token, action: z.literal('review') }).strict(),
  z.object({ token, action: z.literal('apply'), acknowledgeIncompleteHistory: z.literal(true).optional(), dates: dates.optional() }).strict(),
  z.object({ token, action: z.literal('revise'), dates }).strict(),
  z.object({ token, action: z.literal('date_candidates'), symbol: z.string().min(1).max(32) }).strict(),
]);
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const principal = await requireWebPrincipal();
    const raw = await request.text();
    if (raw.length > 65000) return Response.json({ error: 'Request too large' }, { status: 413, headers: PRIVATE_HEADERS });
    const body = input.parse(JSON.parse(raw));
    if (body.action === 'apply' && body.acknowledgeIncompleteHistory !== true) return Response.json({ error: 'נדרש אישור מגבלות היסטוריית העסקאות.' }, { status: 400, headers: PRIVATE_HEADERS });
    let applyToken = body.token;
    if (body.action === 'apply' && body.dates) applyToken = (await reviseScreenshotDates(principal, body.token, body.dates)).token;
    const data = body.action === 'apply' ? await applyScreenshotSync(principal, applyToken)
      : body.action === 'revise' ? await reviseScreenshotDates(principal, body.token, body.dates)
      : body.action === 'date_candidates' ? await suggestScreenshotDate(principal, body.token, body.symbol)
      : await reviewScreenshotSync(principal, body.token);
    return Response.json(data, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return authenticationResponse(error) ?? Response.json({ error: error instanceof z.ZodError || error instanceof SyntaxError ? 'בקשה לא תקינה.' : error instanceof Error ? error.message : 'הסנכרון אינו זמין.' }, { status: 409, headers: PRIVATE_HEADERS });
  }
}
