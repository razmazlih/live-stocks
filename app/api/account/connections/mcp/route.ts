import { z } from 'zod';
import { getAdminSupabase } from '@/lib/auth/admin';
import { requireWebPrincipal, requireSameOrigin, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { revokeMcpGrants } from '@/lib/auth/management';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const principal = await requireWebPrincipal();
    const input = z.object({ action: z.enum(['disconnect', 'reconnect']) }).strict().safeParse(await request.json());
    if (!input.success) return Response.json({ error: 'Invalid connection action' }, { status: 400, headers: PRIVATE_HEADERS });
    const admin = getAdminSupabase();
    const disabled = await admin.rpc('server_mcp_connection', { p_user_id: principal.userId, p_action: 'disconnect', p_valid_after: Math.ceil(Date.now() / 1000) });
    if (disabled.error) throw new Error('Could not block connection');
    // Provider errors leave the DB disabled. Never revive an old JWT on failure.
    await revokeMcpGrants(principal.userId);
    if (input.data.action === 'reconnect') {
      const enabled = await admin.rpc('server_mcp_connection', { p_user_id: principal.userId, p_action: 'reconnect', p_valid_after: Math.floor(Date.now() / 1000) + 1 });
      if (enabled.error) throw new Error('Could not prepare reconnection');
    }
    return Response.json({ enabled: input.data.action === 'reconnect', connected: false }, { headers: PRIVATE_HEADERS });
  } catch (error) { return authenticationResponse(error) ?? Response.json({ error: 'Connection remains blocked; retry from account settings' }, { status: 503, headers: PRIVATE_HEADERS }); }
}
