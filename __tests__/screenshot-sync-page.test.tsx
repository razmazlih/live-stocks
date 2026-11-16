import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/components/auth/auth-provider', () => ({ useAuth: () => ({ user: { id: 'owner', email: 'owner@example.test' } }) }));
import Page from '@/app/positions/sync/page';
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
it('keeps the sealed proposal through StrictMode effect replay and confirms only after click', async () => {
  window.history.replaceState(null, '', '/positions/sync#sealed');
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ input: { location: 'bank_one', observedAt: '2026-01-01' }, stale: false, plan: { changes: [{ symbol: 'AAPL', quantity: 2, averageCostUsd: 100, acquiredOn: '2025-01-01' }], unchanged: [], blocked: [], canApply: true } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ applied: true }) });
  vi.stubGlobal('fetch', fetcher);
  render(<StrictMode><Page /></StrictMode>);
  await screen.findByText('AAPL');
  expect(fetcher).toHaveBeenCalledTimes(1); expect(window.location.hash).toBe('');
  expect(screen.getByText(/owner@example.test/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'אישור ושמירת ההחזקות' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ token: 'sealed', action: 'apply' });
  await screen.findByText(/ההחזקות נשמרו בהצלחה/);
});
