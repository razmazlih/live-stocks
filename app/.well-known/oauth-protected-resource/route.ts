import { auth0Configuration, authenticationResponse } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { issuer, mcpAudience } = auth0Configuration();
    return Response.json({
      resource: mcpAudience,
      authorization_servers: [issuer],
      scopes_supported: ['portfolio:read'],
      bearer_methods_supported: ['header'],
      resource_name: 'LiveStocks',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return authenticationResponse(error) ?? Response.json({ error: 'Authentication is not configured' }, { status: 503 });
  }
}
