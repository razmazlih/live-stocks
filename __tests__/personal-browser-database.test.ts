import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

describe('personal browser database credentials', () => {
  beforeEach(() => {
    vi.resetModules();
    createClient.mockReset().mockImplementation(() => ({ removeAllChannels: vi.fn() }));
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://database.example');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'publishable-test-key');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('refuses anonymous access and removes the legacy shared settings credential', async () => {
    const database = await import('@/lib/supabase');
    localStorage.setItem('settings', JSON.stringify({ finnhubToken: 'legacy-secret' }));
    database.resetSupabaseClient();
    expect(() => database.getSupabaseClient()).toThrow('signed-in account');
    expect(createClient).not.toHaveBeenCalled();
    expect(localStorage.getItem('settings')).toBeNull();
  });

  it('uses a session credential without persisting it or enabling Supabase auth storage', async () => {
    const database = await import('@/lib/supabase');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accessToken: 'personal-token', userId: 'auth0|a', expiresAt: Math.floor(Date.now() / 1000) + 600,
    })));
    vi.stubGlobal('fetch', fetchMock);
    database.configureSupabaseUser('auth0|a');
    database.getSupabaseClient();
    const options = createClient.mock.calls[0][2];
    expect(options.auth).toEqual({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
    await expect(options.accessToken()).resolves.toBe('personal-token');
    await expect(options.accessToken()).resolves.toBe('personal-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/account/database-token', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin' }));
    expect(localStorage.getItem('settings')).toBeNull();
  });

  it('rejects a token for a different account instead of falling back to an anonymous request', async () => {
    const database = await import('@/lib/supabase');
    const invalidated = vi.fn();
    window.addEventListener('livestocks:session-invalid', invalidated);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accessToken: 'other-user-token', userId: 'auth0|b', expiresAt: Math.floor(Date.now() / 1000) + 600,
    }))));
    database.configureSupabaseUser('auth0|a');
    database.getSupabaseClient();
    await expect(createClient.mock.calls[0][2].accessToken()).rejects.toThrow('does not match');
    expect(invalidated).toHaveBeenCalledOnce();
    window.removeEventListener('livestocks:session-invalid', invalidated);
  });

  it('aborts pending work and rejects old clients after account switching, including a late token response', async () => {
    const database = await import('@/lib/supabase');
    let resolveRequest!: (response: Response) => void;
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    database.configureSupabaseUser('auth0|a');
    database.getSupabaseClient();
    const previousOptions = createClient.mock.calls[0][2];
    const token = previousOptions.accessToken();
    const assertion = expect(token).rejects.toThrow('no longer active');
    const requestSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    database.configureSupabaseUser('auth0|b');
    expect(requestSignal.aborted).toBe(true);
    resolveRequest(new Response(JSON.stringify({ accessToken: 'old-token', userId: 'auth0|a', expiresAt: Math.floor(Date.now() / 1000) + 600 })));
    await assertion;
    await expect(previousOptions.accessToken()).rejects.toThrow('no longer active');
    expect(() => previousOptions.global.fetch('https://database.example/rest/v1/settings')).toThrow('no longer active');
    database.getSupabaseClient();
    expect(createClient).toHaveBeenCalledTimes(2);
  });
});
