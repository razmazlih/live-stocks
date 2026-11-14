import { afterEach, describe, expect, it, vi } from 'vitest';

const { resetClient } = vi.hoisted(() => ({ resetClient: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ resetSupabaseClient: resetClient }));
import { accountLinkNavigation, navigateAccountLink, requestAccountLinkStatus, resolveAccountLinkDestination } from '@/lib/account-linking-client';
import { linkReady, linkStatus } from './fixtures/account-linking';

describe('account linking client boundaries', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); resetClient.mockReset(); });

  it.each(['https://outside.example/reauth', '//outside.example/reauth', '/\\outside.example', 'javascript:alert(1)', '/%2Foutside.example', '/%5Coutside.example', 'https://user:password@portfolio.example/reauth'])('rejects navigation escape %s', (value) => {
    expect(() => resolveAccountLinkDestination(value, 'https://portfolio.example')).toThrow();
  });

  it('accepts only the current origin and preserves its application path', () => {
    expect(resolveAccountLinkDestination('/account/verify?step=other', 'https://portfolio.example')).toBe('/account/verify?step=other');
    expect(resolveAccountLinkDestination('https://portfolio.example/account/verify', 'https://portfolio.example')).toBe('/account/verify');
    expect(() => resolveAccountLinkDestination('http://portfolio.example/account/verify', 'https://portfolio.example')).toThrow();
  });

  it('clears private state and broadcasts only after a completion URL passes same-origin validation', () => {
    const assign = vi.spyOn(accountLinkNavigation, 'assign').mockImplementation(() => undefined);
    const invalidated = vi.fn();
    window.addEventListener('livestocks:session-invalid', invalidated);
    try {
      expect(() => navigateAccountLink('https://outside.example/logout', true)).toThrow();
      expect(resetClient).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
      navigateAccountLink('/account/fresh-sign-in', true);
      expect(resetClient).toHaveBeenCalledOnce();
      expect(localStorage.getItem('livestocks:account-change')).toMatch(/^logout:/);
      expect(invalidated).toHaveBeenCalledOnce();
      expect(assign).toHaveBeenCalledWith('/account/fresh-sign-in');
    } finally { window.removeEventListener('livestocks:session-invalid', invalidated); }
  });

  it('strips unexpected candidate data and does not follow API redirects', async () => {
    const value = linkStatus();
    if (!value.available) throw new Error('Fixture must be available');
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...value, candidates: [{ id: 'opaque-candidate', email: 'hidden@example.test', counts: { positions: 99 } }] }));
    vi.stubGlobal('fetch', fetcher);
    const result = await requestAccountLinkStatus('status', new AbortController().signal);
    expect(result.available && result.candidates).toEqual([{ id: 'opaque-candidate' }]);
    expect(fetcher).toHaveBeenCalledWith('/api/account/link/status', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' }));
  });

  it('rejects a review referencing an account outside the proven pair', async () => {
    const value = linkReady();
    if (!value.available || value.operation?.phase !== 'review_ready') throw new Error('Fixture must be ready');
    value.operation.review.canonicalAccountId = 'unproven-account';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    await expect(requestAccountLinkStatus('status', new AbortController().signal)).rejects.toThrow('INVALID_RESPONSE');
  });

  it('distinguishes not-ready capability from a transient server outage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ code: 'NOT_READY' }, { status: 503 })).mockResolvedValueOnce(Response.json({ code: 'UNAVAILABLE' }, { status: 503 })));
    await expect(requestAccountLinkStatus('status', new AbortController().signal)).resolves.toEqual({ available: false });
    await expect(requestAccountLinkStatus('status', new AbortController().signal)).rejects.toThrow('UNAVAILABLE');
  });
});
