// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
vi.mock('server-only', () => ({}));
import { demoStatePath, readDemoState, migrateDemoState, updateDemoState, resetDemoState } from '@/lib/demo/store';

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'livestocks-demo-test-'));
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('LIVESTOCKS_DEMO_DATA_DIR', folder);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(folder, { recursive: true, force: true }); });

describe('computer-local demo state', () => {
  it('persists one shared state across independent reads and module reloads', async () => {
    expect(await readDemoState()).toBeNull();
    await migrateDemoState({ settings: { annualGrowthRate: 0.08, currency: 'ILS', refreshInterval: 60 } });
    await updateDemoState(state => { state.ledger.positions[0].display = 'Shared local holding'; });
    const firstBrowser = await readDemoState();
    vi.resetModules();
    const restarted = await import('@/lib/demo/store');
    const secondBrowser = await restarted.readDemoState();
    expect(secondBrowser).toEqual(firstBrowser);
    expect(secondBrowser?.settings.currency).toBe('ILS');
    expect(secondBrowser?.ledger.positions[0].display).toBe('Shared local holding');
    expect((await stat(demoStatePath())).mode & 0o777).toBe(0o600);
  });

  it('migrates browser data only once, preserving newer disk data on another browser', async () => {
    const first = await migrateDemoState({ settings: { annualGrowthRate: 0.08, currency: 'ILS', refreshInterval: 60 } });
    expect(first.imported).toBe(true);
    const second = await migrateDemoState({ settings: { annualGrowthRate: 0.12, currency: 'USD', refreshInterval: 15 } });
    expect(second.imported).toBe(false);
    expect(second.state.settings.annualGrowthRate).toBe(0.08);
    expect(second.state.settings.currency).toBe('ILS');
  });

  it('serializes concurrent updates without losing changes', async () => {
    await migrateDemoState({});
    await Promise.all(Array.from({ length: 12 }, (_, index) => updateDemoState(state => {
      state.ledger.purchases[`test-${index}`] = { input: String(index), result: { position_id: 'example', lot_id: 'example', reused: true } };
    })));
    expect(Object.keys((await readDemoState())!.ledger.purchases)).toHaveLength(12);
    expect(JSON.parse(await readFile(demoStatePath(), 'utf8')).version).toBe(1);
  });

  it('coordinates different server processes sharing the same computer file', async () => {
    await migrateDemoState({});
    const empty = join(folder, 'server-only.mjs');
    const config = join(folder, 'vite.config.mjs');
    const runner = join(folder, 'writer.ts');
    await writeFile(empty, 'export {};');
    await writeFile(config, `export default {resolve:{alias:{'@':${JSON.stringify(process.cwd())},'server-only':${JSON.stringify(empty)}}}};`);
    await writeFile(runner, `import {updateDemoState} from ${JSON.stringify(join(process.cwd(), 'lib/demo/store.ts'))};
      await updateDemoState(async state => { await new Promise(resolve=>setTimeout(resolve,75)); state.ledger.purchases[process.env.WRITER_ID] = {input:'test',result:{}}; });`);
    const execute = promisify(execFile);
    await Promise.all(['one', 'two'].map(id => execute(process.execPath, [join(process.cwd(), 'node_modules/vite-node/vite-node.mjs'), '--config', config, runner], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'development', LIVESTOCKS_DEMO_DATA_DIR: folder, WRITER_ID: id }, timeout: 15_000,
    })));
    expect(Object.keys((await readDemoState())!.ledger.purchases).sort()).toEqual(['one', 'two']);
  }, 20_000);

  it('preserves a corrupted saved file instead of silently resetting it', async () => {
    await writeFile(demoStatePath(), '{broken');
    await expect(readDemoState()).rejects.toThrow();
    await expect(migrateDemoState({})).rejects.toThrow();
    await expect(updateDemoState(state => { state.settings.currency = 'ILS'; })).rejects.toThrow();
    expect(await readFile(demoStatePath(), 'utf8')).toBe('{broken');
  });

  it('keeps an intentionally empty portfolio and resets only through an explicit reset', async () => {
    await migrateDemoState({});
    await updateDemoState(state => {
      state.ledger.positions = []; state.ledger.position_lots = []; state.ledger.position_plans = [];
      state.settings.annualGrowthRate = 0.17; state.preferences.locale = 'en';
      state.ledger.investment_sources!.push({ id: 'other-source', name: 'Other source' });
      state.ledger.watchlist_groups = [{ id: 'local-group', name: 'Saved group' }];
      state.ledger.watchlist_tickers = [{ id: 'local-ticker', group_id: 'local-group', symbol: 'TSLA' }];
    });
    expect((await readDemoState())!.ledger.positions).toHaveLength(0);
    const reset = await resetDemoState();
    expect(reset.ledger.positions).toHaveLength(3);
    expect(reset.settings.annualGrowthRate).toBe(0.05);
    expect(reset.preferences).toEqual({ locale: 'he', theme: 'system', reduceTransparency: false });
    expect(reset.ledger.investment_sources).toHaveLength(1);
    expect(reset.ledger.watchlist_groups).toHaveLength(0);
    expect(reset.ledger.watchlist_tickers).toHaveLength(0);
    expect((await readDemoState())!.ledger.positions).toHaveLength(3);
    expect((await migrateDemoState({ settings: { annualGrowthRate: 0.2, currency: 'ILS', refreshInterval: 60 } })).imported).toBe(false);
    expect((await readDemoState())!.settings.annualGrowthRate).toBe(0.05);
  });

  it('does not persist changes when a mutation throws', async () => {
    await migrateDemoState({});
    const before = await readFile(demoStatePath(), 'utf8');
    await expect(updateDemoState(state => { state.ledger.positions = []; throw new Error('Rejected'); })).rejects.toThrow('Rejected');
    expect(await readFile(demoStatePath(), 'utf8')).toBe(before);
  });
});
