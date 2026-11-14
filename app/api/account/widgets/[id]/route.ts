import { z } from 'zod';
import { getAdminSupabase } from '@/lib/auth/admin';
import { requireWebPrincipal, requireSameOrigin, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
export const dynamic = 'force-dynamic';
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const principal = await requireWebPrincipal();
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) return Response.json({ error: 'Widget not found' }, { status: 404, headers: PRIVATE_HEADERS });
    const result = await getAdminSupabase().rpc('server_widget_tokens', { p_user_id: principal.userId, p_action: 'revoke', p_id: id });
    if (result.error) throw new Error('Widget storage unavailable');
    return Response.json({ revoked: true }, { headers: PRIVATE_HEADERS });
  } catch (error) { return authenticationResponse(error) ?? Response.json({ error: 'Could not revoke widget access' }, { status: 503, headers: PRIVATE_HEADERS }); }
}
