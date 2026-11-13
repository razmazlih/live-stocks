import { NextRequest } from 'next/server';
import { z } from 'zod';
import { GET as portfolioSnapshot } from '@/app/api/portfolio/ai/route';
import { GET as marketQuote } from '@/app/api/quote/route';
import { actionPlanSchema, snapshotSchema, validateActionPlan } from '@/lib/investment-actions';
import { INVESTMENT_POLICY } from '@/lib/investment-policy';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const versions = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const tools = [
  { name: 'get_research_brief', description: 'Read the binding investment research rules before analyzing LiveStocks: BUY new stocks only, SELL full holdings only, broad-market primary-source research and no execution.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations },
  { name: 'get_portfolio_snapshot', description: 'Read the full configured shared LiveStocks portfolio, active holdings across accounts, lots, plans, P/L, goals, quote timestamps and quality limitations. No per-user account selection. Cached observations may be stale; generatedAt is not market price time.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations },
  { name: 'get_market_quotes', description: 'Get last available Finnhub quote observations for up to 8 stock tickers, including stocks outside the portfolio. This is not a whole-market screener, financial statements, history or news. Check timestamps; unavailable tickers remain unavailable.', inputSchema: { type: 'object', properties: { symbols: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 32 } } }, required: ['symbols'], additionalProperties: false }, annotations },
  { name: 'validate_action_plan', description: 'Check proposed recommendations against current recorded holdings and available cash: BUY only unowned symbols, SELL 100% across all accounts, no duplicate symbols or overspending. Does not research, approve or execute trades. Budget excludes unexecuted sale proceeds; costs are extra.', inputSchema: { type: 'object', properties: { budgetUsd: { type: 'number', minimum: 0 }, actions: { type: 'array', maxItems: 50, items: { type: 'object', properties: { symbol: { type: 'string', minLength: 1, maxLength: 32 }, action: { type: 'string', enum: ['BUY', 'SELL'] }, quantity: { type: 'number', exclusiveMinimum: 0 }, priceUsd: { type: 'number', exclusiveMinimum: 0 } }, required: ['symbol', 'action', 'quantity', 'priceUsd'], additionalProperties: false } } }, required: ['budgetUsd', 'actions'], additionalProperties: false }, annotations },
];
const rpcSchema = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number().finite()]).optional(), method: z.string(), params: z.record(z.unknown()).optional() });
const empty = z.object({}).strict();
const quoteArgs = z.object({ symbols: z.array(z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9.^=:-]+$/)).min(1).max(8) }).strict();

function json(data: unknown, status = 200) { return Response.json(data, { status, headers }); }
function error(id: string | number | null, code: number, message: string, status = 200) { return json({ jsonrpc: '2.0', id, error: { code, message } }, status); }
async function loadSnapshot() {
  const response = await portfolioSnapshot();
  if (!response.ok) throw new Error('LiveStocks portfolio is unavailable; no holdings or prices have been inferred.');
  return snapshotSchema.parse(await response.json());
}
async function withDeadline<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Data source deadline exceeded.')), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
async function callTool(name: string, args: unknown, request: Request) {
  if (name === 'get_research_brief') {
    empty.parse(args);
    return { policy: INVESTMENT_POLICY, requiredInvestorInputs: ['available USD cash budget', 'investment horizon', 'risk tolerance'], researchAvailability: 'Use host web search or connected financial research tools. No news/fundamentals provider is bundled.' };
  }
  if (name === 'get_portfolio_snapshot') { empty.parse(args); return loadSnapshot(); }
  if (name === 'validate_action_plan') {
    const plan = actionPlanSchema.parse(args);
    return validateActionPlan(await loadSnapshot(), plan);
  }
  const { symbols } = quoteArgs.parse(args);
  const quotes = [];
  // Bound provider load, preserve one explicit result per candidate, never force refresh.
  for (const symbol of [...new Set(symbols.map(s => s.toUpperCase()))]) {
    const url = new URL('/api/quote', request.url);
    url.searchParams.set('symbol', symbol);
    try {
      const { response, quote } = await withDeadline((async () => {
        const response = await marketQuote(new NextRequest(url));
        return { response, quote: await response.json() };
      })(), 5000);
      const validPrice = typeof quote.c === 'number' && Number.isFinite(quote.c) && quote.c > 0;
      const timestamp = typeof quote.t === 'number' && Number.isFinite(quote.t) && quote.t > 0 ? new Date(quote.t * 1000) : null;
      quotes.push(response.ok && validPrice
        ? { symbol, source: 'Finnhub', status: 'last_available', priceUsd: quote.c, dailyChangePerShareUsd: typeof quote.d === 'number' && Number.isFinite(quote.d) ? quote.d : null, marketTimestamp: timestamp && Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null }
        : { symbol, source: 'Finnhub', status: 'unavailable', error: 'Quote unavailable', httpStatus: response.status });
    } catch {
      quotes.push({ symbol, source: 'Finnhub', status: 'unavailable', error: 'Quote source failed or exceeded the 5-second deadline.' });
    }
  }
  return { retrievedAt: new Date().toISOString(), quotes, limitation: 'Last available observations; retrieval time is not market time. USD stock quotes only; verify currency, exchange, corporate actions and ticker identity externally.' };
}

