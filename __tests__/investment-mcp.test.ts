import { z } from 'zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCloseProposalSnapshot } from '@/lib/close-proposal-snapshot';
import type { Position, PositionMetrics } from '@/types';
import { validateActionPlan, actionPlanSchema } from '@/lib/investment-actions';

vi.mock('@/lib/purchase-date-candidates', () => ({ findPurchaseDateCandidates: async () => ({ status: 'no_match', estimated: true, canVerifyAcquisition: false }), purchaseDateCandidatesInputSchema: { parse: (args: unknown) => args } }));
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), quote: vi.fn(), prepare: vi.fn(), review: vi.fn(), confirm: vi.fn(), cancel: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  requireMcpPrincipal: async () => ({ userId: 'auth0|test-user', kind: 'mcp' }),
  authenticationResponse: () => null,
  AuthenticationError: class extends Error {},
  authenticationConfiguration: () => ({ issuer: 'https://tenant.auth0.com/', mcpAudience: 'https://example.com/api/mcp' }),
  PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store, max-age=0' },
}));
vi.mock('@/app/api/portfolio/ai/route', () => ({ GET: mocks.snapshot }));
vi.mock('@/lib/chat-screenshot-sync', () => ({
  prepareChatScreenshotSync: mocks.prepare, reviewChatScreenshotSync: mocks.review, confirmChatScreenshotSync: mocks.confirm, cancelChatScreenshotSync: mocks.cancel,
  SyncScopeRequiredError: class extends Error {}, ChatSyncUnavailableError: class extends Error {},
}));
vi.mock('@/app/api/quote/route', () => ({ GET: mocks.quote }));
import { POST, GET } from '@/app/api/mcp/route';
import { SyncScopeRequiredError } from '@/lib/chat-screenshot-sync';

const snapshot = () => ({
  schemaVersion: 1 as const, generatedAt: new Date().toISOString(),
  holdings: [
    { position: { symbol: 'abc', quantity: 2, location: 'bank_one' } },
    { position: { symbol: 'ABC', quantity: 3, location: 'bank_two' } },
    { position: { symbol: 'OLD', quantity: 8, isHistoricalActivation: true } },
  ],
  plans: [{ symbol: 'NEW' }],
});
const action = (symbol = 'NEW', side: 'BUY' | 'SELL' = 'BUY', quantity = 2, priceUsd = 10) => ({ symbol, action: side, quantity, priceUsd });
const request = (method: string, params?: object, extraHeaders?: Record<string, string>) => new Request('https://example.com/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer signed-test-token', ...extraHeaders }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
async function call(name: string, args: object = {}) {
  const response = await POST(request('tools/call', { name, arguments: args }));
  return (await response.json()).result;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.snapshot.mockImplementation(async () => Response.json(snapshot()));
  mocks.quote.mockImplementation(async () => Response.json({ c: 10, t: 1794000000, d: 1 }));
});

describe('investment action constraints', () => {
  it('allows a new BUY even if planned or previously closed, and a full aggregated SELL', () => {
    expect(validateActionPlan(snapshot(), { budgetUsd: 20, actions: [action(), action('ABC', 'SELL', 5)] }).valid).toBe(true);
    expect(validateActionPlan(snapshot(), { budgetUsd: 80, actions: [action('OLD', 'BUY', 8)] }).valid).toBe(true);
  });
  it('forbids adding to a current holding and forbids a partial sale across accounts', () => {
    const result = validateActionPlan(snapshot(), { budgetUsd: 100, actions: [action(' ABC '), action('abc', 'SELL', 2)] });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('already held');
    expect(result.errors.join(' ')).toContain('100% across all accounts (5 shares)');
    expect(result.errors.join(' ')).toContain('duplicate');
  });
  it('does not fund new buys with unexecuted gross sales', () => {
    const result = validateActionPlan(snapshot(), { budgetUsd: 0, actions: [action('ABC', 'SELL', 5, 100), action()] });
    expect(result.valid).toBe(false);
    expect(result.estimatedGrossSaleProceedsUsd).toBe(500);
    expect(result.errors.join(' ')).toContain('unexecuted sale proceeds');
  });
  it('supports no action and blocks sales of absent holdings, stale snapshots and non-finite sums', () => {
    expect(validateActionPlan(snapshot(), { budgetUsd: 0, actions: [] }).valid).toBe(true);
    expect(validateActionPlan(snapshot(), { budgetUsd: 0, actions: [action('MISSING', 'SELL')] }).valid).toBe(false);
    expect(validateActionPlan({ ...snapshot(), generatedAt: '2020-01-01T00:00:00.000Z' }, { budgetUsd: 100, actions: [action()] }).valid).toBe(false);
    expect(validateActionPlan(snapshot(), { budgetUsd: 100, actions: [action('NEW', 'BUY', 1e308, 1e308)] }).valid).toBe(false);
  });
  it('rejects zero/negative quantities, invalid actions and caller-supplied holdings', () => {
    expect(actionPlanSchema.safeParse({ budgetUsd: 100, actions: [action('ABC', 'SELL', 0)] }).success).toBe(false);
    expect(actionPlanSchema.safeParse({ budgetUsd: -1, actions: [] }).success).toBe(false);
    expect(actionPlanSchema.safeParse({ budgetUsd: 100, actions: [{ ...action(), action: 'HOLD' }] }).success).toBe(false);
    expect(actionPlanSchema.safeParse({ budgetUsd: 100, actions: [], holdings: [] }).success).toBe(false);
  });
});

