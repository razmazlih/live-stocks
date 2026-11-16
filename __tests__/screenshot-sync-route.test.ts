// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ principal: vi.fn(), origin: vi.fn(), review: vi.fn(), apply: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ requireWebPrincipal: mocks.principal, requireSameOrigin: mocks.origin, PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store' }, authenticationResponse: () => null }));
vi.mock('@/lib/screenshot-sync-server', () => ({ reviewScreenshotSync: mocks.review, applyScreenshotSync: mocks.apply }));
import { POST } from '@/app/api/positions/sync/route';
const request = (body: unknown) => new Request('https://example.test/api/positions/sync', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); mocks.principal.mockResolvedValue({ kind: 'web', userId: 'owner' }); mocks.origin.mockImplementation(() => {}); mocks.review.mockResolvedValue({ stale: false }); mocks.apply.mockResolvedValue({ applied: true }); });
describe('website confirmation boundary', () => {
  it('requires origin and website principal before invoking review', async () => {
    const response = await POST(request({ action: 'review', token: 'sealed' }));
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.origin).toHaveBeenCalledOnce(); expect(mocks.principal).toHaveBeenCalledOnce();
    expect(mocks.review).toHaveBeenCalledWith({ kind: 'web', userId: 'owner' }, 'sealed'); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('rejects cross-origin and unauthenticated requests before apply', async () => {
    mocks.origin.mockImplementationOnce(() => { throw new Error('denied'); });
    expect((await POST(request({ action: 'apply', token: 'sealed' }))).status).toBe(409);
    expect(mocks.principal).not.toHaveBeenCalled(); expect(mocks.apply).not.toHaveBeenCalled();
    mocks.principal.mockRejectedValueOnce(new Error('denied'));
    await POST(request({ action: 'apply', token: 'sealed' })); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('rejects arbitrary identity, oversized tokens and missing explicit action', async () => {
    for (const body of [{ action: 'apply', token: 'sealed', userId: 'other' }, { token: 'sealed' }, { action: 'apply', token: 'x'.repeat(50001) }]) {
      expect((await POST(request(body))).status).toBe(409);
    }
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
