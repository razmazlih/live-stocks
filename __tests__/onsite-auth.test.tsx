import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn(), social: vi.fn(), requestReset: vi.fn(), verify: vi.fn(), reset: vi.fn(), resetDatabase: vi.fn() }));
vi.mock('@/lib/auth/better-auth-client', () => ({ authClient: { signIn: { email: api.login, social: api.social }, signUp: { email: api.signup }, requestPasswordReset: api.requestReset, sendVerificationEmail: api.verify, resetPassword: api.reset } }));
vi.mock('@/lib/supabase', () => ({ resetSupabaseClient: api.resetDatabase }));
import { SignIn } from '@/components/auth/sign-in';
import { authNavigation } from '@/lib/auth/browser-session';

const success = { data: {}, error: null };
function credentials() {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-pass-123' } });
}

describe('on-site Better Auth forms', () => {
  beforeEach(() => { Object.values(api).forEach((mock) => mock.mockReset().mockResolvedValue(success)); window.history.replaceState({}, '', '/sign-in'); });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

  it('defaults to Google only, with no password/recovery links and preserved OAuth context', async () => {
    render(<SignIn configured googleEnabled initialLocale="en" oauthQuery="client_id=static-client&sig=proof&ba_param=client_id" returnTo="/settings" />);
    expect(screen.queryByLabelText('Email address')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    for (const name of ['Create account', 'Forgot password?', 'Resend verification']) expect(screen.queryByRole('link', { name })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(api.social).toHaveBeenCalledOnce());
    const body = api.social.mock.calls[0][0];
    expect(body.callbackURL).toBe('/settings');
    expect(new URL(body.errorCallbackURL, 'https://example.invalid').searchParams.get('sig')).toBe('proof');
    expect(api.login).not.toHaveBeenCalled(); expect(api.requestReset).not.toHaveBeenCalled();
  });

  it('submits login on site, uses a safe destination and clears private browser state', async () => {
    const navigate = vi.spyOn(authNavigation, 'assign').mockImplementation(() => undefined);
    render(<SignIn passwordEnabled configured initialLocale="en" returnTo="//outside.example" />);
    credentials();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(api.login).toHaveBeenCalledWith({ email: 'person@example.test', password: 'synthetic-pass-123', callbackURL: '/' }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(api.resetDatabase).toHaveBeenCalled();
    expect(JSON.stringify(localStorage)).not.toContain('synthetic-pass-123');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(document.querySelector('a[href^="/auth/login"]')).toBeNull();
  });

  it('keeps password errors generic and never shows provider messages', async () => {
    api.login.mockResolvedValue({ error: { code: 'EMAIL_NOT_VERIFIED', message: 'secret account metadata' } });
    render(<SignIn passwordEnabled configured initialLocale="en" />);
    credentials(); fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to sign in with these details');
    expect(screen.queryByText('secret account metadata')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('preserves signed OAuth context across auth pages and does not overwrite provider navigation', async () => {
    const navigate = vi.spyOn(authNavigation, 'assign').mockImplementation(() => undefined);
    const query = 'client_id=static-client&sig=signed-proof&ba_param=client_id&resource=one&ba_param=resource';
    api.login.mockResolvedValue({ data: { redirect: true, url: '/oauth/consent?signed=continuation' }, error: null });
    render(<SignIn passwordEnabled configured initialLocale="en" oauthQuery={query} />);
    for (const label of ['Create account', 'Forgot password?', 'Resend verification']) {
      const params = new URL(screen.getByRole('link', { name: label }).getAttribute('href')!, 'https://local.test').searchParams;
      expect(params.get('sig')).toBe('signed-proof'); expect(params.getAll('ba_param')).toEqual(['client_id', 'resource']);
      expect(params.get('ui_lang')).toBe('en');
    }
    credentials(); fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(api.resetDatabase).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('uses native email validation before contacting authentication', () => {
    render(<SignIn passwordEnabled configured initialLocale="en" />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(api.login).not.toHaveBeenCalled();
  });

  it('requires matching signup passwords and waits for email verification without signing in', async () => {
    const navigate = vi.spyOn(authNavigation, 'assign').mockImplementation(() => undefined);
    render(<SignIn passwordEnabled configured emailDeliveryConfigured mode="sign-up" initialLocale="en" returnTo="/settings" />);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Example Person' } });
    credentials();
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'different-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('passwords do not match');
    expect(api.signup).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'synthetic-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If this request can be completed');
    expect(api.signup).toHaveBeenCalledWith(expect.objectContaining({ callbackURL: '/sign-in?lang=en&returnTo=%2Fsettings&verified=1' }), expect.any(Object));
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each(['USER_ALREADY_EXISTS', 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'])('does not reveal duplicate registration via %s', async (code) => {
    api.signup.mockResolvedValue({ error: { code } });
    render(<SignIn passwordEnabled configured emailDeliveryConfigured mode="sign-up" initialLocale="en" />);
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Example Person' } });
    credentials(); fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'synthetic-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If this request can be completed');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('requests password recovery with neutral account-existence messaging', async () => {
    api.requestReset.mockResolvedValue({ error: { code: 'USER_NOT_FOUND' } });
    render(<SignIn passwordEnabled configured emailDeliveryConfigured mode="forgot-password" initialLocale="en" returnTo="/positions" />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByRole('status')).toHaveTextContent('If this request can be completed');
    expect(api.requestReset).toHaveBeenCalledWith({ email: 'person@example.test', redirectTo: '/reset-password?lang=en&returnTo=%2Fpositions' }, expect.any(Object));
  });

  it('shows unavailable delivery without claiming that an email was sent', async () => {
    api.verify.mockResolvedValue({ error: { code: 'EMAIL_DELIVERY_UNAVAILABLE' } });
    render(<SignIn passwordEnabled configured emailDeliveryConfigured mode="verify-email" initialLocale="en" />);
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email delivery is currently unavailable');
    expect(screen.queryByText(/instructions will be sent/)).not.toBeInTheDocument();
  });

  it('disables email-delivery flows when the public capability says mail is unavailable', () => {
    render(<SignIn passwordEnabled configured mode="forgot-password" initialLocale="en" />);
    expect(screen.getByRole('button', { name: 'Send link' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Email delivery is not available');
  });

  it('uses a reset token only in memory and the reset request, then requires ordinary sign-in', async () => {
    window.history.replaceState({}, '', '/reset-password?token=synthetic-reset-proof&returnTo=%2Fsettings');
    render(<SignIn passwordEnabled configured mode="reset-password" initialLocale="en" resetToken="synthetic-reset-proof" />);
    expect(window.location.search).not.toContain('token');
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-synthetic-pass-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-synthetic-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('status')).toHaveTextContent('password has been updated');
    expect(api.reset).toHaveBeenCalledWith({ newPassword: 'new-synthetic-pass-123', token: 'synthetic-reset-proof' }, expect.any(Object));
    expect(JSON.stringify(localStorage)).not.toContain('synthetic-reset-proof');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('handles missing and expired reset proof without exposing backend details', async () => {
    const view = render(<SignIn passwordEnabled configured mode="reset-password" initialLocale="en" />);
    expect(screen.getByRole('alert')).toHaveTextContent('reset link is missing');
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    view.unmount();
    api.reset.mockResolvedValue({ error: { code: 'INVALID_TOKEN', message: 'raw token detail' } });
    render(<SignIn passwordEnabled configured mode="reset-password" initialLocale="en" resetToken="expired-synthetic-proof" />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-synthetic-pass-123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'new-synthetic-pass-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('may have expired');
    expect(screen.queryByText('raw token detail')).not.toBeInTheDocument();
  });

  it('uses Google only through the configured social client with safe return paths', async () => {
    render(<SignIn passwordEnabled configured googleEnabled initialLocale="en" returnTo="/settings" />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await waitFor(() => expect(api.social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/settings', errorCallbackURL: '/sign-in?lang=en&returnTo=%2Fsettings&error=sign-in-failed' }, expect.any(Object)));
  });

  it('switches Hebrew/English form labels and keeps local navigation in the chosen language', () => {
    render(<SignIn passwordEnabled configured returnTo="/settings" />);
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'rtl');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('main')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password?lang=en&returnTo=%2Fsettings');
  });
});
