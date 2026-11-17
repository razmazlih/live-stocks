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

beforeEach(() => {
  vi.clearAllMocks();
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
  await waitFor(() => expect(mocks.single).toHaveBeenCalledTimes(1));
  return view;
}

describe('settings in the read-only demo', () => {
  it('disables account changes and explains why saving is unavailable', async () => {
    await openSettings();
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
    expect(document.getElementById('growthRate')).toBeDisabled();
    expect(document.getElementById('currency')).toBeDisabled();
    expect(screen.getByText(/demo.*read.only|read.only.*demo/i)).toBeInTheDocument();
    expect(document.getElementById('language')).not.toBeDisabled();
  });

  it('blocks direct form submissions before any write or save lookup', async () => {
    const view = await openSettings();
    fireEvent.submit(view.container.querySelector('form')!);
    expect(mocks.single).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.setSettings).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
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
