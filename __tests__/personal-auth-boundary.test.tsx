import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const options = { configured: true, passwordEnabled: true, googleEnabled: false, emailDeliveryConfigured: false };
function pendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('personal account boundary', () => {
  beforeEach(() => { configureUser.mockReset(); resetClient.mockReset(); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

  it('does not mount private content when no session exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ configured: false, user: null }))));
    render(<AuthProvider options={{ configured: true, passwordEnabled: true, googleEnabled: false, emailDeliveryConfigured: false }}><PersonalContent /></AuthProvider>);
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
    await screen.findByText(/ההתחברות עדיין אינה מוגדרת/);
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
    expect(configureUser).toHaveBeenCalledWith(null);
  });

  it('shows ordinary sign-in without an error for an unauthenticated API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401 })));
    render(<AuthProvider options={{ configured: true, passwordEnabled: true, googleEnabled: false, emailDeliveryConfigured: false }}><PersonalContent /></AuthProvider>);
    await screen.findByRole('button', { name: 'התחברות' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
  });

  it('still fails closed when the initial session check is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    render(<AuthProvider options={options}><PersonalContent /></AuthProvider>);
    await screen.findByRole('alert');
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
    expect(configureUser).toHaveBeenLastCalledWith(null);
  });

  it('requires verified email before mounting private content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Verify your email before continuing' }), { status: 403 })));
    render(<AuthProvider options={{ configured: true, passwordEnabled: true, googleEnabled: false, emailDeliveryConfigured: false }}><PersonalContent /></AuthProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('יש לאמת את כתובת הדוא״ל');
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
  });

  it('resets all mounted private state when focus detects a different account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(userSession('auth0|a')).mockResolvedValueOnce(userSession('auth0|b')));
    render(<AuthProvider options={{ configured: true, passwordEnabled: true, googleEnabled: false, emailDeliveryConfigured: false }}><PersonalContent /></AuthProvider>);
    await screen.findByText('auth0|a');
    fireEvent.change(screen.getByLabelText('private note'), { target: { value: 'A private draft' } });
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByText('auth0|a')).toBeInTheDocument();
    await screen.findByText('auth0|b');
    expect(screen.queryByText('auth0|a')).not.toBeInTheDocument();
    expect(screen.getByLabelText('private note')).toHaveValue('');
    expect(configureUser).toHaveBeenLastCalledWith('auth0|b');
  });

  it('keeps the same private DOM and draft while focus/visibility revalidate the same account', async () => {
    const pending = pendingResponse();
    const fetcher = vi.fn().mockResolvedValueOnce(userSession('account-a')).mockReturnValueOnce(pending.promise);
    vi.stubGlobal('fetch', fetcher);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    render(<AuthProvider options={options}><PersonalContent /></AuthProvider>);
    const note = await screen.findByLabelText('private note');
    fireEvent.change(note, { target: { value: 'Keep this draft' } });
    resetClient.mockClear();
    act(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText('private note')).toBe(note);
    expect(note).toHaveValue('Keep this draft');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(resetClient).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(userSession('account-a')); });
    expect(screen.getByLabelText('private note')).toBe(note);
    expect(note).toHaveValue('Keep this draft');
    expect(resetClient).not.toHaveBeenCalled();
  });

  it.each(['network', 'server', 'malformed'])('retains authenticated content through a transient %s failure and recovers silently', async (failure) => {
    const fetcher = vi.fn().mockResolvedValueOnce(userSession('account-a'));
    if (failure === 'network') fetcher.mockRejectedValueOnce(new TypeError('offline'));
    else fetcher.mockResolvedValueOnce(failure === 'server' ? new Response('', { status: 503 }) : Response.json({ unexpected: true }));
    fetcher.mockResolvedValueOnce(userSession('account-a'));
    vi.stubGlobal('fetch', fetcher);
    render(<AuthProvider options={options}><PersonalContent /></AuthProvider>);
    const note = await screen.findByLabelText('private note');
    fireEvent.change(note, { target: { value: 'Unsaved local change' } });
    resetClient.mockClear();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByLabelText('private note')).toBe(note);
    expect(note).toHaveValue('Unsaved local change');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(screen.getByLabelText('private note')).toBe(note);
    expect(resetClient).not.toHaveBeenCalled();
  });

  it('clears private content only after a background check confirms 401', async () => {
    const pending = pendingResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(userSession('account-a')).mockReturnValueOnce(pending.promise));
    render(<AuthProvider options={options}><PersonalContent /></AuthProvider>);
    await screen.findByText('account-a');
    resetClient.mockClear();
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(screen.getByText('account-a')).toBeInTheDocument();
    await act(async () => { pending.resolve(new Response('', { status: 401 })); });
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'התחברות' })).toBeInTheDocument();
    expect(resetClient).toHaveBeenCalled();
  });

  it('ignores a stale focus response after another tab announces a new account', async () => {
    const oldRequest = pendingResponse();
    const newRequest = pendingResponse();
    const fetcher = vi.fn().mockResolvedValueOnce(userSession('account-a')).mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
    vi.stubGlobal('fetch', fetcher);
    render(<AuthProvider options={options}><PersonalContent /></AuthProvider>);
    await screen.findByText('account-a');
    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'livestocks:account-change', newValue: 'session:123' })); });
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
    await act(async () => { newRequest.resolve(userSession('account-b')); });
    await screen.findByText('account-b');
    fireEvent.change(screen.getByLabelText('private note'), { target: { value: 'New account draft' } });
    await act(async () => { oldRequest.resolve(new Response('', { status: 401 })); });
    expect(screen.getByText('account-b')).toBeInTheDocument();
    expect(screen.getByLabelText('private note')).toHaveValue('New account draft');
    expect(configureUser).toHaveBeenLastCalledWith('account-b');
  });

  it('cannot restore private content from a late response after multi-tab logout', async () => {
    const pending = pendingResponse();
    const fetcher = vi.fn().mockResolvedValueOnce(userSession('account-a')).mockReturnValueOnce(pending.promise);
    vi.stubGlobal('fetch', fetcher);
    render(<AuthProvider options={options}><PersonalContent /></AuthProvider>);
    await screen.findByText('account-a');
    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'livestocks:account-change', newValue: 'logout:123' })); });
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
    await act(async () => { pending.resolve(userSession('account-a')); });
    expect(screen.queryByLabelText('private note')).not.toBeInTheDocument();
    expect(configureUser).toHaveBeenLastCalledWith(null);
  });

  it('immediately clears private content after another tab signs out', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(userSession('auth0|a'));
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthProvider options={{ configured: true, passwordEnabled: true, googleEnabled: false, emailDeliveryConfigured: false }}><PersonalContent /></AuthProvider>);
    await screen.findByText('auth0|a');
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'livestocks:account-change', newValue: 'logout:123' })); });
    await waitFor(() => expect(screen.queryByText('auth0|a')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'התחברות' })).toBeInTheDocument();
    expect(screen.getByLabelText('כתובת דוא״ל')).toHaveAttribute('autocomplete', 'email');
  });
});
