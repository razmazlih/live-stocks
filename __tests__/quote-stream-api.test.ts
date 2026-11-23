// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ user: vi.fn(), credential: vi.fn(), listen: vi.fn(), detach: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({
  requireWebPrincipal: mocks.user,
  authenticationResponse: () => null,
  PRIVATE_HEADERS: { 'Cache-Control': 'private, no-store' },
}));
vi.mock('@/lib/auth/credentials', () => ({ readFinnhubCredential: mocks.credential }));
vi.mock('@/lib/auth/admin', () => ({ getAdminSupabase: () => ({}) }));
vi.mock('@/lib/server/live-quote-relay', () => ({
  QuoteRelay: class {
    listen = mocks.listen;
  },
  providerBackoff: () => 60,
}));
import { GET } from '@/app/api/quotes/stream/route';

afterEach(() => vi.clearAllMocks());
it('requires a web session and a credential before attaching a subscription', async () => {
  const request = new NextRequest('https://app.test/api/quotes/stream?selected=AMD');
  mocks.user.mockRejectedValueOnce(new Error('Session unavailable'));
  expect((await GET(request)).status).toBe(503);
  expect(mocks.credential).not.toHaveBeenCalled();
  mocks.user.mockResolvedValueOnce({ userId: 'owner', expiresAt: Math.floor(Date.now() / 1000) + 60 });
  mocks.credential.mockResolvedValueOnce(null);
  expect((await GET(request)).status).toBe(409);
  expect(mocks.listen).not.toHaveBeenCalled();
});
it('emits private SSE frames, deduplicates selected symbols and disconnects on cancellation', async () => {
  mocks.user.mockResolvedValue({ userId: 'owner', expiresAt: Math.floor(Date.now() / 1000) + 60 });
  mocks.credential.mockResolvedValue('synthetic-provider-key-for-api-fixture');
  mocks.listen.mockImplementation((_demand, send) => {
    send({ status: 'connecting', ticks: [] });
    return mocks.detach;
  });
  const response = await GET(
    new NextRequest('https://app.test/api/quotes/stream?selected=AMD&watchlist=AMD,MSFT'),
  );
  expect(response.headers.get('content-type')).toContain('text/event-stream');
  expect(response.headers.get('cache-control')).toContain('no-store');
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    'data:{"status":"connecting","ticks":[]}\n\n',
  );
  expect(mocks.listen.mock.calls[0][0]).toEqual([
    { symbol: 'AMD', priority: 0 },
    { symbol: 'MSFT', priority: 2 },
  ]);
  await reader.cancel();
  expect(mocks.detach).toHaveBeenCalledTimes(1);
});