describe('read-only MCP transport and tools', () => {
  it.each(['http_header', 'request_metadata'])('satisfies the 2026 per-request resource contract with private immediately-stale cache hints (%s)', async transport => {
    const resourceUri = 'ui://livestocks/screenshot-sync-v4.html';
    const raw = await POST(request('resources/read', { uri: resourceUri, ...(transport === 'request_metadata' ? { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } : {}) }, transport === 'http_header' ? { 'mcp-protocol-version': '2026-07-28' } : undefined));
    const envelope = await raw.json();
    const hostReadContract = z.object({ resultType: z.literal('complete'), ttlMs: z.number().int().nonnegative(), cacheScope: z.enum(['private', 'public']), contents: z.array(z.object({ uri: z.string(), mimeType: z.string(), text: z.string() })) });
    expect(hostReadContract.safeParse(envelope.result).success).toBe(true);
    expect(envelope.result).toMatchObject({ resultType: 'complete', ttlMs: 0, cacheScope: 'private' });
    expect(raw.headers.get('cache-control')).toContain('private, no-store');
    expect(envelope.result.contents[0].uri).toBe(resourceUri);
    expect(envelope.result.contents[0].text).not.toContain('private-app-capability');
  });
  it.each(['tools/list', 'resources/list', 'resources/templates/list', 'server/discover'])('emits the required 2026 caching envelope for %s', async method => {
    const modern = (await (await POST(request(method, { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } }))).json()).result;
    expect(modern).toMatchObject({ resultType: 'complete', ttlMs: 0, cacheScope: 'private' });
    const legacy = (await (await POST(request(method, undefined, { 'mcp-protocol-version': '2025-11-25' }))).json()).result;
    expect(legacy).not.toHaveProperty('ttlMs');
    expect(legacy).not.toHaveProperty('cacheScope');
    expect(legacy).not.toHaveProperty('resultType');
  });
  it('supports per-request legacy metadata and never puts cache hints on tool invocation results', async () => {
    const legacy = (await (await POST(request('resources/read', { uri: 'ui://livestocks/screenshot-sync-v4.html', _meta: { 'io.modelcontextprotocol/protocolVersion': '2025-11-25' } }))).json()).result;
    expect(legacy).not.toHaveProperty('ttlMs'); expect(legacy).not.toHaveProperty('resultType');
    const modernTool = await call('get_profile');
    expect(modernTool.resultType).toBe('complete');
    expect(modernTool).not.toHaveProperty('ttlMs'); expect(modernTool).not.toHaveProperty('cacheScope');
  });
  it('keeps the final capability out of model-visible content and serves an inline resource', async () => {
    mocks.prepare.mockResolvedValueOnce({ value: { proposalId: 'review-id', status: 'pending', plan: { canApply: true } }, meta: { confirmationSecret: 'private-app-capability' } });
    const prepared = await call('prepare_screenshot_sync', {});
    expect(prepared._meta.confirmationSecret).toBe('private-app-capability');
    expect(JSON.stringify(prepared.structuredContent)).not.toContain('private-app-capability');
    expect(JSON.stringify(prepared.content)).not.toContain('private-app-capability');
    const listed = (await (await POST(request('tools/list'))).json()).result.tools;
    const confirm = listed.find((tool: { name: string }) => tool.name === 'confirm_screenshot_sync');
    expect(confirm).toMatchObject({ securitySchemes: [{ type: 'oauth2', scopes: ['portfolio:read', 'portfolio:sync'] }], _meta: { ui: { visibility: ['app'] } }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true } });
    const resources = (await (await POST(request('resources/list'))).json()).result.resources;
    expect(resources).toHaveLength(1);
    const resource = (await (await POST(request('resources/read', { uri: resources[0].uri }))).json()).result.contents[0];
    expect(resource.mimeType).toBe('text/html;profile=mcp-app');
    expect(resource.text).toContain('אישור וסנכרון');
    expect(resource.text).not.toContain('private-app-capability');
    expect(resource._meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [] });
  });
  it('challenges an old read-only grant for explicit sync consent instead of writing', async () => {
    mocks.prepare.mockRejectedValueOnce(new SyncScopeRequiredError());
    const result = await call('prepare_screenshot_sync', {});
    expect(result.isError).toBe(true);
    expect(result._meta['mcp/www_authenticate'][0]).toContain('error="insufficient_scope"');
    expect(result._meta['mcp/www_authenticate'][0]).toContain('scope="portfolio:read portfolio:sync"');
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('forwards app confirmation without exposing an editable trade payload', async () => {
    const args = { proposalId: 'stored-id', confirmationSecret: 'private-app-capability' };
    mocks.confirm.mockResolvedValueOnce({ proposalId: 'stored-id', status: 'applied', applied: true });
    expect((await call('confirm_screenshot_sync', args)).structuredContent).toMatchObject({ applied: true, status: 'applied' });
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mcp' }), args);
    const response = await POST(request('resources/read', { uri: 'ui://other' }));
    expect((await response.json()).error.code).toBe(-32602);
  });

  it('negotiates initialization, discovery and read-only research plus restricted ChatGPT sync tools', async () => {
    const init = await (await POST(request('initialize', { protocolVersion: '2025-11-25' }))).json();
    expect(init.result.protocolVersion).toBe('2025-11-25');
    expect(init.result.instructions).toContain('SELL 100%');
    expect(init.result.serverInfo).toMatchObject({ name: 'livestocks-analyst', title: 'LiveStocks',
      icons: [{ src: 'https://example.com/brand/apple-touch-icon.png', mimeType: 'image/png', sizes: ['180x180'] }] });
    const listed = await (await POST(request('tools/list'))).json();
    expect(listed.result.tools).toHaveLength(12);
    expect(listed.result.tools.filter((tool: { annotations: { readOnlyHint: boolean } }) => !tool.annotations.readOnlyHint).map((tool: { name: string }) => tool.name).sort()).toEqual(['cancel_screenshot_sync', 'confirm_screenshot_sync', 'prepare_screenshot_sync']);
    const discovery = (await (await POST(request('server/discover'))).json()).result;
    expect(discovery.supportedVersions).toContain('2026-07-28');
    expect(discovery._meta['io.modelcontextprotocol/serverInfo']).toEqual(init.result.serverInfo);
    expect((await GET(new Request('https://example.com/api/mcp'))).status).toBe(405);
  });
  it('advertises brand assets from configured origin even with a different request host', async () => {
    const req = new Request('https://untrusted.example/api/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer signed-test-token' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    const { result } = await (await POST(req)).json();
    expect(result.serverInfo.icons[0].src).toBe('https://example.com/brand/apple-touch-icon.png');
  });
  it('exposes the bound account identity as structured profile content', async () => {
    const result = await call('get_profile');
    expect(result.structuredContent).toEqual({ id: 'auth0|test-user' });
    const listed = await (await POST(request('tools/list'))).json();
    const profile = listed.result.tools.find((tool: { name: string }) => tool.name === 'get_profile');
    expect(profile._meta['openai/profile']).toBe(true);
    expect(profile.securitySchemes).toEqual([{ type: 'oauth2', scopes: ['portfolio:read'] }]);
  });
  it('returns the entire snapshot and retains timestamps/unknown fields without inventing data', async () => {
    const result = await call('get_portfolio_snapshot');
    const data = JSON.parse(result.content[0].text);
    expect(data.holdings).toHaveLength(3);
    expect(data.plans).toEqual([{ symbol: 'NEW' }]);
    expect(result.isError).toBe(false);
  });
  it('returns explicit unavailable close proposals from an older cached schema and rejects invented groups without a budget', async () => {
    const data = JSON.parse((await call('get_close_pair_proposals')).content[0].text);
    expect(data.availability).toBe('unavailable');
    const validation = JSON.parse((await call('validate_close_proposal', { snapshotId: '0'.repeat(64), proposalId: '1'.repeat(64) })).content[0].text);
    expect(validation.valid).toBe(false);
    expect((await call('validate_close_proposal', { snapshotId: '0'.repeat(64), proposalId: '1'.repeat(64), budgetUsd: 0 })).isError).toBe(true);
  });
  it('serves exact pair/group modes and validates only server-owned complete groups', async () => {
    const asOf = Date.now();
    const positions = [{ symbol: 'WIN', quantity: 10 }, { symbol: 'LOSS', quantity: 10 }].map(position => ({ ...position, entryPrice: 100, entryDate: new Date(asOf - 60 * 86400000).toISOString(), location: 'bank_one', display: position.symbol, imageUrl: '' })) as Position[];
    const quotes = { WIN: { priceUsd: 150, marketTimestamp: new Date(asOf).toISOString(), source: 'test', status: 'last_available' }, LOSS: { priceUsd: 90, marketTimestamp: new Date(asOf).toISOString(), source: 'test', status: 'last_available' } };
    const metrics = positions.map(position => ({ position, currentPrice: quotes[position.symbol as keyof typeof quotes].priceUsd })) as PositionMetrics[];
    const input = { positions, metrics, quotes, annualGrowthRate: 0.05, asOf };
    const grouped = buildCloseProposalSnapshot(input);
    const paired = buildCloseProposalSnapshot({ ...input, maxLosers: 1 });
    mocks.snapshot.mockImplementation(async () => Response.json({ schemaVersion: 1, generatedAt: new Date(asOf).toISOString(), holdings: positions.map(position => ({ position })), closePairProposals: grouped, closePairOnlyProposals: paired }));
    const data = JSON.parse((await call('get_close_pair_proposals', { maxLosers: 1 })).content[0].text);
    expect(data.snapshotId).toBe(paired.snapshotId);
    expect(data.snapshotId).not.toBe(grouped.snapshotId);
    expect(data.policy.maxLosers).toBe(1);
    const args = { snapshotId: paired.snapshotId, proposalId: paired.proposals[0].proposalId };
    expect(JSON.parse((await call('validate_close_proposal', args)).content[0].text).valid).toBe(true);
    expect((await call('get_close_pair_proposals', { maxLosers: 2 })).isError).toBe(true);
    expect(JSON.parse((await call('validate_close_proposal', { ...args, snapshotId: grouped.snapshotId })).content[0].text).valid).toBe(false);
  });
  it('validates against server-loaded holdings and not input from the caller', async () => {
    const result = await call('validate_action_plan', { budgetUsd: 100, actions: [action('ABC', 'SELL', 2)] });
    expect(JSON.parse(result.content[0].text).valid).toBe(false);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
  });
  it('deduplicates candidate quotes and never forwards arbitrary token or force-refresh args', async () => {
    const result = await call('get_market_quotes', { symbols: ['new', 'NEW', 'XYZ'] });
    expect(JSON.parse(result.content[0].text).quotes).toHaveLength(2);
    expect(JSON.parse(result.content[0].text).quotes[0]).toMatchObject({ priceUsd: 10, dailyChangePerShareUsd: 1, marketTimestamp: new Date(1794000000 * 1000).toISOString() });
    expect(mocks.quote).toHaveBeenCalledTimes(2);
    const quoteRequest = mocks.quote.mock.calls[0][0] as Request;
    expect(quoteRequest.url).toBe('https://example.com/api/quote?symbol=NEW');
    expect(quoteRequest.headers.get('authorization')).toBe('Bearer signed-test-token');
    expect((await call('get_market_quotes', { symbols: ['NEW'], token: 'fake' })).isError).toBe(true);
    expect((await call('get_market_quotes', { symbols: ['https://evil.test'] })).isError).toBe(true);
  });
  it('preserves explicit upstream quote failures and portfolio failures without leaked errors', async () => {
    mocks.quote.mockResolvedValue(Response.json({ error: 'secret provider details' }, { status: 429 }));
    const quotes = JSON.parse((await call('get_market_quotes', { symbols: ['NEW'] })).content[0].text).quotes;
    expect(quotes[0]).toMatchObject({ status: 'unavailable', httpStatus: 429 });
    expect(JSON.stringify(quotes)).not.toContain('secret');
    mocks.snapshot.mockResolvedValue(Response.json({ error: 'private internals' }, { status: 500 }));
    const result = await call('get_portfolio_snapshot');
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private internals');
  });
  it('returns a bounded unavailable quote when the provider stalls', async () => {
    vi.useFakeTimers();
    try {
      mocks.quote.mockReturnValue(new Promise(() => {}));
      const pending = call('get_market_quotes', { symbols: ['NEW'] });
      await vi.advanceTimersByTimeAsync(5000);
      const data = JSON.parse((await pending).content[0].text);
      expect(data.quotes[0].status).toBe('unavailable');
      expect(data.quotes[0].error).toContain('deadline');
    } finally { vi.useRealTimers(); }
  });
  it('rejects unknown methods/tools, untrusted origins, malformed messages and oversized input', async () => {
    expect((await (await POST(request('execute_trade'))).json()).error.code).toBe(-32601);
    expect((await (await POST(request('tools/call', { name: 'execute_trade' }))).json()).error.code).toBe(-32602);
    expect((await POST(request('tools/list', {}, { origin: 'https://evil.test' }))).status).toBe(403);
    expect((await POST(request('tools/list', {}, { 'mcp-protocol-version': 'unknown' }))).status).toBe(400);
    expect((await POST(new Request('https://example.com/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }))).status).toBe(400);
    expect((await POST(request('tools/list', { padding: 'x'.repeat(66000) }))).status).toBe(413);
  });
  it('accepts notifications without a response body', async () => {
    const response = await POST(new Request('https://example.com/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('');
  });
});
