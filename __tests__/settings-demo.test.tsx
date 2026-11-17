import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { id: 'local-demo-account' },
  settings: { annualGrowthRate: 0.05, currency: 'USD', refreshInterval: 60 },
  setSettings: vi.fn(), getClient: vi.fn(), single: vi.fn(), update: vi.fn(), insert: vi.fn(), mutation: vi.fn(),
  success: vi.fn(), error: vi.fn(), info: vi.fn(),
}));
vi.mock('@/lib/context', () => ({ useApp: () => ({ locale: 'en', setLocale: vi.fn(), settings: mocks.settings, setSettings: mocks.setSettings }) }));
vi.mock('@/components/auth/auth-provider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: mocks.getClient }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error, info: mocks.info } }));
vi.mock('@/components/auth/account-settings', () => ({ AccountSettings: () => null }));
vi.mock('@/components/settings/investment-source-settings', () => ({ InvestmentSourceSettings: () => null }));
vi.mock('@/components/settings/appearance-settings', () => ({ AppearanceSettings: () => null }));
vi.mock('@/components/dashboard/dashboard-route-shell', () => ({ DashboardRouteShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/dashboard/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/dashboard/page-primitives', () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { DashboardContainer: Container, DashboardMain: Container, DashboardSurface: Container };
});
import SettingsPage from '@/app/settings/page';
import { DEMO_SETTINGS_KEY, readDemoSettings } from '@/lib/demo/settings';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.user.id = 'local-demo-account';
  mocks.single.mockResolvedValue({ data: { id: 'settings-1', annual_growth_rate: 0.05, currency: 'USD', refresh_interval: 60 }, error: null });
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.single, update: mocks.update, insert: mocks.insert };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  mocks.update.mockReturnValue({ eq: mocks.mutation });
  mocks.mutation.mockResolvedValue({ error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.getClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openSettings() {
  const view = render(<SettingsPage />);
  if (mocks.user.id !== 'local-demo-account') await waitFor(() => expect(mocks.single).toHaveBeenCalledTimes(1));
  return view;
}

describe('locally persisted demo settings', () => {
  it.each(['broken json', JSON.stringify({ annualGrowthRate: -1, currency: 'USD', refreshInterval: 60 }), JSON.stringify({ annualGrowthRate: 0.05, currency: 'EUR', refreshInterval: 60 })])('ignores corrupt or invalid stored settings: %s', (value) => {
    localStorage.setItem(DEMO_SETTINGS_KEY, value);
    expect(readDemoSettings()).toBeNull();
  });

  it('allows editing and restores saved demo settings after remount without database requests', async () => {
    await openSettings();
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeEnabled();
    expect(document.getElementById('growthRate')).toBeEnabled();
    expect(document.getElementById('currency')).toBeEnabled();
    expect(document.getElementById('language')).toBeEnabled();
    fireEvent.change(document.getElementById('growthRate')!, { target: { value: '0.08' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem(DEMO_SETTINGS_KEY)!)).toEqual(expect.objectContaining({ annualGrowthRate: 0.08 }));
    expect(mocks.setSettings).toHaveBeenCalledWith(expect.objectContaining({ annualGrowthRate: 0.08 }));
    cleanup();
    await openSettings();
    await waitFor(() => expect(document.getElementById('growthRate')).toHaveValue(0.08));
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not apply stored demo settings to a real account', async () => {
    const demoSettings = { annualGrowthRate: 0.12, currency: 'ILS', refreshInterval: 60 };
    localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify(demoSettings));
    mocks.user.id = 'real-account';
    await openSettings();
    await waitFor(() => expect(document.getElementById('growthRate')).toHaveValue(0.05));
    expect(document.getElementById('currency')).toHaveTextContent('USD');
    expect(JSON.parse(localStorage.getItem(DEMO_SETTINGS_KEY)!)).toEqual(demoSettings);
  });

  it('reports a failed local save without changing settings or claiming success', async () => {
    await openSettings();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fireEvent.change(document.getElementById('growthRate')!, { target: { value: '0.08' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.setSettings).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('still saves changes for a real account', async () => {
    mocks.user.id = 'real-account';
    await openSettings();
    fireEvent.change(document.getElementById('growthRate')!, { target: { value: '0.08' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ annual_growth_rate: 0.08 }));
    expect(mocks.setSettings).toHaveBeenCalledWith(expect.objectContaining({ annualGrowthRate: 0.08 }));
  });

  it('does not insert settings when the existing-row lookup fails', async () => {
    mocks.user.id = 'real-account';
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await openSettings();
    mocks.single.mockResolvedValueOnce({ data: null, error: { message: 'Unavailable', code: 'NETWORK_ERROR' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
