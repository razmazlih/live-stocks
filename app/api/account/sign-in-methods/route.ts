import { getSignInMethods } from '@/lib/auth/sign-in-methods';
import { METHOD_HEADERS, methodFailure } from '@/lib/auth/sign-in-method-http';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return Response.json(await getSignInMethods(new Headers(request.headers)), { headers: METHOD_HEADERS }); }
  catch (error) { return methodFailure(error); }
}
