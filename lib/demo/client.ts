import { isReviewActive, reviewRequest } from './review';
import type { Settings } from '@/types';
import { TRANSPARENCY_STORAGE_KEY } from '@/lib/appearance-preferences';

export type DemoPreferences = { locale?: 'he' | 'en'; theme?: 'light' | 'dark' | 'system'; reduceTransparency?: boolean };
export type DemoState = { exists?: boolean; settings: Settings | null; preferences: DemoPreferences };
const legacyKeys = ['livestocks:demo:ledger:v1', 'livestocks:demo:settings:v1', 'livestocks:demo:locale:v1'];
function browserBackup(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export async function demoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (isReviewActive()) return reviewRequest(path, init) as T;
  const response = await fetch(`/api/local-demo/${path}`, { ...init, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(failure?.message ?? failure?.error ?? 'Unable to access the local demo account');
  }
  return response.json() as Promise<T>;
}

/** Import only before the computer account exists. Keep browser backups on disk conflicts. */
export async function initializeComputerDemo(signal?: AbortSignal): Promise<DemoState> {
  const current = await demoRequest<DemoState>('state', { signal });
  if (current.exists) return current;
  const ledger = browserBackup(legacyKeys[0]);
  const settings = browserBackup(legacyKeys[1]);
  const locale = browserBackup(legacyKeys[2]);
  const theme = browserBackup('livestocks-theme');
  const transparency = browserBackup(TRANSPARENCY_STORAGE_KEY);
  const preferences: DemoPreferences = {};
  if (locale === 'he' || locale === 'en') preferences.locale = locale;
  if (theme === 'light' || theme === 'dark' || theme === 'system') preferences.theme = theme;
  if (transparency !== null) preferences.reduceTransparency = transparency === 'true';
  return demoRequest<DemoState>('import', { method: 'POST', signal, body: JSON.stringify({
    ...(ledger ? { ledger: JSON.parse(ledger) as unknown } : {}),
    ...(settings ? { settings: JSON.parse(settings) as unknown } : {}), preferences,
  }) });
}

export function readDemoPreferences(): Promise<DemoPreferences> { return demoRequest('preferences'); }
export function saveDemoPreferences(preferences: DemoPreferences): Promise<DemoPreferences> {
  return demoRequest('preferences', { method: 'PATCH', body: JSON.stringify(preferences) });
}

export async function resetComputerDemo(): Promise<void> {
  await demoRequest('reset', { method: 'POST', body: JSON.stringify({ confirm: true }) });
  if (isReviewActive()) return;
  for (const key of legacyKeys) {
    try { localStorage.removeItem(key); } catch { /* The reset disk account remains authoritative. */ }
  }
}
