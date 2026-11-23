import { createHash } from 'node:crypto';
import WebSocket from 'ws';
import { NextRequest } from 'next/server';
import { requireWebPrincipal, authenticationResponse, PRIVATE_HEADERS } from '@/lib/auth/server';
import { readFinnhubCredential } from '@/lib/auth/credentials';
import { getAdminSupabase } from '@/lib/auth/admin';
import { QuoteRelay, providerBackoff, type CoordinationState } from '@/lib/server/live-quote-relay';
import {
  MAX_STREAM_DEMAND,
  mergeDemand,
  PRIORITY,
  type LiveQuoteFrame,
  type LiveQuotePriority,
} from '@/lib/live-quotes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const relays = new Map<string, QuoteRelay>();
const error = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: PRIVATE_HEADERS });
const encoder = new TextEncoder();

function sharedRelay(token: string) {
  const scope = createHash('sha256').update(token).digest('hex');
  const existing = relays.get(scope);
  if (existing) return existing;
  const admin = getAdminSupabase();
  const relay = new QuoteRelay(
    {
      step: async ({ node, demand, marks, status, release, backoff, wantsSocket }) => {
        const response = await admin
          .rpc('server_quote_stream_step', {
            p_scope: scope,
            p_node: node,
            p_demand: demand,
            p_marks: marks,
            p_status: status,
            p_release: release,
            p_backoff: backoff ?? 0,
            p_wants_socket: wantsSocket ?? false,
          })
          .abortSignal(AbortSignal.timeout(5000));
        if (response.error || !response.data) throw new Error('Quote coordination unavailable');
        return response.data as CoordinationState;
      },
      socket: () =>
        new WebSocket('wss://ws.finnhub.io/?token=' + encodeURIComponent(token), {
          handshakeTimeout: 5000,
          maxPayload: 1_000_000,
          perMessageDeflate: false,
        }),
      quote: async (symbol) => {
        // One REST attempt per database-issued permit, with no hidden retries.
        const response = await fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol), {
          cache: 'no-store',
          headers: { 'X-Finnhub-Token': token },
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok)
          return { backoff: providerBackoff(response.status, response.headers.get('retry-after')) };
        return response.json();
      },
    },
    () => relays.delete(scope),
  );
  relays.set(scope, relay);
  return relay;
}

export async function GET(request: NextRequest) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site')
      return error(403, 'Same-site stream required');
    const principal = await requireWebPrincipal();
    const search = request.nextUrl.searchParams;
    const demand = mergeDemand(
      (Object.keys(PRIORITY) as LiveQuotePriority[]).map((p) =>
        (search.get(p) ?? '').split(',').map((symbol) => ({ symbol, priority: PRIORITY[p] })),
      ),
    );
    if (!demand.length || demand.length > MAX_STREAM_DEMAND) return error(400, 'Invalid symbol subscription');
    const token = await readFinnhubCredential(principal.userId);
    if (!token) return error(409, 'Market data credential unavailable');
    const relay = sharedRelay(token);
    let finish = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let stopped = false;
        let detach = () => {};
        const end = () => {
          if (stopped) return;
          stopped = true;
          clearTimeout(lifetime);
          clearInterval(keepAlive);
          detach();
          request.signal.removeEventListener('abort', end);
          try {
            controller.close();
          } catch {
            /* Already cancelled. */
          }
        };
        const remaining = Math.max(1, Math.min(48_000, principal.expiresAt * 1000 - Date.now()));
        const lifetime = setTimeout(end, remaining);
        const keepAlive = setInterval(() => {
          if (!stopped) controller.enqueue(encoder.encode(': heartbeat\n\n'));
        }, 12_000);
        finish = end;
        request.signal.addEventListener('abort', end, { once: true });
        detach = relay.listen(demand, (frame: LiveQuoteFrame) => {
          if (!stopped && (controller.desiredSize ?? 0) > 0)
            controller.enqueue(encoder.encode('data:' + JSON.stringify(frame) + '\n\n'));
        });
        if (request.signal.aborted) end();
      },
      cancel() {
        finish();
      },
    });
    return new Response(stream, {
      headers: {
        ...PRIVATE_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (cause) {
    return authenticationResponse(cause) ?? error(503, 'Quote stream unavailable');
  }
}
