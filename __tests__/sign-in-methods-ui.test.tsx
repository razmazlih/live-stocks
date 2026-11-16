import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignInMethods } from '@/components/auth/sign-in-methods';
import { authNavigation } from '@/lib/auth/browser-session';
vi.mock('@/lib/supabase', () => ({ resetSupabaseClient: vi.fn() }));
const passwordOnly = { account: { id: 'demo-user', email: 'demo@example.test' }, methods: { password: true, google: false }, passwordEnabled: true, googleEnabled: true, emailDeliveryConfigured: true };
describe('explicit sign-in method addition', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.stubGlobal('fetch', vi.fn()); vi.spyOn(authNavigation, 'assign').mockImplementation(() => {}); });
  it('requires explicit consent and current password without accepting account/provider fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(passwordOnly)).mockResolvedValueOnce(Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' }));
    render(<SignInMethods locale="en" />);
    const button = await screen.findByRole('button', { name: 'Verify and connect Google' }); expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Current password to verify this account'), { target: { value: 'test-password' } }); expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(button);
    await waitFor(() => expect(authNavigation.assign).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenLastCalledWith('/api/account/sign-in-methods/google', expect.objectContaining({ body: JSON.stringify({ consent: true, password: 'test-password' }), credentials: 'same-origin', redirect: 'error' }));
    expect(screen.getByLabelText('Current password to verify this account')).toHaveValue('');
  });
  it('rejects an unexpected provider redirect and retains no password', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json(passwordOnly)).mockResolvedValueOnce(Response.json({ url: 'https://evil.test/' }));
    render(<SignInMethods locale="en" />); await screen.findByText('demo@example.test');
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.change(screen.getByLabelText('Current password to verify this account'), { target: { value: 'secret' } }); fireEvent.click(screen.getByText('Verify and connect Google'));
    expect(await screen.findByRole('alert')).toBeVisible(); expect(authNavigation.assign).not.toHaveBeenCalled(); expect(screen.getByLabelText('Current password to verify this account')).toHaveValue('');
  });
  it('sends Google-first setup only for the server-held email after explicit consent', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...passwordOnly, methods: { password: false, google: true } })).mockResolvedValueOnce(Response.json({ sent: true }));
    render(<SignInMethods locale="en" />); const button = await screen.findByText('Email a password setup link'); expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent('password setup link was sent');
    expect(fetch).toHaveBeenLastCalledWith('/api/account/sign-in-methods/password', expect.objectContaining({ body: '{"consent":true}' }));
  });
  it('reads actual methods instead of trusting callback query success', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(passwordOnly));
    render(<SignInMethods locale="en" completed />); await screen.findByText('demo@example.test');
    expect(screen.queryByText('Google is connected to this account. Your portfolio stays in the same account.')).toBeNull();
  });
});
