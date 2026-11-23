import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LocalMarketSwitcher } from '@/components/dashboard/local-market-switcher';
import { DEMO_USER_ID } from '@/lib/demo/data';
import { demoScenarioClock, portfolioNow, portfolioToday, readLocalMarketMode, selectLocalMarketMode, setReviewActive } from '@/lib/demo/review';
import { configureSupabaseUser, getLocalDemoDashboard, resetSupabaseClient } from '@/lib/supabase';

beforeEach(() => { vi.stubEnv('NODE_ENV', 'development'); });
afterEach(() => {
  cleanup();
  resetSupabaseClient();
  setReviewActive(false);
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('switches all local account snapshots, keeps the choice on remount and restores the real clock', async () => {
  configureSupabaseUser(DEMO_USER_ID);
  const fetcher = vi.fn().mockResolvedValue(Response.json({}));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<LocalMarketSwitcher locale="he" />);
  expect(screen.getByRole('radio', { name: 'זמן אמת' })).toBeChecked();
  for (const [label, mode, day] of [
    ['מסחר רגיל', 'regular', '2026-11-20'], ['מסחר מורחב', 'extended', '2026-11-20'], ['שוק סגור', 'closed', '2026-11-21'],
  ]) {
    fireEvent.click(screen.getByRole('radio', { name: label }));
    expect(screen.getByRole('radio', { name: label })).toBeChecked();
    expect(portfolioToday()).toBe(day);
    expect(portfolioNow()).toBe(demoScenarioClock());
    fetcher.mockResolvedValueOnce(Response.json({}));
    await getLocalDemoDashboard();
    expect(fetcher).toHaveBeenLastCalledWith('/api/local-demo/dashboard?scenario=' + mode, expect.anything());
  }
  view.unmount();
  render(<LocalMarketSwitcher locale="en" />);
  expect(screen.getByRole('radio', { name: 'Market closed' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'Real time' }));
  expect(demoScenarioClock()).toBeNull();
  expect(Math.abs(portfolioNow() - Date.now())).toBeLessThan(1000);
  await getLocalDemoDashboard();
  expect(fetcher).toHaveBeenLastCalledWith('/api/local-demo/dashboard', expect.anything());
});

it('preserves local review links and other URL state when changing the clock', () => {
  configureSupabaseUser(DEMO_USER_ID);
  setReviewActive(true);
  window.history.replaceState({}, '', '/?scenario=extended&source=securities#holdings');
  render(<LocalMarketSwitcher locale="en" />);
  expect(screen.getByRole('radio', { name: 'Extended hours' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'Regular hours' }));
  expect(window.location.search).toContain('scenario=regular');
  expect(portfolioNow()).toBe(Date.parse('2026-11-20T20:00:00Z'));
  fireEvent.click(screen.getByRole('radio', { name: 'Real time' }));
  expect(window.location.search).toBe('?source=securities');
  expect(window.location.hash).toBe('#holdings');
  expect(readLocalMarketMode()).toBe('realtime');
});

it('ignores forged storage and URL presets in a real account and on production', () => {
  configureSupabaseUser(DEMO_USER_ID);
  selectLocalMarketMode('closed');
  configureSupabaseUser('real-account');
  window.history.replaceState({}, '', '/?scenario=extended');
  const view = render(<LocalMarketSwitcher locale="en" />);
  expect(view.container).toBeEmptyDOMElement();
  selectLocalMarketMode('regular');
  expect(demoScenarioClock()).toBeNull();
  expect(getLocalDemoDashboard()).toBeNull();
  vi.stubEnv('NODE_ENV', 'production');
  configureSupabaseUser(DEMO_USER_ID);
  view.rerender(<LocalMarketSwitcher locale="he" />);
  selectLocalMarketMode('regular');
  expect(view.container).toBeEmptyDOMElement();
  expect(readLocalMarketMode()).toBe('realtime');
  expect(getLocalDemoDashboard()).toBeNull();
});
