import 'server-only';
import { betterAuthConfiguration } from './better-auth-config';
import { SignInMethodError } from './sign-in-methods';

export const METHOD_HEADERS = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', Vary: 'Cookie' };
export function methodFailure(error: unknown): Response {
  const code = error instanceof SignInMethodError ? error.code : 'UNAVAILABLE';
  return Response.json({ code }, { status: code === 'UNAUTHORIZED' ? 401 : code === 'INVALID_PROOF' ? 403 : code === 'RATE_LIMITED' ? 429 : code === 'ALREADY_LINKED' ? 409 : 503, headers: METHOD_HEADERS });
}
export async function readMethodBody(request: Request): Promise<unknown> {
  if (request.headers.get('origin') !== betterAuthConfiguration().origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new SignInMethodError('INVALID_PROOF');
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 2048) throw new SignInMethodError('INVALID_PROOF');
  const text = await request.text();
  if (text.length > 2048) throw new SignInMethodError('INVALID_PROOF');
  try { return JSON.parse(text); } catch { throw new SignInMethodError('INVALID_PROOF'); }
}
