import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import { AppearanceSettings } from '@/components/settings/appearance-settings';
import { TRANSPARENCY_QUERY, TRANSPARENCY_STORAGE_KEY, transparencyInitScript } from '@/lib/appearance-preferences';

let systemTransparency = false;
let systemDark = false;
const transparencyListeners = new Set<() => void>();

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
  delete document.documentElement.dataset.reduceTransparency;
  systemTransparency = false;
  systemDark = false;
  transparencyListeners.clear();
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    get matches() { return query === TRANSPARENCY_QUERY ? systemTransparency : systemDark; },
    media: query,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: (_event: string, callback: () => void) => { if (query === TRANSPARENCY_QUERY) transparencyListeners.add(callback); },
    removeEventListener: (_event: string, callback: () => void) => transparencyListeners.delete(callback),
  })));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function renderSettings() {
  render(<ThemeProvider><AppearanceSettings locale="en" /></ThemeProvider>);
}

describe('appearance preferences', () => {
  it('defaults to system and persists explicit light, dark and system selections', () => {
    renderSettings();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    for (const [label, value] of [['Dark', 'dark'], ['Light', 'light'], ['System', 'system']]) {
      fireEvent.click(screen.getByRole('radio', { name: label }));
      expect(localStorage.getItem('livestocks-theme')).toBe(value);
      expect(screen.getByRole('radio', { name: label })).toBeChecked();
    }
  });

  it('restores a stored theme and applies its document class', () => {
    localStorage.setItem('livestocks-theme', 'dark');
    renderSettings();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('persists transparency independently and restores it on remount', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce transparency' }));
    expect(localStorage.getItem(TRANSPARENCY_STORAGE_KEY)).toBe('true');
    expect(document.documentElement.dataset.reduceTransparency).toBe('true');
    cleanup();
    renderSettings();
    expect(screen.getByRole('switch', { name: 'Reduce transparency' })).toBeChecked();
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce transparency' }));
    expect(document.documentElement.dataset.reduceTransparency).toBe('false');
  });

  it('honors changes to device reduced transparency without overriding the local preference', () => {
    renderSettings();
    act(() => { systemTransparency = true; transparencyListeners.forEach((listener) => listener()); });
    expect(document.documentElement.dataset.reduceTransparency).toBe('true');
    expect(screen.getByRole('switch', { name: 'Reduce transparency' })).toBeDisabled();
    act(() => { systemTransparency = false; transparencyListeners.forEach((listener) => listener()); });
    expect(document.documentElement.dataset.reduceTransparency).toBe('false');
    expect(screen.getByRole('switch', { name: 'Reduce transparency' })).not.toBeDisabled();
  });

  it('updates local transparency when another tab changes its preference', () => {
    renderSettings();
    localStorage.setItem(TRANSPARENCY_STORAGE_KEY, 'true');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: TRANSPARENCY_STORAGE_KEY, newValue: 'true' })));
    expect(document.documentElement.dataset.reduceTransparency).toBe('true');
  });

  it.each(['stored', 'system', 'blocked-storage'])('prepaint script initializes transparency safely for %s', (source) => {
    if (source === 'stored') localStorage.setItem(TRANSPARENCY_STORAGE_KEY, 'true');
    if (source === 'system') systemTransparency = true;
    if (source === 'blocked-storage') {
      systemTransparency = true;
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked'); });
    }
    window.eval(transparencyInitScript);
    expect(document.documentElement.dataset.reduceTransparency).toBe('true');
  });
});
