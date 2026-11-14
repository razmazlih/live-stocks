import { betterAuthConfiguration } from '@/lib/auth/better-auth-config';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const { issuer, mcpAudience } = betterAuthConfiguration();
    return Response.json({ resource: mcpAudience, authorization_servers: [issuer],
      scopes_supported: ['portfolio:read'], bearer_methods_supported: ['header'], resource_name: 'LiveStocks',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Authentication is not configured' }, { status: 503 }); }
}
