import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/components/auth/auth-provider', () => ({ useAuth: () => ({ user: { id: 'owner', email: 'owner@example.test' } }) }));
import Page from '@/app/positions/sync/page';
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
it('keeps the sealed proposal through StrictMode effect replay and confirms only after click', async () => {
  window.history.replaceState(null, '', '/positions/sync#sealed');
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ input: { location: '10000000-0000-4000-8000-000000000001', observedAt: '2026-01-01' }, stale: false, plan: { sourceName: 'בית השקעות אישי', changes: [{ symbol: 'AAPL', quantity: 2, averageCostUsd: 100, acquiredOn: '2025-01-01', kind: 'reconcile', previousQuantity: 1, previousAverageCostUsd: 90 }], unchanged: [], blocked: [], canApply: true } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ applied: true }) });
  vi.stubGlobal('fetch', fetcher);
  render(<StrictMode><Page /></StrictMode>);
  await screen.findByText('AAPL');
  expect(fetcher).toHaveBeenCalledTimes(1); expect(window.location.hash).toBe('');
  expect(screen.getByText(/owner@example.test/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'אישור וסנכרון ההחזקות' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'אישור וסנכרון ההחזקות' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ token: 'sealed', action: 'apply', acknowledgeIncompleteHistory: true });
  await screen.findByText(/ההחזקות סונכרנו בהצלחה/);
});

function missingDateReview(extra: Record<string, unknown> = {}) {
  return { input: { location: '10000000-0000-4000-8000-000000000001', observedAt: '2026-11-16' }, stale: false, plan: { sourceName: 'בית השקעות אישי', changes: [{ symbol: 'AAPL', quantity: 2, averageCostUsd: 100, acquiredOn: null, kind: 'reconcile', previousQuantity: 1, previousAverageCostUsd: 90, ...extra }], unchanged: [], blocked: [], canApply: true } };
}
function response(data: unknown) { return { ok: true, json: async () => data }; }
function openOptionalDates() { fireEvent.click(screen.getByText('השלמת תאריך רכישה (לא חובה)')); }

it('keeps date completion optional and collapsed for a fast unknown-date sync', async () => {
  window.history.replaceState(null, '', '/positions/sync#sealed');
  const fetcher = vi.fn().mockResolvedValueOnce(response(missingDateReview())).mockResolvedValueOnce(response({ applied: true }));
  vi.stubGlobal('fetch', fetcher);
  render(<Page />);
  await screen.findByRole('table');
  expect(screen.getByText('השלמת תאריך רכישה (לא חובה)').closest('details')).not.toHaveAttribute('open');
  expect(screen.getByRole('button', { name: 'לפי המחיר' })).not.toBeVisible();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'אישור וסנכרון ההחזקות' }));
  await screen.findByText(/ההחזקות סונכרנו בהצלחה/);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1][1].body).action).toBe('apply');
});

it('saves a user-confirmed actual date with one final confirmation', async () => {
  window.history.replaceState(null, '', '/positions/sync#sealed');
  const fetcher = vi.fn().mockResolvedValueOnce(response(missingDateReview())).mockResolvedValueOnce(response({ applied: true }));
  vi.stubGlobal('fetch', fetcher);
  render(<Page />);
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('checkbox'));
  openOptionalDates();
  fireEvent.click(screen.getByRole('button', { name: 'תאריך ידוע' }));
  fireEvent.change(screen.getByLabelText('תאריך הרכישה בפועל של AAPL'), { target: { value: '2025-03-10' } });
  expect(screen.getByText('2025-03-10')).toBeTruthy();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'אישור וסנכרון ההחזקות' })).toBeDisabled();
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'אישור וסנכרון ההחזקות' }));
  await screen.findByText(/ההחזקות סונכרנו בהצלחה/);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ token: 'sealed', action: 'apply', acknowledgeIncompleteHistory: true, dates: [{ symbol: 'AAPL', acquiredOn: '2025-03-10', estimatedAcquiredOn: null }] });
});

