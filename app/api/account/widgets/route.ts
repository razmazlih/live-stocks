import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getAdminSupabase } from '@/lib/auth/admin';
import { requireWebPrincipal, requireSameOrigin, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { widgetMetadata } from '@/lib/auth/widget';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const principal = await requireWebPrincipal();
    const input = z.object({ name: z.string().trim().min(1).max(80) }).strict().safeParse(await request.json());
    if (!input.success) return Response.json({ error: 'Choose a widget name' }, { status: 400, headers: PRIVATE_HEADERS });
    const token = `lst_widget_${randomBytes(32).toString('base64url')}`;
    const result = await getAdminSupabase().rpc('server_widget_tokens', { p_user_id: principal.userId, p_action: 'create',
      p_name: input.data.name, p_token_hash: createHash('sha256').update(token).digest('hex') });
    if (result.error) throw new Error('Widget storage unavailable');
    return Response.json({ token, widget: widgetMetadata(result.data) }, { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) { return authenticationResponse(error) ?? Response.json({ error: 'Could not create widget access' }, { status: 503, headers: PRIVATE_HEADERS }); }
}
