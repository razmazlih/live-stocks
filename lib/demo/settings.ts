import type { Settings } from '@/types';
import { demoRequest } from './client';

/** Retained only to migrate earlier browser-only demo data. */
export const DEMO_SETTINGS_KEY = 'livestocks:demo:settings:v1';

export function readDemoSettings(): Promise<Settings | null> {
  return demoRequest<Settings | null>('settings');
}

export async function saveDemoSettings(settings: Settings): Promise<void> {
  await demoRequest('settings', { method: 'PUT', body: JSON.stringify(settings) });
}