it('keeps the latest price match estimated and saves it only with final confirmation', async () => {
  window.history.replaceState(null, '', '/positions/sync#sealed');
  const fetcher = vi.fn().mockResolvedValueOnce(response(missingDateReview()))
    .mockResolvedValueOnce(response({ status: 'matched', latestCandidateDate: '2026-09-14', candidates: [{ date: '2026-09-14', closeUsd: 100 }], warnings: ['התאמת מחיר אינה הוכחה למועד רכישה.'], estimated: true, canVerifyAcquisition: false }))
    .mockResolvedValueOnce(response({ applied: true }));
  vi.stubGlobal('fetch', fetcher);
  render(<Page />);
  await screen.findByRole('table');
  openOptionalDates();
  fireEvent.click(screen.getByRole('button', { name: 'לפי המחיר' }));
  await screen.findByRole('button', { name: 'בחירת תאריך משוער' });
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ token: 'sealed', action: 'date_candidates', symbol: 'AAPL' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByText('לא ידוע')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'בחירת תאריך משוער' }));
  expect(screen.getByText('2026-09-14 · משוער בלבד')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'אישור וסנכרון ההחזקות' }));
  await screen.findByText(/ההחזקות סונכרנו בהצלחה/);
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ token: 'sealed', action: 'apply', acknowledgeIncompleteHistory: true, dates: [{ symbol: 'AAPL', acquiredOn: null, estimatedAcquiredOn: '2026-09-14' }] });
});

it('offers a transaction screenshot path without uploading an image or making another request', async () => {
  window.history.replaceState(null, '', '/positions/sync#sealed');
  const fetcher = vi.fn().mockResolvedValueOnce(response(missingDateReview()));
  vi.stubGlobal('fetch', fetcher);
  render(<Page />);
  await screen.findByRole('table');
  openOptionalDates();
  fireEvent.click(screen.getByRole('button', { name: 'צילום עסקאות' }));
  expect(screen.getByText(/העלו בצ׳אט צילום של העסקה/)).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

function navigateToProposal(value: string) {
  act(() => {
    window.history.replaceState(null, '', `/positions/sync#${value}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

it('loads a second proposal in the same mounted StrictMode page and clears saved/acknowledged state', async () => {
  window.history.replaceState(null, '', '/positions/sync#first');
  const second = missingDateReview({ symbol: 'MSFT', acquiredOn: '2025-01-01' });
  const fetcher = vi.fn().mockResolvedValueOnce(response(missingDateReview()))
    .mockResolvedValueOnce(response({ applied: true })).mockResolvedValueOnce(response(second));
  vi.stubGlobal('fetch', fetcher);
  render(<StrictMode><Page /></StrictMode>);
  await screen.findByRole('table');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'אישור וסנכרון ההחזקות' }));
  await screen.findByText(/ההחזקות סונכרנו בהצלחה/);
  navigateToProposal('second');
  await screen.findByRole('cell', { name: 'MSFT' });
  expect(screen.queryByText(/ההחזקות סונכרנו בהצלחה/)).toBeNull();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(window.location.hash).toBe('');
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ token: 'second', action: 'review' });
});

it('ignores an older review response after hash navigation replaces the proposal', async () => {
  window.history.replaceState(null, '', '/positions/sync#first');
  let resolveFirst!: (value: ReturnType<typeof response>) => void;
  const fetcher = vi.fn().mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
    .mockResolvedValueOnce(response(missingDateReview({ symbol: 'MSFT', acquiredOn: '2025-01-01' })));
  vi.stubGlobal('fetch', fetcher);
  render(<StrictMode><Page /></StrictMode>);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  navigateToProposal('second');
  await screen.findByRole('cell', { name: 'MSFT' });
  await act(async () => { resolveFirst(response(missingDateReview())); });
  expect(screen.getByRole('cell', { name: 'MSFT' })).toBeTruthy();
  expect(screen.queryByRole('cell', { name: 'AAPL' })).toBeNull();
});

it('keeps the main sync available while an optional date lookup is still running', async () => {
  window.history.replaceState(null, '', '/positions/sync#sealed');
  const fetcher = vi.fn().mockResolvedValueOnce(response(missingDateReview()))
    .mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce(response({ applied: true }));
  vi.stubGlobal('fetch', fetcher);
  render(<Page />);
  await screen.findByRole('table');
  openOptionalDates();
  fireEvent.click(screen.getByRole('button', { name: 'לפי המחיר' }));
  expect(screen.getByRole('button', { name: 'לפי המחיר' })).toBeDisabled();
  expect(screen.getByRole('checkbox')).not.toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: 'אישור וסנכרון ההחזקות' })).not.toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'אישור וסנכרון ההחזקות' }));
  await screen.findByText(/ההחזקות סונכרנו בהצלחה/);
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ token: 'sealed', action: 'apply', acknowledgeIncompleteHistory: true });
});
