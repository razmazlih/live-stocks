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
import { DEMO_SETTINGS_KEY } from '@/lib/demo/settings';
let computerSettings = { annualGrowthRate: 0.05, currency: 'USD', refreshInterval: 60 };
let failSave = false;
let failReset = false;
let computerFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  computerSettings = { annualGrowthRate: 0.05, currency: 'USD', refreshInterval: 60 };
  failSave = false;
  failReset = false;
  computerFetch = vi.fn(async (input: string, init?: RequestInit) => {
    if (input === '/api/local-demo/settings') {
      if (init?.method === 'PUT') {
        if (failSave) return Response.json({ message: 'Disk unavailable' }, { status: 503 });
        computerSettings = JSON.parse(String(init.body));
      }
      return Response.json(computerSettings);
    }
    if (input === '/api/local-demo/reset') return failReset ? Response.json({ message: 'Disk unavailable' }, { status: 503 }) : Response.json({ ok: true });
    return Response.json({});
  });
  vi.stubGlobal('fetch', computerFetch);
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function openSettings() {
  const view = render(<SettingsPage />);
  if (mocks.user.id !== 'local-demo-account') await waitFor(() => expect(mocks.single).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Save$/ })).toBeEnabled());
  return view;
}

describe('locally persisted demo settings', () => {
  it('does not allow saving defaults while the computer settings are loading', async () => {
    let finish!: (response: Response) => void;
    computerFetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const view = render(<SettingsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
    expect(view.container.querySelector('#growthRate')).toBeNull();
    expect(computerFetch).toHaveBeenCalledTimes(1);
    expect(mocks.setSettings).not.toHaveBeenCalled();
    finish(Response.json({ annualGrowthRate: 0.11, currency: 'ILS', refreshInterval: 60 }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Save$/ })).toBeEnabled());
    expect(document.getElementById('growthRate')).toHaveValue(0.11);
  });

  it('uses computer settings instead of a stale browser-only value', async () => {
    localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify({ annualGrowthRate: 0.3, currency: 'ILS', refreshInterval: 60 }));
    await openSettings();
    await waitFor(() => expect(document.getElementById('growthRate')).toHaveValue(0.05));
    expect(computerFetch).toHaveBeenCalledWith('/api/local-demo/settings', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('allows editing and restores computer settings after remount without account database requests', async () => {
    await openSettings();
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeEnabled();
    expect(document.getElementById('growthRate')).toBeEnabled();
    expect(document.getElementById('currency')).toBeEnabled();
    expect(document.getElementById('language')).toBeEnabled();
    fireEvent.change(document.getElementById('growthRate')!, { target: { value: '0.08' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(computerSettings).toEqual(expect.objectContaining({ annualGrowthRate: 0.08 }));
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

  it('reports a failed disk save without changing settings or claiming success', async () => {
    await openSettings();
    failSave = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fireEvent.change(document.getElementById('growthRate')!, { target: { value: '0.08' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.setSettings).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('requires the reset confirmation dialog and cancellation sends no reset request', async () => {
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: /^Reset demo$/ }));
    expect(screen.getByRole('dialog', { name: 'Reset this computer’s demo account?' })).toBeInTheDocument();
    expect(screen.getByText(/every browser on this computer/)).toBeInTheDocument();
    expect(computerFetch.mock.calls.some(([url]) => url === '/api/local-demo/reset')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(computerFetch.mock.calls.some(([url]) => url === '/api/local-demo/reset')).toBe(false);
  });

  it('shows a failed reset without removing the saved browser backup', async () => {
    localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify({ annualGrowthRate: 0.08, currency: 'ILS', refreshInterval: 60 }));
    failReset = true;
    await openSettings();
    fireEvent.click(screen.getByRole('button', { name: /^Reset demo$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm demo reset' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(computerFetch).toHaveBeenCalledWith('/api/local-demo/reset', expect.objectContaining({ method: 'POST', body: JSON.stringify({ confirm: true }) }));
    expect(localStorage.getItem(DEMO_SETTINGS_KEY)).not.toBeNull();
    expect(mocks.setSettings).not.toHaveBeenCalled();
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
