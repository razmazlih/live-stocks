import 'server-only';
import { z } from 'zod';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AuthenticationError, PRIVATE_HEADERS, requireSameOrigin } from '@/lib/auth/server';
import { signOutBetterAuth } from '@/lib/auth/better-auth';
import { accountMergeEnabled, createAccountMergeRuntime, mergeSession } from './runtime';
import { AccountMergeError, MERGE_CAPABILITY_LIFETIME, parseMergeCapability } from './service';
const COOKIE = 'livestocks_account_merge';
const HEADERS = { ...PRIVATE_HEADERS, 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const opaque = z.string().min(1).max(256);
const confirmation = z.object({ reviewVersion: z.number().int().nonnegative(), reviewHash: opaque, accountIds: z.tuple([opaque, opaque]),
  canonicalAccountId: opaque, settingsAccountId: opaque.optional(), credentialAccountId: opaque.optional(), confirmed: z.literal(true) }).strict();
function cookie(request: Request) { return request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1); }
function setCookie(response: Response, value: string, maxAge = MERGE_CAPABILITY_LIFETIME / 1000) {
  const secure = new URL(process.env.APP_BASE_URL!).protocol === 'https:';
  response.headers.append('Set-Cookie', `${COOKIE}=${value}; Path=/api/account/link; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
}
function failure(error: unknown) {
  const code = error instanceof AccountMergeError ? error.code : error instanceof z.ZodError || error instanceof AuthenticationError ? 'CONFLICT' : 'UNAVAILABLE';
  const status = error instanceof AccountMergeError || error instanceof AuthenticationError ? error.status : error instanceof z.ZodError ? 400 : 503;
  return Response.json({ code }, { status, headers: HEADERS });
}
async function body(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length') ?? 0) > 8192) throw new AccountMergeError('CONFLICT', 400);
  const text = await request.text();
  if (text.length > 8192) throw new AccountMergeError('CONFLICT', 400);
  try { return JSON.parse(text); } catch { throw new AccountMergeError('CONFLICT', 400); }
}
/** Every mutation is same-origin and bound to an HttpOnly browser capability, not a URL token. */
export async function handleAccountMerge(request: Request, action: 'status' | 'start' | 'reauth' | 'confirm' | 'resume' | 'cancel' | 'callback', id?: string) {
  if (!accountMergeEnabled()) return action === 'status' ? Response.json({ available: false }, { headers: HEADERS }) : failure(new AccountMergeError('NOT_READY', 503));
  try {
    if (request.method === 'POST') requireSameOrigin(request);
    else if (!['status', 'callback'].includes(action)) throw new AccountMergeError('CONFLICT', 405);
    const service = createAccountMergeRuntime(), capability = cookie(request);
    if (id && (!capability || parseMergeCapability(capability)?.id !== id)) throw new AccountMergeError('CONFLICT', 403);
    const session = await mergeSession(new Headers(request.headers));
    if (action === 'status') {
      const status = await service.status(session, capability);
      const response = Response.json(status, { headers: HEADERS });
      if (capability && status.available && (!status.operation || status.operation.phase === 'cancelled')) setCookie(response, '', 0);
      return response;
    }
    if (action === 'start') {
      if (!session) throw new AccountMergeError('CONFLICT', 401);
      if (capability) throw new AccountMergeError('CONFLICT');
      const { candidateId } = z.object({ candidateId: opaque }).strict().parse(await body(request));
      const started = await service.start(session, candidateId);
      const response = Response.json(started.status, { headers: HEADERS }); setCookie(response, started.capability); return response;
    }
    if (!capability) throw new AccountMergeError('CONFLICT', 403);
    if (action === 'callback') {
      if (!session) throw new AccountMergeError('PROOF_EXPIRED', 401);
      await service.prove(capability, session);
      return new Response(null, { status: 303, headers: { ...HEADERS, Location: '/settings' } });
    }
    if (action === 'reauth') {
      const { step } = z.object({ step: z.enum(['current', 'other']) }).strict().parse(await body(request));
      const result = await service.challenge(capability, session, step);
      // Removing the old provider session forces the next callback to carry a new live login.
      const signout = await signOutBetterAuth(new Headers(request.headers));
      if (!signout.ok) throw new AccountMergeError('UNAVAILABLE', 503);
      const response = Response.json(result, { headers: HEADERS });
      for (const value of signout.headers.getSetCookie()) response.headers.append('Set-Cookie', value);
      return response;
    }
    const input = await body(request);
    const status = action === 'confirm' ? await service.confirm(capability, session, confirmation.parse(input))
      : action === 'cancel' ? (z.object({}).strict().parse(input), await service.cancel(capability, session))
        : (z.object({}).strict().parse(input), await service.resume(capability));
    return Response.json(status, { headers: HEADERS });
  } catch (error) {
    const response = failure(error);
    if (action === 'status' && error instanceof AccountMergeError && error.status === 403) setCookie(response, '', 0);
    return response;
  }
}

/** Optional scheduler boundary; never takes a job ID or financial choices from the request. */
export async function handleAccountMergeWorker(request: Request) {
  if (!accountMergeEnabled()) return failure(new AccountMergeError('NOT_READY', 503));
  const expected = process.env.ACCOUNT_LINKING_WORKER_SECRET;
  const actual = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!expected || expected.length < 32 || !actual || Buffer.byteLength(expected) !== Buffer.byteLength(actual)
    || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return failure(new AccountMergeError('CONFLICT', 401));
  try { return Response.json(await createAccountMergeRuntime().runPending(), { headers: HEADERS }); }
  catch { return failure(new AccountMergeError('UNAVAILABLE', 503)); }
}

/** Recovery is deliberately outside the login-protected settings page: freeze revokes both logins. */
export async function handleAccountMergeRecovery(request: Request) {
  if (!accountMergeEnabled()) return failure(new AccountMergeError('NOT_READY', 503));
  try {
    const capability = cookie(request);
    if (!capability) throw new AccountMergeError('CONFLICT', 403);
    const service = createAccountMergeRuntime();
    if (request.method === 'POST') {
      requireSameOrigin(request);
      await service.resume(capability);
      return new Response(null, { status: 303, headers: { ...HEADERS, Location: '/api/account/link/recovery' } });
    }
    const status = await service.status(null, capability);
    const operation = status.available ? status.operation : null;
    const resumable = operation && 'resumable' in operation && operation.resumable;
    const content = operation?.phase === 'completed'
      ? '<p>איחוד החשבונות הושלם. יש להתחבר מחדש כדי לפתוח את התיק המאוחד.</p><p lang="en" dir="ltr">Account merge completed. Sign in again to open the unified portfolio.</p><a class="button" href="/sign-in?returnTo=%2Fsettings">כניסה מחדש / Sign in</a>'
      : resumable ? '<p>החשבונות נשארים מוגנים עד להשלמת התהליך השמור. הנתונים לא נמחקו.</p><p lang="en" dir="ltr">Your accounts remain protected while this saved operation is completed. Your data has not been deleted.</p><form method="post"><button type="submit">המשך איחוד שמור / Resume saved merge</button></form>'
        : '<p>נדרש אימות של שני החשבונות ואישור מפורש לפני האיחוד.</p><p lang="en" dir="ltr">Both account proofs and explicit confirmation are required before merging.</p><a class="button" href="/settings">חזרה להגדרות / Account settings</a>';
    const style = 'html{color-scheme:light dark;font-family:system-ui,sans-serif;background:#f1f5f9;color:#0f172a}body{margin:0;padding:clamp(1rem,5vw,3rem)}main{max-width:34rem;margin:8vh auto;padding:clamp(1.25rem,4vw,2.5rem);background:#fff;border:1px solid #cbd5e1;border-radius:1.25rem;box-shadow:0 1rem 3rem #0f172a10}h1{font-size:clamp(1.4rem,4vw,2rem);line-height:1.4}p{line-height:1.8;overflow-wrap:anywhere}p[lang=en]{color:#475569}button,.button{display:inline-block;box-sizing:border-box;max-width:100%;margin-top:1rem;background:#1d4ed8;color:#fff;padding:.85rem 1.1rem;border:0;border-radius:.65rem;font:inherit;line-height:1.6;text-decoration:none;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid #38bdf8;outline-offset:4px}@media(prefers-color-scheme:dark){html{background:#0f172a;color:#e2e8f0}main{background:#1e293b;border-color:#475569}p[lang=en]{color:#cbd5e1}button,.button{background:#2563eb}}';
    const styleHash = createHash('sha256').update(style).digest('base64');
    return new Response('<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>LiveStocks — שחזור איחוד חשבונות</title><style>' + style + '</style></head><body><main><h1>שחזור איחוד חשבונות</h1><p lang="en" dir="ltr">Account merge recovery</p>' + content + '</main></body></html>', {
      headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'sha256-" + styleHash + "'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" },
    });
  } catch (error) { return failure(error); }
}

/** A sign-in screen can expose recovery without bootstrapping an account or disclosing details. */
export async function handleAccountMergeRecoveryStatus(request: Request) {
  if (!accountMergeEnabled()) return Response.json({ available: false, recovery: false }, { headers: HEADERS });
  const capability = cookie(request);
  if (!capability) return Response.json({ available: true, recovery: false }, { headers: HEADERS });
  try { return Response.json({ available: true, recovery: await createAccountMergeRuntime().recoverable(capability) }, { headers: HEADERS }); }
  catch { return Response.json({ available: true, recovery: false }, { headers: HEADERS }); }
}
