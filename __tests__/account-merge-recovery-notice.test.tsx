import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountMergeRecoveryNotice } from '@/components/auth/account-merge-recovery-notice';
import { AuthScreen } from '@/components/auth/auth-screen';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('session-independent merge recovery notice', () => {
  it.each(['he', 'en'] as const)('offers only the fixed recovery link after capability validation in %s', async (locale) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ available: true, recovery: true, accountId: 'must-not-render', url: 'https://evil.test/' }));
    vi.stubGlobal('fetch', fetcher);
    // The notice does not need a session provider or any browser-storage marker.
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage disabled'); });
    render(<AccountMergeRecoveryNotice locale={locale} />);
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', '/api/account/link/recovery');
    expect(document.body).not.toHaveTextContent('must-not-render');
    expect(fetcher).toHaveBeenCalledWith('/api/account/link/recovery-status', expect.objectContaining({ credentials: 'same-origin', cache: 'no-store', redirect: 'error' }));
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it.each([
    { available: false, recovery: false },
    { available: true, recovery: false },
    { available: true, recovery: 'true' },
    null,
  ])('leaves sign-in unchanged when the server does not confirm recovery: %j', async (value) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    await act(async () => { render(<AccountMergeRecoveryNotice locale="en" />); });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('saved account merge');
  });

  it.each([403, 503])('fails quietly on HTTP %i without blocking ordinary Google sign-in', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await act(async () => { render(<AuthScreen configured googleEnabled initialLocale="en" />); });
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Recover a saved account merge' })).not.toBeInTheDocument();
  });

  it('survives a fresh sign-in mount with no login and hides after completion or cancellation clears capability', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ available: true, recovery: true }))
      .mockResolvedValueOnce(Response.json({ available: true, recovery: false }));
    vi.stubGlobal('fetch', fetcher);
    render(<AuthScreen configured googleEnabled initialLocale="en" />);
    expect(await screen.findByRole('link', { name: 'Recover a saved account merge' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    await act(async () => { fireEvent.focus(window); });
    expect(screen.queryByRole('link', { name: 'Recover a saved account merge' })).not.toBeInTheDocument();
    expect(fetcher.mock.calls.every(([url]) => url === '/api/account/link/recovery-status')).toBe(true);
  });

  it('aborts an outstanding check on unmount and does not leak a late response into a new screen', async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', fetcher);
    const view = render(<AccountMergeRecoveryNotice locale="en" />);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(fetcher).toHaveBeenCalledOnce();
    view.unmount();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => { finish(Response.json({ available: true, recovery: true })); });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
