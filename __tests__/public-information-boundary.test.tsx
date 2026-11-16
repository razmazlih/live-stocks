import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { route, resetClient } = vi.hoisted(() => ({ route: { pathname: '/privacy' }, resetClient: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));
vi.mock('@/lib/supabase', () => ({ configureSupabaseUser: vi.fn(), resetSupabaseClient: resetClient }));
vi.mock('@/lib/context', () => ({ AppProvider: () => { throw new Error('Private account provider must not mount'); } }));
vi.mock('@/components/portfolio/stock-navigation', () => ({ StockNavigationProvider: () => null }));
import { AuthProvider } from '@/components/auth/auth-provider';
import { PublicInformation } from '@/components/public-information';
import { publicInformation, type InformationKind } from '@/lib/public-information';

describe('anonymous public information rendering', () => {
  beforeEach(() => {
    resetClient.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('PUBLISHER_NAME', 'Example Operator');
    vi.stubEnv('PUBLIC_SUPPORT_EMAIL', 'support@example.test');
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it.each(['/about', '/privacy', '/terms'])('renders %s without a session request or private provider', (pathname) => {
    route.pathname = pathname;
    render(<AuthProvider><h1>Public information</h1></AuthProvider>);
    expect(screen.getByRole('heading', { name: 'Public information' })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(resetClient).not.toHaveBeenCalled();
  });

  it('does not extend the public exemption to nested paths', async () => {
    route.pathname = '/privacy/export';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ configured: false, user: null }))));
    render(<AuthProvider><h1>Private nested content</h1></AuthProvider>);
    await screen.findByText(/ההתחברות עדיין אינה מוגדרת/);
    expect(screen.queryByText('Private nested content')).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      '/api/account/session',
      '/api/account/link/recovery-status',
    ]);
    // The signed-out recovery hint must not bootstrap private financial data.
    expect(fetch).toHaveBeenCalledWith('/api/account/link/recovery-status', expect.objectContaining({
      cache: 'no-store', credentials: 'same-origin', redirect: 'error',
    }));
  });

  it.each(['about', 'privacy', 'terms'] as InformationKind[])('renders %s with approved identity and both locale directions', async (kind) => {
    const view = render(await PublicInformation({ kind, searchParams: Promise.resolve({ lang: 'he' }) }));
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(publicInformation.he[kind].title);
    expect(screen.getByRole('link', { name: 'support@example.test' })).toHaveAttribute('href', 'mailto:support@example.test');
    expect(screen.getByText('Example Operator')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'English' })).toHaveAttribute('href', `/${kind}?lang=en`);
    view.rerender(await PublicInformation({ kind, searchParams: Promise.resolve({ lang: 'en' }) }));
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(publicInformation.en[kind].title);
  });

  it('does not render draft policies when publisher details are missing', async () => {
    vi.stubEnv('PUBLIC_SUPPORT_EMAIL', '');
    render(await PublicInformation({ kind: 'privacy', searchParams: Promise.resolve({ lang: 'en' }) }));
    expect(screen.getByText(/Service information is not yet available/)).toBeInTheDocument();
    expect(screen.queryByText('Example Operator')).not.toBeInTheDocument();
    expect(screen.queryByText('Account and sign-in')).not.toBeInTheDocument();
  });
});
