import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({ pathname: '/', signOut: vi.fn(), reset: vi.fn(), configure: vi.fn(), privateMount: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/auth/better-auth-client', () => ({ authClient: { signOut: state.signOut } }));
vi.mock('@/lib/supabase', () => ({ configureSupabaseUser: state.configure, resetSupabaseClient: state.reset }));
vi.mock('@/lib/context', () => ({ AppProvider: ({ children }: { children: ReactNode }) => { state.privateMount(); return children; } }));
vi.mock('@/components/portfolio/stock-navigation', () => ({ StockNavigationProvider: ({ children }: { children: ReactNode }) => children }));
import { AuthProvider, useAuth } from '@/components/auth/auth-provider';
import { authNavigation } from '@/lib/auth/browser-session';

function PrivateAccount() {
  const { user, signOut } = useAuth();
  return <div><p>Private {user.id}</p><button onClick={signOut}>Exit account</button></div>;
}

describe('on-site public auth and sign-out boundary', () => {
  beforeEach(() => { state.pathname = '/'; state.signOut.mockReset(); state.reset.mockReset(); state.configure.mockReset(); state.privateMount.mockReset(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('isolates owner confirmation from financial session bootstrap and private providers', async () => {
    state.pathname = '/account/owner-confirmation';
    vi.stubGlobal('fetch', vi.fn());
    render(<AuthProvider><h1>Review Google owner</h1></AuthProvider>);
    expect(screen.getByRole('heading', { name: 'Review Google owner' })).toBeVisible();
    await waitFor(() => expect(state.reset).toHaveBeenCalled());
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(fetch).not.toHaveBeenCalled();
    expect(state.privateMount).not.toHaveBeenCalled();
    expect(state.configure).not.toHaveBeenCalled();
  });

  it('unmounts and aborts a previous private session request before owner review', async () => {
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => undefined));
    vi.stubGlobal('fetch', fetcher);
    const view = render(<AuthProvider><h1>Review Google owner</h1></AuthProvider>);
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    state.pathname = '/account/owner-confirmation';
    view.rerender(<AuthProvider><h1>Review Google owner</h1></AuthProvider>);
    expect(signal.aborted).toBe(true);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(state.privateMount).not.toHaveBeenCalled();
  });

  it.each(['/sign-in', '/sign-up', '/forgot-password', '/reset-password', '/verify-email'])('renders %s while revalidating without mounting private providers', async (pathname) => {
    state.pathname = pathname;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => undefined)));
    render(<AuthProvider><h1>On-site authentication form</h1></AuthProvider>);
    expect(screen.getByRole('heading', { name: 'On-site authentication form' })).toBeInTheDocument();
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(state.reset).toHaveBeenCalled();
    expect(state.privateMount).not.toHaveBeenCalled();
  });

  it('clears private content immediately but does not claim successful logout after a server failure', async () => {
    const navigate = vi.spyOn(authNavigation, 'assign').mockImplementation(() => undefined);
    state.signOut.mockResolvedValueOnce({ error: { code: 'SERVER_ERROR' } }).mockResolvedValueOnce({ error: null });
    const fetcher = vi.fn().mockResolvedValue(Response.json({ configured: true, user: { id: 'synthetic-account', emailVerified: true } }));
    vi.stubGlobal('fetch', fetcher);
    render(<AuthProvider><PrivateAccount /></AuthProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Exit account' }));
    expect(screen.queryByText('Private synthetic-account')).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-out did not complete');
    expect(navigate).not.toHaveBeenCalled();
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(localStorage.getItem('livestocks:account-change')).toMatch(/^logout:/);
    fireEvent.click(screen.getByRole('button', { name: /Retry sign-out/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/sign-in'));
    expect(state.signOut).toHaveBeenCalledTimes(2);
  });
});
