import { getAdminSupabase } from '@/lib/auth/admin';
import { requireWebPrincipal, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { widgetMetadata } from '@/lib/auth/widget';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const principal = await requireWebPrincipal();
    const admin = getAdminSupabase();
    const [connection, widgets] = await Promise.all([
      admin.rpc('server_mcp_connection', { p_user_id: principal.userId, p_action: 'get' }),
      admin.rpc('server_widget_tokens', { p_user_id: principal.userId, p_action: 'list' }),
    ]);
    if (connection.error || widgets.error) throw new Error('Connection storage unavailable');
    return Response.json({ mcp: { enabled: connection.data?.enabled ?? true,
      connected: Boolean(connection.data?.enabled && connection.data?.last_connected_at),
      revokedAt: connection.data?.revoked_at ?? null }, widgets: (widgets.data ?? []).map(widgetMetadata) }, { headers: PRIVATE_HEADERS });
  } catch (error) { return authenticationResponse(error) ?? Response.json({ error: 'Could not load connected applications' }, { status: 503, headers: PRIVATE_HEADERS }); }
}
