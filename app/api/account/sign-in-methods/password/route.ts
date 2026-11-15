import { isPasswordAuthEnabled } from '@/lib/auth/better-auth-config';
import { z } from 'zod';
import { SignInMethodError, requestPasswordMethod } from '@/lib/auth/sign-in-methods';
import { METHOD_HEADERS, methodFailure, readMethodBody } from '@/lib/auth/sign-in-method-http';
export const dynamic = 'force-dynamic';
const schema = z.object({ consent: z.literal(true) }).strict();
export async function POST(request: Request) {
  if (!isPasswordAuthEnabled()) return Response.json({ code: 'NOT_FOUND' }, { status: 404, headers: METHOD_HEADERS });
  try {
    if (!schema.safeParse(await readMethodBody(request)).success) throw new SignInMethodError('INVALID_PROOF');
    await requestPasswordMethod(new Headers(request.headers));
    return Response.json({ sent: true }, { headers: METHOD_HEADERS });
  } catch (error) { return methodFailure(error); }
}
