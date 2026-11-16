import { createHash } from 'node:crypto';
import { getAdminSupabase } from '@/lib/auth/admin';
import { decryptCredential } from '@/lib/auth/credentials';
import { parseWidgetSnapshot } from '@/lib/auth/widget';
import { PRIVATE_HEADERS } from '@/lib/auth/server';
import { buildPortfolioResponse } from '@/lib/server/portfolio-response';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const bearer = /^Bearer (lst_widget_[A-Za-z0-9_-]{43})$/.exec(request.headers.get('authorization') ?? '');
  if (!bearer) return Response.json({ error: 'Reconnect this widget from account settings' }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const admin = getAdminSupabase();
    const tokenHash = createHash('sha256').update(bearer[1]).digest('hex');
    const { data: rawSnapshot, error } = await admin.rpc('server_widget_snapshot', {
      p_token_hash: tokenHash,
    });
    if (error) throw new Error('Widget access storage unavailable');
    const data = parseWidgetSnapshot(rawSnapshot);
    if (!data) {
      return Response.json({ error: 'Reconnect this widget from account settings' }, { status: 401, headers: PRIVATE_HEADERS });
    }
    // Every financial row and the encrypted key come from the same fenced RPC.
    // No later administrative query can pick up data added by a concurrent merge.
    const response = await buildPortfolioResponse({ supabase: admin, userId: data.user_id,
      snapshot: data, finnhubToken: data.encrypted_credential
        ? decryptCredential(data.credential_aad_subject, data.encrypted_credential) : null }, { includeWeightedPrice: true, targetCurrency: 'ILS' });
    if (!response.ok) return response;
    const payload = await response.json();
    const validity = await admin.rpc('server_resolve_widget', { p_token_hash: tokenHash });
    if (validity.error) throw new Error('Widget access storage unavailable');
    if (!validity.data || validity.data.user_id !== data.user_id || validity.data.expires_at !== data.expires_at) {
      return Response.json({ error: 'Reconnect this widget from account settings' }, { status: 401, headers: PRIVATE_HEADERS });
    }
    const stocks = Array.isArray(payload.stocks) ? payload.stocks.map((stock: Record<string, unknown>) => ({
      symbol: stock.symbol, quantity: stock.quantity, currentPrice: stock.currentPrice,
      totalValueUsd: stock.totalValueUsd, totalValueIls: stock.totalValueIls,
      currentPnLUsd: stock.currentPnLUsd, currentPnLIls: stock.currentPnLIls, dailyChange: stock.dailyChange,
    })) : [];
    return Response.json({ timestamp: payload.timestamp, usdToIlsRate: payload.usdToIlsRate,
      summary: payload.summary, dataQuality: payload.dataQuality, stocks, widgetTokenExpiresAt: data.expires_at }, { headers: PRIVATE_HEADERS });
  } catch {
    return Response.json({ error: 'Widget data is temporarily unavailable' }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
