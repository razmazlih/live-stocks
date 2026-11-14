import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { resetClient } = vi.hoisted(() => ({ resetClient: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ resetSupabaseClient: resetClient }));
import { AccountLinking } from '@/components/auth/account-linking';
import { accountLinkNavigation } from '@/lib/account-linking-client';
import { linkProof, linkReady, linkReview, linkStatus } from './fixtures/account-linking';

function reviewChoices() {
  fireEvent.click(screen.getByLabelText('Account 1 · USD · Annual target 6% · Saved refresh: 15 min'));
  fireEvent.click(screen.getByLabelText('Account 2 · Saved key ••••••••'));
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('account merging interface', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); resetClient.mockReset(); });

  it('shows the capability as unavailable without promising a merge', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ available: false })));
    render(<AccountLinking locale="he" />);
    expect(await screen.findByText(/איחוד חשבונות עדיין אינו זמין/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'בדיקת חשבון נוסף' })).not.toBeInTheDocument();
  });

  it('starts using an opaque handle without exposing another identity or portfolio before proof', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(linkStatus())).mockResolvedValueOnce(Response.json(linkStatus(linkProof)));
    vi.stubGlobal('fetch', fetcher);
    render(<AccountLinking locale="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Check another account' }));
    expect(await screen.findByRole('button', { name: 'Verify other account' })).toBeEnabled();
    expect(screen.queryByText('account-b')).not.toBeInTheDocument();
    expect(screen.queryByText('Position records')).not.toBeInTheDocument();
    expect(fetcher.mock.calls[1][0]).toBe('/api/account/link/start');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ candidateId: 'opaque-candidate' });
  });

  it('rejects an external verification destination without leaving the site', async () => {
    const assign = vi.spyOn(accountLinkNavigation, 'assign').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(linkStatus(linkProof))).mockResolvedValueOnce(Response.json({ reauthUrl: 'https://external-provider.example/authorize' })));
    render(<AccountLinking locale="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Verify other account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No navigation occurred');
    expect(assign).not.toHaveBeenCalled();
  });

  it('uses a server-returned same-origin verification address', async () => {
    const assign = vi.spyOn(accountLinkNavigation, 'assign').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(linkStatus(linkProof))).mockResolvedValueOnce(Response.json({ reauthUrl: '/account/verify?operation=operation-1' })));
    render(<AccountLinking locale="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Verify other account' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/account/verify?operation=operation-1'));
    expect(resetClient).not.toHaveBeenCalled();
  });

  it('requires explicit conflict choices and approval before submitting the exact reviewed pair and hash', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(linkReady())).mockResolvedValueOnce(Response.json(linkStatus({ id: 'operation-1', phase: 'frozen', canCancel: false, resumable: false })));
    vi.stubGlobal('fetch', fetcher);
    render(<AccountLinking locale="en" />);
    const confirm = await screen.findByRole('button', { name: 'Confirm account merge' });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    reviewChoices();
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByRole('status')).toHaveTextContent('Data is locked');
    expect(screen.queryByRole('button', { name: 'Cancel operation' })).not.toBeInTheDocument();
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      reviewVersion: 3, reviewHash: 'synthetic-review-hash', accountIds: ['account-a', 'account-b'], canonicalAccountId: 'account-a',
      settingsAccountId: 'account-a', credentialAccountId: 'account-b', confirmed: true,
    });
  });

  it('drops a stale review and requires every choice and approval again', async () => {
    const changed = linkReady();
    if (!changed.available || changed.operation?.phase !== 'review_ready') throw new Error('Fixture must be ready');
    changed.operation.review = { ...structuredClone(linkReview), hash: 'new-review-hash', version: 4 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(linkReady())).mockResolvedValueOnce(Response.json({ code: 'REVIEW_CHANGED' }, { status: 409 })).mockResolvedValueOnce(Response.json(changed)));
    render(<AccountLinking locale="en" />);
    await screen.findByRole('button', { name: 'Confirm account merge' });
    reviewChoices();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm account merge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('data changed');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm account merge' })).toBeDisabled());
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(screen.getByLabelText('Account 1 · USD · Annual target 6% · Saved refresh: 15 min'));
    expect(screen.getByLabelText('Account 2 · Saved key ••••••••')).not.toBeChecked();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('returns to fresh proof when the server rejects expired verification', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json(linkReady())).mockResolvedValueOnce(Response.json({ code: 'PROOF_EXPIRED' }, { status: 409 })).mockResolvedValueOnce(Response.json(linkStatus(linkProof))));
    render(<AccountLinking locale="en" />);
    await screen.findByRole('button', { name: 'Confirm account merge' });
    reviewChoices();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm account merge' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Verification expired');
    expect(await screen.findByRole('button', { name: 'Verify other account' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Confirm account merge' })).not.toBeInTheDocument();
  });

  it('resumes the durable operation rather than starting a second merge', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(linkStatus({ id: 'operation-1', phase: 'reconcile_required', canCancel: false, resumable: true }))).mockResolvedValueOnce(Response.json(linkStatus({ id: 'operation-1', phase: 'revocation_pending', canCancel: false, resumable: false })));
    vi.stubGlobal('fetch', fetcher);
    render(<AccountLinking locale="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resume saved operation' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Revoking previous access');
    expect(fetcher.mock.calls[1][0]).toBe('/api/account/link/operation-1/resume');
    expect(screen.queryByRole('button', { name: 'Check another account' })).not.toBeInTheDocument();
  });

  it('cancels only while the server permits cancellation', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(linkStatus(linkProof))).mockResolvedValueOnce(Response.json(linkStatus({ id: 'operation-1', phase: 'cancelled', canCancel: false })));
    vi.stubGlobal('fetch', fetcher);
    render(<AccountLinking locale="en" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel operation' }));
    expect(await screen.findByRole('status')).toHaveTextContent('cancelled before merging');
    expect(fetcher.mock.calls[1][0]).toBe('/api/account/link/operation-1/cancel');
  });

  it('clears account state and starts fresh sign-in when completion is confirmed by the server', async () => {
    const assign = vi.spyOn(accountLinkNavigation, 'assign').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(linkStatus({ id: 'operation-1', phase: 'completed', canCancel: false, signInUrl: '/account/fresh-sign-in' }))));
    render(<AccountLinking locale="en" />);
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/account/fresh-sign-in'));
    expect(resetClient).toHaveBeenCalledOnce();
  });

  it('survives StrictMode remount and aborts requests on final unmount', async () => {
    const fetcher = vi.fn().mockImplementation(async (_url, options) => {
      await Promise.resolve();
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return Response.json(linkStatus());
    });
    vi.stubGlobal('fetch', fetcher);
    const view = render(<StrictMode><AccountLinking locale="en" /></StrictMode>);
    await screen.findByRole('button', { name: 'Check another account' });
    act(() => view.unmount());
    expect(fetcher.mock.calls.every((call) => call[1].signal.aborted)).toBe(true);
  });
});
