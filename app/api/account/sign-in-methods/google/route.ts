import { isPasswordAuthEnabled } from '@/lib/auth/better-auth-config';
import { z } from 'zod';
import { SignInMethodError, startGoogleMethod } from '@/lib/auth/sign-in-methods';
import { METHOD_HEADERS, methodFailure, readMethodBody } from '@/lib/auth/sign-in-method-http';
export const dynamic = 'force-dynamic';
const schema = z.object({ password: z.string().min(1).max(128), consent: z.literal(true) }).strict();
export async function POST(request: Request) {
  if (!isPasswordAuthEnabled()) return Response.json({ code: 'NOT_FOUND' }, { status: 404, headers: METHOD_HEADERS });
  try {
    const body = schema.safeParse(await readMethodBody(request));
    if (!body.success) throw new SignInMethodError('INVALID_PROOF');
    const response = await startGoogleMethod(new Headers(request.headers), body.data.password);
    if (!response.ok) throw new SignInMethodError('UNAVAILABLE');
    const data = await response.json(), url = new URL(data.url);
    if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth' || url.username || url.password || url.hash) throw new SignInMethodError('UNAVAILABLE');
    const headers = new Headers(METHOD_HEADERS);
    // The SDK's one-use OAuth state cookie must reach this browser unchanged.
    for (const cookie of response.headers.getSetCookie()) headers.append('set-cookie', cookie);
    return Response.json({ url: url.href }, { headers });
  } catch (error) { return methodFailure(error); }
}
