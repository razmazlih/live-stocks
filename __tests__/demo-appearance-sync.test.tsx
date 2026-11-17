import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ theme: 'light', transparent: false, setTheme: vi.fn(), setTransparency: vi.fn(), read: vi.fn() }));
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: mocks.theme, setTheme: mocks.setTheme }) }));
vi.mock('@/components/theme-provider', () => ({ useAppearance: () => ({ reduceTransparency: mocks.transparent, setReduceTransparency: mocks.setTransparency }) }));
vi.mock('@/lib/demo/client', () => ({ readDemoPreferences: mocks.read }));
import { DemoAppearanceSync } from '@/components/settings/demo-appearance-sync';
const backupKey = 'livestocks:demo:appearance-before';
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); mocks.theme = 'light'; mocks.transparent = false; mocks.read.mockResolvedValue({ theme: 'dark', reduceTransparency: true }); });
afterEach(cleanup);

describe('shared demo appearance isolation', () => {
  it('applies computer preferences and restores the personal browser appearance on exit', async () => {
    const view = render(<DemoAppearanceSync />);
    await waitFor(() => expect(mocks.setTheme).toHaveBeenCalledWith('dark'));
    expect(mocks.setTransparency).toHaveBeenCalledWith(true);
    expect(JSON.parse(sessionStorage.getItem(backupKey)!)).toEqual({ theme: 'light', reduceTransparency: false });
    view.unmount();
    expect(mocks.setTheme).toHaveBeenLastCalledWith('light');
    expect(mocks.setTransparency).toHaveBeenLastCalledWith(false);
    expect(sessionStorage.getItem(backupKey)).toBeNull();
  });
  it('preserves the original browser backup through a hard reload of the demo', async () => {
    sessionStorage.setItem(backupKey, JSON.stringify({ theme: 'system', reduceTransparency: false }));
    mocks.theme = 'dark'; mocks.transparent = true;
    const view = render(<DemoAppearanceSync />);
    await waitFor(() => expect(mocks.setTheme).toHaveBeenCalledWith('dark'));
    expect(JSON.parse(sessionStorage.getItem(backupKey)!)).toEqual({ theme: 'system', reduceTransparency: false });
    view.unmount();
    expect(mocks.setTheme).toHaveBeenLastCalledWith('system');
    expect(mocks.setTransparency).toHaveBeenLastCalledWith(false);
  });
});
