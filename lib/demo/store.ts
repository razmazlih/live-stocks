import 'server-only';
import { mkdir, open, readFile, rename, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { seedDemoLedger, validateLedger, type DemoLedger } from './ledger';
import type { Settings } from '@/types';

export type DemoPreferences = { locale?: 'he' | 'en'; theme?: 'light' | 'dark' | 'system'; reduceTransparency?: boolean };
export type DemoState = { version: 1; ledger: DemoLedger; settings: Settings; preferences: DemoPreferences };
export type DemoImport = { ledger?: DemoLedger; settings?: Settings; preferences?: DemoPreferences };
export function demoStatePath() {
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? '')) throw new Error('The computer-local account is unavailable outside local development');
  const directory = process.env.LIVESTOCKS_DEMO_DATA_DIR
    ? path.resolve(process.env.LIVESTOCKS_DEMO_DATA_DIR)
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'LiveStocks')
      : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'LiveStocks');
  return path.join(directory, 'demo-account.json');
}
export function seedDemoState(): DemoState {
  return { version: 1, ledger: seedDemoLedger(), settings: { annualGrowthRate: 0.05, currency: 'USD', refreshInterval: 60 }, preferences: { locale: 'he', theme: 'system', reduceTransparency: false } };
}
export function validateDemoSettings(settings: unknown): asserts settings is Settings {
  if (!settings || typeof settings !== 'object') throw new Error('Invalid local account settings');
  const value = settings as Settings;
  if (!Number.isFinite(value.annualGrowthRate) || value.annualGrowthRate < 0 || value.annualGrowthRate > 1 || !['USD','ILS'].includes(value.currency) || !Number.isFinite(value.refreshInterval) || value.refreshInterval <= 0) throw new Error('Invalid local account settings');
}
export function validateDemoPreferences(preferences: unknown): asserts preferences is DemoPreferences {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) throw new Error('Invalid local account preferences');
  const value = preferences as DemoPreferences;
  if (Object.keys(value).some(key => !['locale','theme','reduceTransparency'].includes(key)) || (value.locale !== undefined && !['he','en'].includes(value.locale)) || (value.theme !== undefined && !['light','dark','system'].includes(value.theme)) || (value.reduceTransparency !== undefined && typeof value.reduceTransparency !== 'boolean')) throw new Error('Invalid local account preferences');
}
function validateState(value: unknown): asserts value is DemoState {
  const state = value as DemoState;
  if (!state || state.version !== 1) throw new Error('Saved local account format is invalid');
  validateLedger(state.ledger); validateDemoSettings(state.settings); validateDemoPreferences(state.preferences);
}
export async function readDemoState(): Promise<DemoState | null> {
  try { const value: unknown = JSON.parse(await readFile(demoStatePath(), 'utf8')); validateState(value); return value; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function save(state: DemoState) {
  validateState(state);
  const file = demoStatePath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(state, null, 2)); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => undefined); }
}
// A filesystem lock coordinates dev processes on different ports, not only this module instance.
async function locked<T>(operation: () => Promise<T>): Promise<T> {
  const file = demoStatePath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const lock = `${file}.lock`;
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const handle = await open(lock, 'wx', 0o600);
      await handle.writeFile(String(process.pid)); await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      // Recover only locks whose process has exited. A live owner is never evicted.
      try {
        const pid = Number(await readFile(lock, 'utf8'));
        if (Number.isInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); } catch (probe) { if ((probe as NodeJS.ErrnoException).code === 'ESRCH') { await unlink(lock); continue; } }
        } else if (Date.now() - (await stat(lock)).mtimeMs > 30_000) { await unlink(lock); continue; }
      } catch (probe) { if ((probe as NodeJS.ErrnoException).code === 'ENOENT') continue; }
      if (Date.now() > deadline) throw new Error('The local account is busy. Please try again.');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  try { return await operation(); } finally { await unlink(lock).catch(() => undefined); }
}
export async function migrateDemoState(input: DemoImport): Promise<{ state: DemoState; imported: boolean }> {
  return locked(async () => {
    const existing = await readDemoState();
    if (existing) return { state: existing, imported: false };
    const state = seedDemoState();
    if (input.ledger !== undefined) state.ledger = input.ledger;
    if (input.settings !== undefined) state.settings = input.settings;
    if (input.preferences !== undefined) state.preferences = { ...state.preferences, ...input.preferences };
    validateState(state); await save(state);
    return { state, imported: true };
  });
}
export async function updateDemoState<T>(operation: (state: DemoState) => T | Promise<T>): Promise<T> {
  return locked(async () => {
    const state = await readDemoState() ?? seedDemoState();
    const result = await operation(state);
    await save(state);
    return result;
  });
}
export async function resetDemoState(): Promise<DemoState> {
  return locked(async () => { const state = seedDemoState(); await save(state); return state; });
}
