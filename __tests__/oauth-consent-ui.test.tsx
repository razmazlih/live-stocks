import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthConsent } from '@/components/auth/oauth-consent';
import { authNavigation } from '@/lib/auth/browser-session';
import type { ConsentReview } from '@/lib/auth/oauth-consent';
vi.mock('@/lib/supabase', () => ({ resetSupabaseClient: vi.fn() }));
const review: ConsentReview = { query: 'signed=fixture', receipt: 'receipt-fixture', clientName: 'LiveStocks ChatGPT',
  account: { id: 'synthetic-account', email: 'demo@example.test', name: 'Demo account' }, callback: 'https://chatgpt.com/callback',
  scopes: ['openid', 'email', 'profile', 'offline_access', 'portfolio:read'], expiresAt: 4_000_000_000 };
describe('reviewed OAuth consent', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.stubGlobal('fetch', vi.fn()); vi.spyOn(authNavigation, 'assign').mockImplementation(() => {}); });
  it('shows the exact account, callback host and read-only scope without fetching portfolio data', () => {
    render(<OAuthConsent review={review} />);
    expect(screen.getByText(review.account.email)).toBeVisible(); expect(screen.getByText(review.account.id)).toBeVisible();
    expect(screen.getByText('chatgpt.com')).toBeVisible(); expect(screen.getByText(/קריאה בלבד/)).toBeVisible(); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('English')); expect(screen.getByRole('heading', { name: 'Connect to your portfolio' })).toBeVisible();
  });
  it('shows limited sync permission only when explicitly requested and never describes it as read-only', () => {
    render(<OAuthConsent review={{ ...review, scopes: [...review.scopes, 'portfolio:sync'] }} initialLocale="en" />);
    expect(screen.getByText(/Synchronize screenshot holding balances/)).toBeVisible();
    expect(screen.getByText(/Limited permission to synchronize balances/)).toBeVisible();
    expect(screen.queryByText(/Read-only access/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([['portfolio:transactions'], ['portfolio:sync', 'portfolio:transactions']])('shows explicit already-executed transaction permission for %j', (...optionalScopes) => {
    render(<OAuthConsent review={{ ...review, scopes: [...review.scopes, ...optionalScopes] }} initialLocale="en" />);
    expect(screen.getByText(/Record purchases and sales you already made/)).toBeVisible();
    expect(screen.getByText(/Every entry needs your confirmation/)).toBeVisible();
    expect(screen.queryByText(/Read-only access/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([true, false])('submits explicit choice %s with the bound review and follows only checked destinations', async accept => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ url: 'https://chatgpt.com/callback?' + (accept ? 'code=synthetic' : 'error=access_denied') }));
    render(<OAuthConsent review={review} initialLocale="en" />);
    fireEvent.click(screen.getByRole('button', { name: accept ? 'Allow access' : 'Deny' }));
    await waitFor(() => expect(authNavigation.assign).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith('/api/account/oauth/consent', expect.objectContaining({ credentials: 'same-origin', redirect: 'error', body: JSON.stringify({ query: review.query, receipt: review.receipt, accept }) }));
  });
  it('rejects a cross-origin injected response and offers a retry', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ url: 'https://attacker.test/callback' }));
    render(<OAuthConsent review={review} initialLocale="en" />); fireEvent.click(screen.getByText('Allow access'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please retry'); expect(authNavigation.assign).not.toHaveBeenCalled();
  });
  it('stops both actions after a session/account switch', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: 'ACCOUNT_CHANGED' }, { status: 409 }));
    render(<OAuthConsent review={review} initialLocale="en" />); fireEvent.click(screen.getByText('Allow access'));
    expect(await screen.findByRole('alert')).toHaveTextContent('account changed'); expect(screen.getByText('Allow access')).toBeDisabled(); expect(screen.getByText('Deny')).toBeDisabled();
  });
  it('prevents repeated clicks and expires the request without submitting', async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const { rerender } = render(<OAuthConsent review={{ ...review, expiresAt: 1 }} initialLocale="en" />);
    fireEvent.click(screen.getByText('Allow access')); expect(fetch).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toHaveTextContent('expired');
    rerender(<OAuthConsent key="fresh" review={review} initialLocale="en" />);
    fireEvent.click(screen.getByText('Allow access')); fireEvent.click(screen.getByText('Deny')); expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not offer consent for an invalid request', () => {
    render(<OAuthConsent review={null} initialLocale="en" />); expect(screen.getByRole('alert')).toHaveTextContent('Start again'); expect(screen.queryByText('Allow access')).toBeNull();
  });
});
