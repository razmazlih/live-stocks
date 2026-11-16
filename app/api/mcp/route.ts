import { requireMcpPrincipal, authenticationResponse, AuthenticationError, authenticationConfiguration, PRIVATE_HEADERS, type Principal } from '@/lib/auth/server';
import { prepareScreenshotSync } from '@/lib/screenshot-sync-server';
import { findPurchaseDateCandidates, purchaseDateCandidatesInputSchema } from '@/lib/purchase-date-candidates';
import { screenshotSyncInputSchema } from '@/lib/screenshot-sync';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { GET as portfolioSnapshot } from '@/app/api/portfolio/ai/route';
import { GET as marketQuote } from '@/app/api/quote/route';
import { actionPlanSchema, snapshotSchema, validateActionPlan } from '@/lib/investment-actions';
import { INVESTMENT_POLICY } from '@/lib/investment-policy';
import { closeProposalValidationSchema, validateCloseProposal } from '@/lib/close-proposal-snapshot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const headers = { ...PRIVATE_HEADERS, 'X-Content-Type-Options': 'nosniff' };
// Use the configured public origin, never an untrusted request Host, for brand assets.
function serverInfo() {
  const origin = new URL(authenticationConfiguration().mcpAudience).origin;
  return { name: 'livestocks-analyst', title: 'LiveStocks', version: '0.1.0',
    websiteUrl: origin,
    icons: [{ src: `${origin}/brand/apple-touch-icon.png`, mimeType: 'image/png', sizes: ['180x180'] }],
  };
}
const versions = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'];
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const securitySchemes = [{ type: 'oauth2', scopes: ['portfolio:read'] }];
const tools = [
  { name: 'find_purchase_date_candidates', description: 'Optional read-only help when a user wants a purchase-date estimate: find the latest daily price-range matches to their USD average cost within a bounded lookback (default 365, max 1825 days). Not evidence of an actual acquisition; store a selected suggestion as estimatedAcquiredOn, never acquiredOn without explicit user confirmation of the actual date. Do not interrupt screenshot sync or ask repeated questions for optional dates.', inputSchema: { type: 'object', properties: { symbol: { type: 'string', minLength: 1, maxLength: 32 }, priceUsd: { type: 'number', exclusiveMinimum: 0 }, lookbackDays: { type: 'integer', minimum: 1, maximum: 1825, default: 365 }, throughDate: { type: 'string', format: 'date' } }, required: ['symbol', 'priceUsd'], additionalProperties: false }, annotations },
  { name: 'prepare_screenshot_sync', description: 'Prepare an owner-bound review link from holdings read by ChatGPT from a user screenshot. Does not write portfolio data. Ask for brokerage account, observation date, exact ticker, quantity, USD fee-inclusive average cost and original acquisition date if known (null if unknown). Existing holdings are updated via non-trading reconciliation checkpoints preserving all past trades. Positive quantities need known cost; explicit zero closes an observed holding without fabricating sale proceeds. Absent rows are never deleted. Historical total profit/tax remain unavailable where execution history is incomplete. User must confirm on the authenticated website.', inputSchema: { type: 'object', properties: { location: { type: 'string', enum: ['bank_one', 'bank_two'] }, observedAt: { type: 'string', format: 'date' }, rows: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', properties: { symbol: { type: 'string' }, quantity: { type: 'number', minimum: 0 }, averageCostUsd: { type: ['number', 'null'] }, acquiredOn: { type: ['string', 'null'], format: 'date' }, estimatedAcquiredOn: { type: ['string', 'null'], format: 'date' } }, required: ['symbol', 'quantity', 'averageCostUsd', 'acquiredOn'], additionalProperties: false } } }, required: ['location', 'observedAt', 'rows'], additionalProperties: false }, annotations: { ...annotations, idempotentHint: false } },
  { name: 'get_profile', description: 'Read the stable identity of the authenticated LiveStocks account.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, outputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, _meta: { 'openai/profile': true }, annotations },
  { name: 'get_research_brief', description: 'Read the binding investment research rules before analyzing LiveStocks: BUY new stocks only, SELL full holdings only, broad-market primary-source research and no execution.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations },
  { name: 'get_portfolio_snapshot', description: 'Read only the authenticated user’s LiveStocks portfolio, active holdings across their brokerage accounts, lots, plans, P/L, goals, quote timestamps and quality limitations. GeneratedAt is not market price time.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations },
  { name: 'get_close_pair_proposals', description: 'Read compact server-calculated complete-close groups: one winning stock plus one to three losing stocks, full quantities across accounts, cumulative versus open profit, personal target surplus, quote timestamps and coverage exclusions. These are screening proposals, not sell recommendations. Use for focused group review.', inputSchema: { type: 'object', properties: { maxLosers: { type: 'integer', enum: [1, 3], default: 3 } }, additionalProperties: false }, annotations },
  { name: 'validate_close_proposal', description: 'Recheck a whole selected sell-only group against the newly calculated portfolio snapshot and its fingerprint. No cash budget required. Rejects changed snapshots, absent groups, incomplete quantities or stale snapshot; does not approve research, execute trades or establish quote freshness.', inputSchema: { type: 'object', properties: { snapshotId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, proposalId: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, required: ['snapshotId', 'proposalId'], additionalProperties: false }, annotations },
  { name: 'get_market_quotes', description: 'Get last available Finnhub quote observations for up to 8 stock tickers, including stocks outside the portfolio. This is not a whole-market screener, financial statements, history or news. Check timestamps; unavailable tickers remain unavailable.', inputSchema: { type: 'object', properties: { symbols: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 32 } } }, required: ['symbols'], additionalProperties: false }, annotations },
  { name: 'validate_action_plan', description: 'Check proposed recommendations against current recorded holdings and available cash: BUY only unowned symbols, SELL 100% across all accounts, no duplicate symbols or overspending. Does not research, approve or execute trades. Budget excludes unexecuted sale proceeds; costs are extra.', inputSchema: { type: 'object', properties: { budgetUsd: { type: 'number', minimum: 0 }, actions: { type: 'array', maxItems: 50, items: { type: 'object', properties: { symbol: { type: 'string', minLength: 1, maxLength: 32 }, action: { type: 'string', enum: ['BUY', 'SELL'] }, quantity: { type: 'number', exclusiveMinimum: 0 }, priceUsd: { type: 'number', exclusiveMinimum: 0 } }, required: ['symbol', 'action', 'quantity', 'priceUsd'], additionalProperties: false } } }, required: ['budgetUsd', 'actions'], additionalProperties: false }, annotations },
].map(tool => ({ ...tool, securitySchemes, _meta: { ...('_meta' in tool ? tool._meta : {}), securitySchemes } }));
const rpcSchema = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number().finite()]).optional(), method: z.string(), params: z.record(z.unknown()).optional() });
const empty = z.object({}).strict();
const closeProposalArgs = z.object({ maxLosers: z.union([z.literal(1), z.literal(3)]).default(3) }).strict();
const quoteArgs = z.object({ symbols: z.array(z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9.^=:-]+$/)).min(1).max(8) }).strict();

