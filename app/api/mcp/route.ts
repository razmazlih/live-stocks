import { requireMcpPrincipal, authenticationResponse, AuthenticationError, authenticationConfiguration, PRIVATE_HEADERS, type Principal } from '@/lib/auth/server';
import { reviewChatScreenshotSync, cancelChatScreenshotSync, SyncScopeRequiredError, ChatSyncUnavailableError } from '@/lib/chat-screenshot-sync';
import { ChatTransactionPlanError } from '@/lib/chat-transactions';
import { prepareChatTransaction, reviewChatTransaction, confirmChatTransaction, cancelChatTransaction, TransactionScopeRequiredError, ChatTransactionUnavailableError } from '@/lib/chat-transaction-server';
import { CHAT_SYNC_RESOURCE_URI, CHAT_SYNC_RESOURCE_MIME, CHAT_SYNC_APP_HTML } from '@/lib/chat-sync-app';
import { findPurchaseDateCandidates, purchaseDateCandidatesInputSchema } from '@/lib/purchase-date-candidates';
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
// MCP 2026-07-28 requires protocol-level cache hints in addition to HTTP headers.
// Match the official SDK conservative defaults: immediately stale, never shared.
const cacheableMethods = new Set(['tools/list', 'prompts/list', 'resources/list', 'resources/templates/list', 'resources/read', 'server/discover']);
const securitySchemes = [{ type: 'oauth2', scopes: ['portfolio:read'] }];
const transactionSecuritySchemes = [{ type: 'oauth2', scopes: ['portfolio:read', 'portfolio:transactions'] }];
const syncResourceMeta = { ui: { resourceUri: CHAT_SYNC_RESOURCE_URI }, 'openai/outputTemplate': CHAT_SYNC_RESOURCE_URI };
const confirmationInput = { type: 'object', properties: { proposalId: { type: 'string', format: 'uuid' }, confirmationSecret: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } }, required: ['proposalId', 'confirmationSecret'], additionalProperties: false };
const tools = [
  { name: 'prepare_chat_transaction', description: 'Record a BUY or SELL the user explicitly reports as already executed; no screenshot required. NEVER use for an investment idea, recommendation or broker order. Ask once only for missing ticker, quantity, execution price in USD, execution date and account; do not invent these. Read get_portfolio_snapshot.sources, auto-select its only active source; clarify an ambiguous account by name. Existing-stock purchases and partial or full sales are allowed when recording actual executions; research recommendation restrictions remain unchanged. A known commissionUsd is required before preparation: ask for the actual USD fee or explicit confirmation of no fee (0). Never infer zero or use null. This records ordinary BUY/SELL lots with the same FIFO, net profit and personal-target calculations and website edit/delete controls as manual entries. Never use screenshot balance reconciliation. Prepare a 15-minute immutable review only. Requires separate optional portfolio:transactions consent; existing read or screenshot-sync permission is insufficient. Only the user clicking the embedded card can confirm. Never call confirm or claim saved before its receipt; keep chat reply brief, friendly and in the user language.', inputSchema: { type: 'object', properties: { location: { type: 'string', format: 'uuid' }, side: { type: 'string', enum: ['BUY','SELL'] }, symbol: { type: 'string', minLength: 1, maxLength: 32 }, quantity: { type: 'number', exclusiveMinimum: 0 }, priceUsd: { type: 'number', exclusiveMinimum: 0 }, executedOn: { type: 'string', format: 'date', description: 'Actual execution calendar date supplied by the user. Resolve today/yesterday from the user date context; never invent a missing date.' }, commissionUsd: { type: ['number','null'], minimum: 0 } }, required: ['location','side','symbol','quantity','priceUsd','executedOn','commissionUsd'], additionalProperties: false }, securitySchemes: transactionSecuritySchemes, _meta: syncResourceMeta, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } },
  { name: 'review_chat_transaction', description: 'Read a stored already-executed BUY/SELL review and its status; no portfolio mutation. Corrections require a new prepare_chat_transaction review.', inputSchema: { type: 'object', properties: { proposalId: { type: 'string', format: 'uuid' } }, required: ['proposalId'], additionalProperties: false }, annotations: { ...annotations, openWorldHint: false } },
  { name: 'confirm_chat_transaction', description: 'APP ONLY. After the user clicks the embedded confirmation button, record exactly the stored already-executed BUY/SELL transaction once and return the saved portfolio. No broker orders, editable trade fields or model confirmation.', inputSchema: confirmationInput, securitySchemes: transactionSecuritySchemes, _meta: { ui: { visibility: ['app'] }, 'openai/widgetAccessible': true }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
  { name: 'cancel_chat_transaction', description: 'APP ONLY. Cancel only the stored pending transaction review shown in the embedded card. No trade or holding changes.', inputSchema: confirmationInput, _meta: { ui: { visibility: ['app'] }, 'openai/widgetAccessible': true }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'review_screenshot_sync', description: 'Read the exact immutable before/after screenshot proposal already presented in the ChatGPT review card, including status and expiry. Does not confirm or mutate holdings. Corrections require prepare_screenshot_sync with previousProposalId, which invalidates the previous pending review.', inputSchema: { type: 'object', properties: { proposalId: { type: 'string', format: 'uuid' } }, required: ['proposalId'], additionalProperties: false }, annotations: { ...annotations, openWorldHint: false } },
  { name: 'cancel_screenshot_sync', description: 'Cancel only the pending proposal shown in this embedded ChatGPT review card. Does not modify holdings. Requires the app-private confirmation capability; cancelled proposals cannot later apply.', inputSchema: confirmationInput, _meta: { ui: { visibility: ['app'] }, 'openai/widgetAccessible': true }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  { name: 'find_purchase_date_candidates', description: 'Optional read-only help when a user wants a purchase-date estimate: find the latest daily price-range matches to their USD average cost within a bounded lookback (default 365, max 1825 days). Not evidence of an actual acquisition; store a selected suggestion as estimatedAcquiredOn, never acquiredOn without explicit user confirmation of the actual date. Do not interrupt screenshot sync or ask repeated questions for optional dates.', inputSchema: { type: 'object', properties: { symbol: { type: 'string', minLength: 1, maxLength: 32 }, priceUsd: { type: 'number', exclusiveMinimum: 0 }, lookbackDays: { type: 'integer', minimum: 1, maximum: 1825, default: 365 }, throughDate: { type: 'string', format: 'date' } }, required: ['symbol', 'priceUsd'], additionalProperties: false }, annotations },
  { name: 'get_profile', description: 'Read the stable identity of the authenticated LiveStocks account.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, outputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, _meta: { 'openai/profile': true }, annotations },
  { name: 'get_research_brief', description: 'Read the binding investment research rules before analyzing LiveStocks: BUY new stocks only, SELL full holdings only, broad-market primary-source research and no execution.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations },
  { name: 'get_portfolio_snapshot', description: 'Read only the authenticated user’s LiveStocks portfolio, active holdings across their brokerage accounts, source catalog (including empty sources), lots, plans, P/L, goals, quote timestamps and quality limitations. GeneratedAt is not market price time.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations },
  { name: 'get_close_pair_proposals', description: 'Read compact server-calculated complete-close groups: one winning stock plus one to three losing stocks, full quantities across accounts, cumulative versus open profit, personal target surplus, quote timestamps and coverage exclusions. These are screening proposals, not sell recommendations. Use for focused group review.', inputSchema: { type: 'object', properties: { maxLosers: { type: 'integer', enum: [1, 3], default: 3 } }, additionalProperties: false }, annotations },
  { name: 'validate_close_proposal', description: 'Recheck a whole selected sell-only group against the newly calculated portfolio snapshot and its fingerprint. No cash budget required. Rejects changed snapshots, absent groups, incomplete quantities or stale snapshot; does not approve research, execute trades or establish quote freshness.', inputSchema: { type: 'object', properties: { snapshotId: { type: 'string', pattern: '^[a-f0-9]{64}$' }, proposalId: { type: 'string', pattern: '^[a-f0-9]{64}$' } }, required: ['snapshotId', 'proposalId'], additionalProperties: false }, annotations },
  { name: 'get_market_quotes', description: 'Get last available Finnhub quote observations for up to 8 stock tickers, including stocks outside the portfolio. This is not a whole-market screener, financial statements, history or news. Check timestamps; unavailable tickers remain unavailable.', inputSchema: { type: 'object', properties: { symbols: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string', minLength: 1, maxLength: 32 } } }, required: ['symbols'], additionalProperties: false }, annotations },
  { name: 'validate_action_plan', description: 'Check proposed recommendations against current recorded holdings and available cash: BUY only unowned symbols, SELL 100% across all accounts, no duplicate symbols or overspending. Does not research, approve or execute trades. Budget excludes unexecuted sale proceeds; costs are extra.', inputSchema: { type: 'object', properties: { budgetUsd: { type: 'number', minimum: 0 }, actions: { type: 'array', maxItems: 50, items: { type: 'object', properties: { symbol: { type: 'string', minLength: 1, maxLength: 32 }, action: { type: 'string', enum: ['BUY', 'SELL'] }, quantity: { type: 'number', exclusiveMinimum: 0 }, priceUsd: { type: 'number', exclusiveMinimum: 0 } }, required: ['symbol', 'action', 'quantity', 'priceUsd'], additionalProperties: false } } }, required: ['budgetUsd', 'actions'], additionalProperties: false }, annotations },
].map(tool => {
  const schemes = 'securitySchemes' in tool && tool.securitySchemes ? tool.securitySchemes : securitySchemes;
  return { ...tool, securitySchemes: schemes, _meta: { ...('_meta' in tool ? tool._meta : {}), securitySchemes: schemes } };
});
const rpcSchema = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number().finite()]).optional(), method: z.string(), params: z.record(z.unknown()).optional() });
const empty = z.object({}).strict();
const closeProposalArgs = z.object({ maxLosers: z.union([z.literal(1), z.literal(3)]).default(3) }).strict();
const quoteArgs = z.object({ symbols: z.array(z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9.^=:-]+$/)).min(1).max(8) }).strict();

function json(data: unknown, status = 200, extraHeaders?: Record<string, string>) { return Response.json(data, { status, headers: { ...headers, ...extraHeaders } }); }
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
class ChatToolOutput {
  constructor(public value: object, public meta?: Record<string, unknown>) {}
}
async function callTool(name: string, args: unknown, request: Request, principal: Principal) {
  if (name === 'prepare_chat_transaction') { const prepared = await prepareChatTransaction(principal, args); return new ChatToolOutput(prepared.value, prepared.meta); }
  if (name === 'review_chat_transaction') return reviewChatTransaction(principal, args);
  if (name === 'confirm_chat_transaction') return confirmChatTransaction(principal, args);
  if (name === 'cancel_chat_transaction') return cancelChatTransaction(principal, args);
  if (name === 'find_purchase_date_candidates') return findPurchaseDateCandidates(purchaseDateCandidatesInputSchema.parse(args));
  if (name === 'review_screenshot_sync') return reviewChatScreenshotSync(principal, args);
  if (name === 'cancel_screenshot_sync') return cancelChatScreenshotSync(principal, args);
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

function authFailure(failure: unknown, request?: Request): Response | null {
  const response = authenticationResponse(failure);
  if (response?.status === 401) {
    let mcpAudience: string;
    try { ({ mcpAudience } = authenticationConfiguration()); }
    catch (configurationError) { return authenticationResponse(configurationError) ?? json({ error: 'Authentication is unavailable' }, 503); }
    const metadata = new URL('/.well-known/oauth-protected-resource', mcpAudience).href;
    response.headers.set('WWW-Authenticate', `Bearer resource_metadata="${metadata}"${request?.headers.has('authorization') ? ', error="invalid_token"' : ''}`);
  }
  return response;
}

export async function POST(request: Request) {
  let principal: Principal;
  try { principal = await requireMcpPrincipal(request); }
  catch (failure) { return authFailure(failure, request) ?? json({ error: 'Authentication is unavailable' }, 503); }
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
  // Stateless 2026 clients carry the revision in params._meta; older HTTP
  // clients use MCP-Protocol-Version. With neither, use our advertised default.
  const requestMeta = rpc.params?._meta;
  const envelopeVersion = requestMeta && typeof requestMeta === 'object' && !Array.isArray(requestMeta)
    ? (requestMeta as Record<string, unknown>)['io.modelcontextprotocol/protocolVersion'] : undefined;
  const requestedVersion = protocol ?? (typeof envelopeVersion === 'string' ? envelopeVersion : undefined)
    ?? (rpc.method === 'initialize' && typeof rpc.params?.protocolVersion === 'string' ? rpc.params.protocolVersion : versions[0]);
  const modern = requestedVersion === '2026-07-28';
  const result = (value: object, extraHeaders?: Record<string, string>, status = 200) => json({ jsonrpc: '2.0', id: rpc.id,
    result: modern ? { ...value, resultType: 'complete', ...(cacheableMethods.has(rpc.method) ? { ttlMs: 0, cacheScope: 'private' } : {}) } : value }, status, extraHeaders);
  if (rpc.method === 'initialize') {
    const requested = rpc.params?.protocolVersion;
    return result({ protocolVersion: typeof requested === 'string' && versions.includes(requested) ? requested : versions[0], capabilities: { tools: {}, resources: {} }, serverInfo: serverInfo(), instructions: INVESTMENT_POLICY });
  }
  if (rpc.method === 'server/discover') {
    const info = serverInfo();
    return result({ supportedVersions: versions, capabilities: { tools: {}, resources: {} }, serverInfo: info,
      _meta: { 'io.modelcontextprotocol/serverInfo': info }, instructions: INVESTMENT_POLICY });
  }
  if (rpc.method === 'ping') return result({});
  if (rpc.method === 'resources/templates/list') return result({ resourceTemplates: [] });
  if (rpc.method === 'resources/list') return result({ resources: [{ uri: CHAT_SYNC_RESOURCE_URI, name: 'LiveStocks transaction review', mimeType: CHAT_SYNC_RESOURCE_MIME }] });
  if (rpc.method === 'resources/read') {
    const resourceUri = rpc.params?.uri;
    // Existing ChatGPT connections may still cache the previous tool template.
    if (resourceUri !== CHAT_SYNC_RESOURCE_URI && resourceUri !== 'ui://livestocks/screenshot-sync-v4.html') return error(rpc.id, -32602, 'Unknown resource.');
    return result({ contents: [{ uri: resourceUri, mimeType: CHAT_SYNC_RESOURCE_MIME, text: CHAT_SYNC_APP_HTML,
      _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true }, 'openai/widgetCSP': { connect_domains: [], resource_domains: [] }, 'openai/widgetDescription': 'Review and confirm an already-executed LiveStocks purchase or sale without leaving ChatGPT.' } }] });
  }
  if (rpc.method === 'tools/list') return result({ tools });
  if (rpc.method !== 'tools/call') return error(rpc.id, -32601, 'Method not found.');
  const name = rpc.params?.name;
  if (name === 'prepare_screenshot_sync' || name === 'confirm_screenshot_sync') return result({ isError: true, content: [{ type: 'text', text: 'Balance reconciliation is retired. Record actual executions with prepare_chat_transaction, using the actual BUY/SELL, ticker, account, quantity, execution price/date and known fee (explicit 0 for no fee). A holdings screenshot or average cost alone is insufficient; ask for missing execution details. No portfolio changes were made.' }] });
  if (typeof name !== 'string' || !tools.some(tool => tool.name === name)) return error(rpc.id, -32602, 'Unknown tool.');
  try {
    const value = await callTool(name, rpc.params?.arguments ?? {}, request, principal);
    const payload = value instanceof ChatToolOutput ? value.value : value;
    const meta = value instanceof ChatToolOutput ? value.meta : undefined;
    return result({ content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: payload, ...(meta ? { _meta: meta } : {}), isError: false });
  } catch (failure) {
    if (failure instanceof SyncScopeRequiredError || failure instanceof TransactionScopeRequiredError) {
      const audience = authenticationConfiguration().mcpAudience;
      const metadata = new URL('/.well-known/oauth-protected-resource', audience).href;
      const requiredScope = failure instanceof TransactionScopeRequiredError ? 'portfolio:transactions' : 'portfolio:sync';
      const challenge = `Bearer resource_metadata="${metadata}", error="insufficient_scope", scope="portfolio:read ${requiredScope}"`;
      // Apps hosts consume the tool-result hint; HTTP clients can inspect the same
      // challenge without misclassifying a valid read token as expired.
      return result({ isError: true, content: [{ type: 'text', text: failure.message }],
        _meta: { 'mcp/www_authenticate': [challenge] } }, { 'WWW-Authenticate': challenge }, modern ? 403 : 200);
    }
    if (failure instanceof ChatSyncUnavailableError || failure instanceof ChatTransactionUnavailableError || failure instanceof ChatTransactionPlanError) return result({ isError: true, content: [{ type: 'text', text: failure.message }] });
    const authResponse = authFailure(failure, request);
    if (authResponse) return authResponse;
    const message = failure instanceof z.ZodError ? 'Invalid tool input or incompatible portfolio data; no recommendation has been validated.' : 'LiveStocks data is temporarily unavailable; retry later. No values have been inferred.';
    return result({ content: [{ type: 'text', text: message }], isError: true });
  }
}

/** Stateless transport: this server does not offer a persistent SSE stream. */
export async function GET(request: Request) {
  try { await requireMcpPrincipal(request); }
  catch (failure) { return authFailure(failure, request) ?? json({ error: 'Authentication is unavailable' }, 503); }
  return new Response(null, { status: 405, headers: { ...headers, Allow: 'POST' } });
}