export async function POST(request: Request) {
  // Remote clients normally omit Origin. Browsers must use the app or supported chat host.
  const origin = request.headers.get('origin');
  const allowedOrigins = [new URL(request.url).origin, 'https://chatgpt.com', 'https://chat.openai.com'];
  if (origin && !allowedOrigins.includes(origin)) return error(null, -32600, 'Origin is not allowed.', 403);
  const protocol = request.headers.get('mcp-protocol-version');
  if (protocol && !versions.includes(protocol)) return error(null, -32600, 'Unsupported MCP protocol version.', 400);
  if (!request.headers.get('content-type')?.includes('application/json')) return error(null, -32600, 'Content-Type must be application/json.', 415);
  if (Number(request.headers.get('content-length') ?? 0) > 65536) return error(null, -32600, 'Request too large.', 413);
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 65536) return error(null, -32600, 'Request too large.', 413);
    body = JSON.parse(raw);
  } catch { return error(null, -32700, 'Invalid JSON.', 400); }
  const parsed = rpcSchema.safeParse(body);
  if (!parsed.success) return error(null, -32600, 'Invalid JSON-RPC request.', 400);
  const rpc = parsed.data;
  if (rpc.id === undefined) return new Response(null, { status: 202, headers });
  const result = (value: unknown) => json({ jsonrpc: '2.0', id: rpc.id, result: value });
  if (rpc.method === 'initialize') {
    const requested = rpc.params?.protocolVersion;
    return result({ protocolVersion: typeof requested === 'string' && versions.includes(requested) ? requested : versions[0], capabilities: { tools: {} }, serverInfo: { name: 'livestocks-analyst', version: '0.1.0' }, instructions: INVESTMENT_POLICY });
  }
  if (rpc.method === 'server/discover') return result({ supportedVersions: versions, capabilities: { tools: {} }, serverInfo: { name: 'livestocks-analyst', version: '0.1.0' }, instructions: INVESTMENT_POLICY });
  if (rpc.method === 'ping') return result({});
  if (rpc.method === 'tools/list') return result({ tools });
  if (rpc.method !== 'tools/call') return error(rpc.id, -32601, 'Method not found.');
  const name = rpc.params?.name;
  if (typeof name !== 'string' || !tools.some(tool => tool.name === name)) return error(rpc.id, -32602, 'Unknown tool.');
  try {
    const value = await callTool(name, rpc.params?.arguments ?? {}, request);
    return result({ content: [{ type: 'text', text: JSON.stringify(value) }], isError: false });
  } catch (failure) {
    const message = failure instanceof z.ZodError ? 'Invalid tool input or incompatible portfolio data; no recommendation has been validated.' : 'LiveStocks data is temporarily unavailable; retry later. No values have been inferred.';
    return result({ content: [{ type: 'text', text: message }], isError: true });
  }
}

/** Stateless transport: this server does not offer a persistent SSE stream. */
export async function GET() { return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } }); }
