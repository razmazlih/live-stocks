import { createHash } from 'node:crypto';
import { getAdminSupabase } from '@/lib/auth/admin';
import { readFinnhubCredential } from '@/lib/auth/credentials';
import { PRIVATE_HEADERS } from '@/lib/auth/server';
import { buildPortfolioResponse } from '@/lib/server/portfolio-response';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const bearer = /^Bearer (lst_widget_[A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') ?? '');
  if (!bearer) return Response.json({ error: 'Reconnect this widget from account settings' }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const admin = getAdminSupabase();
    const { data, error } = await admin.rpc('server_resolve_widget', {
      p_token_hash: createHash('sha256').update(bearer[1]).digest('hex'),
    });
    if (error) throw new Error('Widget access storage unavailable');
    if (!data || typeof data.user_id !== 'string' || !data.user_id || typeof data.expires_at !== 'string'
      || !Number.isFinite(Date.parse(data.expires_at)) || Date.parse(data.expires_at) <= Date.now()) {
      return Response.json({ error: 'Reconnect this widget from account settings' }, { status: 401, headers: PRIVATE_HEADERS });
    }
    // This is the only portfolio read using the service client: the fixed helper
    // filters every query by the owner resolved from the hashed widget credential.
    // Neither request bodies nor URLs can select a different owner or operation.
    const response = await buildPortfolioResponse({ supabase: admin, userId: data.user_id,
      finnhubToken: await readFinnhubCredential(data.user_id) }, { includeWeightedPrice: true, targetCurrency: 'ILS' });
    if (!response.ok) return response;
    const payload = await response.json();
    const stocks = Array.isArray(payload.stocks) ? payload.stocks.map((stock: Record<string, unknown>) => ({
      symbol: stock.symbol, quantity: stock.quantity, currentPrice: stock.currentPrice,
      totalValueUsd: stock.totalValueUsd, totalValueIls: stock.totalValueIls,
      currentPnLUsd: stock.currentPnLUsd, currentPnLIls: stock.currentPnLIls, dailyChange: stock.dailyChange,
    })) : [];
    return Response.json({ timestamp: payload.timestamp, usdToIlsRate: payload.usdToIlsRate,
      summary: payload.summary, stocks, widgetTokenExpiresAt: data.expires_at }, { headers: PRIVATE_HEADERS });
  } catch {
    return Response.json({ error: 'Widget data is temporarily unavailable' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
