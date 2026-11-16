// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), runtime: vi.fn(), session: vi.fn(), signout: vi.fn(), service: { status: vi.fn(), start: vi.fn(), challenge: vi.fn(), prove: vi.fn(), confirm: vi.fn(), resume: vi.fn(), cancel: vi.fn(), runPending: vi.fn(), recoverable: vi.fn() } }));
vi.mock('@/lib/account-linking/runtime', () => ({ accountMergeEnabled: mocks.enabled, createAccountMergeRuntime: mocks.runtime, mergeSession: mocks.session }));
vi.mock('@/lib/auth/better-auth', () => ({ signOutBetterAuth: mocks.signout }));
vi.mock('@/lib/auth/server', () => ({ PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store' }, AuthenticationError: class extends Error { status = 403; }, requireSameOrigin: (r: Request) => {
  if (r.headers.get('origin') !== 'https://app.test' || r.headers.get('sec-fetch-site') === 'cross-site') throw Object.assign(Error('Invalid origin'), { status: 403 });
} }));
import { handleAccountMerge, handleAccountMergeRecovery, handleAccountMergeWorker, handleAccountMergeRecoveryStatus } from '@/lib/account-linking/http';
const id = 'a0000000-0000-4000-8000-000000000001', capability = id + '.' + 'a'.repeat(43);
const cookie = 'livestocks_account_merge=' + capability;
function request(action = 'status', body?: object, headers: Record<string, string> = {}) {
  return new Request('https://app.test/api/account/link/' + action, { method: body ? 'POST' : 'GET', headers: { origin: 'https://app.test', 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('APP_BASE_URL', 'https://app.test'); mocks.enabled.mockReturnValue(true); mocks.runtime.mockReturnValue(mocks.service);
  mocks.session.mockResolvedValue({ subject: 'A', sessionId: 'sid', createdAt: Date.now(), emailHash: 'a'.repeat(64), method: 'google' });
});
afterEach(() => vi.unstubAllEnvs());
describe('account merge HTTP boundaries', () => {
  it('keeps all actions and scheduler disabled by default without opening storage', async () => {
    mocks.enabled.mockReturnValue(false);
    expect(await (await handleAccountMerge(request(), 'status')).json()).toEqual({ available: false });
    expect((await handleAccountMerge(request('start', {}), 'start')).status).toBe(503);
    expect((await handleAccountMergeWorker(request('worker', {}))).status).toBe(503);
    expect(mocks.runtime).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it('rejects cross-origin mutations before calling storage', async () => {
    expect((await handleAccountMerge(request('start', { candidateId: 'x' }, { origin: 'https://evil.test' }), 'start')).ok).toBe(false);
    expect(mocks.runtime).not.toHaveBeenCalled();
  });
  it('sets a host-only HttpOnly secure scoped capability and never returns it in JSON or navigation', async () => {
    mocks.service.start.mockResolvedValue({ capability, status: { available: true, candidates: [], linkedMethods: ['google'], operation: null } });
    const response = await handleAccountMerge(request('start', { candidateId: 'opaque' }), 'start');
    expect(response.headers.get('set-cookie')).toContain('HttpOnly; SameSite=Lax; Secure');
    expect(response.headers.get('set-cookie')).toContain('Path=/api/account/link');
    expect(response.headers.get('set-cookie')).not.toContain('Domain=');
    expect(await response.text()).not.toContain(capability);
  });
  it('rejects another operation ID, browser identity assertions and extra confirmation fields', async () => {
    expect((await handleAccountMerge(request('resume', {}, { cookie }), 'resume', 'b0000000-0000-4000-8000-000000000001')).status).toBe(403);
    expect((await handleAccountMerge(request('start', { candidateId: 'opaque', subject: 'victim' }), 'start')).status).toBe(400);
    expect(mocks.service.resume).not.toHaveBeenCalled(); expect(mocks.service.start).not.toHaveBeenCalled();
  });
  it('starts a fresh login only after binding a challenge and forwards provider signout cookies', async () => {
    mocks.service.challenge.mockResolvedValue({ reauthUrl: '/sign-in?returnTo=callback' });
    mocks.signout.mockResolvedValue(new Response('{}', { headers: { 'Set-Cookie': 'auth_session=; Max-Age=0; HttpOnly' } }));
    const response = await handleAccountMerge(request('reauth', { step: 'other' }, { cookie }), 'reauth', id);
    expect(response.status).toBe(200); expect(response.headers.get('set-cookie')).toContain('auth_session=;');
    expect(mocks.service.challenge.mock.invocationCallOrder[0]).toBeLessThan(mocks.signout.mock.invocationCallOrder[0]);
  });
  it('recovery requires its capability but does not require a session revoked by the freeze', async () => {
    expect((await handleAccountMergeRecovery(request('recovery'))).status).toBe(403);
    mocks.service.status.mockResolvedValue({ available: true, operation: { phase: 'reconcile_required', resumable: true } });
    const response = await handleAccountMergeRecovery(request('recovery', undefined, { cookie }));
    expect(response.status).toBe(200); expect(await response.text()).toContain('Resume saved merge');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('content-security-policy')).toContain("style-src 'sha256-");
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.service.resume).not.toHaveBeenCalled();
  });
  it('offers only a minimal cookie-authorized recovery indicator without reading a session or details', async () => {
    expect(await (await handleAccountMergeRecoveryStatus(request('recovery-status'))).json()).toEqual({ available: true, recovery: false });
    expect(mocks.runtime).not.toHaveBeenCalled();
    mocks.service.recoverable.mockResolvedValue(true);
    expect(await (await handleAccountMergeRecoveryStatus(request('recovery-status', undefined, { cookie }))).json()).toEqual({ available: true, recovery: true });
    expect(mocks.session).not.toHaveBeenCalled(); expect(mocks.service.status).not.toHaveBeenCalled();
    mocks.service.recoverable.mockRejectedValue(Error('expired'));
    expect(await (await handleAccountMergeRecoveryStatus(request('recovery-status', undefined, { cookie }))).json()).toEqual({ available: true, recovery: false });
  });
  it('scheduler rejects a missing/wrong secret and cannot accept a browser-supplied job or choices', async () => {
    vi.stubEnv('ACCOUNT_LINKING_WORKER_SECRET', 's'.repeat(40));
    expect((await handleAccountMergeWorker(request('worker', {}))).status).toBe(401);
    expect((await handleAccountMergeWorker(request('worker', {}, { authorization: 'Bearer wrong' }))).status).toBe(401);
    expect((await handleAccountMergeWorker(request('worker', {}, { authorization: 's'.repeat(40) }))).status).toBe(401);
    expect((await handleAccountMergeWorker(request('worker', {}, { authorization: 'Basic ' + 's'.repeat(40) }))).status).toBe(401);
    mocks.service.runPending.mockResolvedValue({ processed: 0, pending: 0 });
    expect((await handleAccountMergeWorker(request('worker', { jobId: 'victim' }, { authorization: 'Bearer ' + 's'.repeat(40) }))).status).toBe(200);
    expect(mocks.service.runPending).toHaveBeenCalledWith();
  });
});
