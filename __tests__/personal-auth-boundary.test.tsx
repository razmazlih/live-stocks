import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { configureUser, resetClient } = vi.hoisted(() => ({ configureUser: vi.fn(), resetClient: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/supabase', () => ({ configureSupabaseUser: configureUser, resetSupabaseClient: resetClient }));
vi.mock('@/lib/context', () => ({ AppProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/components/portfolio/stock-navigation', () => ({ StockNavigationProvider: ({ children }: { children: ReactNode }) => children }));
import { AuthProvider, useAuth } from '@/components/auth/auth-provider';

function PersonalContent() {
  const { user } = useAuth();
  const [note, setNote] = useState('');
  return <div><p>{user.id}</p><input aria-label="private note" value={note} onChange={(event) => setNote(event.target.value)} /></div>;
}
const userSession = (id: string) => new Response(JSON.stringify({ configured: true, user: { id, emailVerified: true } }));

describe('personal account boundary', () => {
  beforeEach(() => { configureUser.mockReset(); resetClient.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it('does not mount private content when no session exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ configured: false, user: null }))));
    render(<AuthProvider><PersonalContent /></AuthProvider>);
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
    await screen.findByText(/ההתחברות עדיין אינה מוגדרת/);
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
    expect(configureUser).toHaveBeenCalledWith(null);
  });

  it('shows ordinary sign-in without an error for an unauthenticated API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401 })));
    render(<AuthProvider><PersonalContent /></AuthProvider>);
    await screen.findByRole('link', { name: 'התחברות' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
  });

  it('requires verified email before mounting private content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Verify your email before continuing' }), { status: 403 })));
    render(<AuthProvider><PersonalContent /></AuthProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('יש לאמת את כתובת הדוא״ל');
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
  });

  it('resets all mounted private state when focus detects a different account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(userSession('auth0|a')).mockResolvedValueOnce(userSession('auth0|b')));
    render(<AuthProvider><PersonalContent /></AuthProvider>);
    await screen.findByText('auth0|a');
    fireEvent.change(screen.getByLabelText('private note'), { target: { value: 'A private draft' } });
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(screen.queryByText('auth0|a')).not.toBeInTheDocument();
    await screen.findByText('auth0|b');
    expect(screen.getByLabelText('private note')).toHaveValue('');
    expect(configureUser).toHaveBeenLastCalledWith('auth0|b');
  });

  it('immediately clears private content after another tab signs out', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(userSession('auth0|a'));
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthProvider><PersonalContent /></AuthProvider>);
    await screen.findByText('auth0|a');
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'livestocks:account-change', newValue: 'logout:123' })); });
    await waitFor(() => expect(screen.queryByText('auth0|a')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'התחברות' })).toHaveAttribute('href', '/auth/login?returnTo=%2F');
  });
});
