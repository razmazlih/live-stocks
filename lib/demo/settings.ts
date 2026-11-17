import type { Settings } from '@/types';

/** Separate from all personal-account and legacy settings storage. */
export const DEMO_SETTINGS_KEY = 'livestocks:demo:settings:v1';

function validSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Settings;
  return Number.isFinite(settings.annualGrowthRate) && settings.annualGrowthRate >= 0 && settings.annualGrowthRate <= 1
    && ['USD', 'ILS'].includes(settings.currency)
    && Number.isFinite(settings.refreshInterval) && settings.refreshInterval > 0;
}

export function readDemoSettings(): Settings | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DEMO_SETTINGS_KEY) ?? 'null');
    return validSettings(value) ? value : null;
  } catch { return null; }
}

export function saveDemoSettings(settings: Settings): void {
  if (!validSettings(settings)) throw new Error('Invalid demo settings');
  // Propagate storage errors so the UI never claims an unsaved change persisted.
  localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify({ annualGrowthRate: settings.annualGrowthRate,
    currency: settings.currency, refreshInterval: settings.refreshInterval }));
}