function json(data: unknown, status = 200) { return Response.json(data, { status, headers }); }
function error(id: string | number | null, code: number, message: string, status = 200) { return json({ jsonrpc: '2.0', id, error: { code, message } }, status); }
async function loadSnapshot(request: Request) {
  const response = await portfolioSnapshot(new Request(new URL('/api/portfolio/ai', request.url), { headers: request.headers }));
  if (response.status === 401 || response.status === 403) throw new AuthenticationError(response.status);
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
async function callTool(name: string, args: unknown, request: Request, principal: Principal) {
  if (name === 'find_purchase_date_candidates') return findPurchaseDateCandidates(purchaseDateCandidatesInputSchema.parse(args));
  if (name === 'prepare_screenshot_sync') return prepareScreenshotSync(principal, screenshotSyncInputSchema.parse(args));
  if (name === 'get_profile') { empty.parse(args); return { id: principal.userId }; }
  if (name === 'get_research_brief') {
    empty.parse(args);
    return { policy: INVESTMENT_POLICY, requiredInvestorInputs: ['available USD cash budget', 'investment horizon', 'risk tolerance'], researchAvailability: 'ChatGPT researches with host web search and opened, cited current sources. No additional research provider, API credential or server-side model is required or bundled. If search or source access is unavailable, disclose the gap and withhold unsupported final recommendations.' };
  }
  if (name === 'get_portfolio_snapshot') { empty.parse(args); return loadSnapshot(request); }
  if (name === 'get_close_pair_proposals') {
    const { maxLosers } = closeProposalArgs.parse(args);
    const snapshot = await loadSnapshot(request);
    const proposals = maxLosers === 1 ? snapshot.closePairOnlyProposals : snapshot.closePairProposals;
    return { snapshotGeneratedAt: snapshot.generatedAt, ...(proposals as object ?? { availability: 'unavailable', proposals: [], unavailableReason: 'Snapshot does not yet contain computed close groups; retry after the data becomes available.' }) };
  }
  if (name === 'validate_close_proposal') {
    const input = closeProposalValidationSchema.parse(args);
    return validateCloseProposal(await loadSnapshot(request), input);
  }
  if (name === 'validate_action_plan') {
    const plan = actionPlanSchema.parse(args);
    return validateActionPlan(await loadSnapshot(request), plan);
  }
  const { symbols } = quoteArgs.parse(args);
  const quotes = [];
  // Bound provider load, preserve one explicit result per candidate, never force refresh.
  for (const symbol of [...new Set(symbols.map(s => s.toUpperCase()))]) {
    const url = new URL('/api/quote', request.url);
    url.searchParams.set('symbol', symbol);
    try {
      const { response, quote } = await withDeadline((async () => {
        const response = await marketQuote(new NextRequest(url, { headers: request.headers }));
        return { response, quote: await response.json() };
      })(), 5000);
      if (response.status === 401 || response.status === 403) throw new AuthenticationError(response.status);
      const validPrice = typeof quote.c === 'number' && Number.isFinite(quote.c) && quote.c > 0;
      const timestamp = typeof quote.t === 'number' && Number.isFinite(quote.t) && quote.t > 0 ? new Date(quote.t * 1000) : null;
      quotes.push(response.ok && validPrice
        ? { symbol, source: 'Finnhub', status: 'last_available', priceUsd: quote.c, dailyChangePerShareUsd: typeof quote.d === 'number' && Number.isFinite(quote.d) ? quote.d : null, marketTimestamp: timestamp && Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null }
        : { symbol, source: 'Finnhub', status: 'unavailable', error: 'Quote unavailable', httpStatus: response.status });
    } catch (failure) {
      if (failure instanceof AuthenticationError) throw failure;
      quotes.push({ symbol, source: 'Finnhub', status: 'unavailable', error: 'Quote source failed or exceeded the 5-second deadline.' });
    }
  }
  return { retrievedAt: new Date().toISOString(), quotes, limitation: 'Last available observations; retrieval time is not market time. USD stock quotes only; verify currency, exchange, corporate actions and ticker identity externally.' };
}

function authFailure(failure: unknown): Response | null {
  const response = authenticationResponse(failure);
  if (response?.status === 401) {
    let mcpAudience: string;
    try { ({ mcpAudience } = authenticationConfiguration()); }
    catch (configurationError) { return authenticationResponse(configurationError) ?? json({ error: 'Authentication is unavailable' }, 503); }
    const metadata = new URL('/.well-known/oauth-protected-resource', mcpAudience).href;
    response.headers.set('WWW-Authenticate', `Bearer resource_metadata="${metadata}", scope="portfolio:read"`);
  }
  return response;
}

export async function POST(request: Request) {
  let principal: Principal;
  try { principal = await requireMcpPrincipal(request); }
  catch (failure) { return authFailure(failure) ?? json({ error: 'Authentication is unavailable' }, 503); }
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
    return result({ protocolVersion: typeof requested === 'string' && versions.includes(requested) ? requested : versions[0], capabilities: { tools: {} }, serverInfo: serverInfo(), instructions: INVESTMENT_POLICY });
  }
  if (rpc.method === 'server/discover') {
    const info = serverInfo();
    return result({ supportedVersions: versions, capabilities: { tools: {} }, serverInfo: info,
      _meta: { 'io.modelcontextprotocol/serverInfo': info }, instructions: INVESTMENT_POLICY });
  }
  if (rpc.method === 'ping') return result({});
  if (rpc.method === 'tools/list') return result({ tools });
  if (rpc.method !== 'tools/call') return error(rpc.id, -32601, 'Method not found.');
  const name = rpc.params?.name;
  if (typeof name !== 'string' || !tools.some(tool => tool.name === name)) return error(rpc.id, -32602, 'Unknown tool.');
  try {
    const value = await callTool(name, rpc.params?.arguments ?? {}, request, principal);
    return result({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, isError: false });
  } catch (failure) {
    const authResponse = authFailure(failure);
    if (authResponse) return authResponse;
    const message = failure instanceof z.ZodError ? 'Invalid tool input or incompatible portfolio data; no recommendation has been validated.' : 'LiveStocks data is temporarily unavailable; retry later. No values have been inferred.';
    return result({ content: [{ type: 'text', text: message }], isError: true });
  }
}

/** Stateless transport: this server does not offer a persistent SSE stream. */
export async function GET(request: Request) {
  try { await requireMcpPrincipal(request); }
  catch (failure) { return authFailure(failure) ?? json({ error: 'Authentication is unavailable' }, 503); }
  return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } });
}
