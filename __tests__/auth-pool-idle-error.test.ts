// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { createAuthPool } from '@/lib/auth/better-auth';
import type { BetterAuthConfiguration } from '@/lib/auth/better-auth-config';

// Exercise the installed pg Pool's eviction/acquisition logic without a network.
class SyntheticClient extends EventEmitter {
  static instances: SyntheticClient[] = [];
  static queryFailure: Error | null = null;
  _queryable = true;
  _ending = false;
  ended = false;
  connectionParameters = { password: 'synthetic-never-log-this' };
  constructor() { super(); SyntheticClient.instances.push(this); }
  connect(callback: (error?: Error) => void) { queueMicrotask(() => callback()); }
  end(callback?: () => void) { this.ended = true; this._ending = true; callback?.(); }
  ref() {}
  query(_text: unknown, _values: unknown, callback: (error: Error | null, result?: object) => void) {
    const error = SyntheticClient.queryFailure; SyntheticClient.queryFailure = null;
    queueMicrotask(() => callback(error, error ? undefined : { rows: [{ ok: true }] }));
  }
}
const config: BetterAuthConfiguration = { origin: 'http://localhost:3109', issuer: 'http://localhost:3109/api/auth',
  websiteAudience: 'http://localhost:3109/api/web', mcpAudience: 'http://localhost:3109/api/mcp',
  websiteClientId: 'website-test', mcpClientId: 'mcp-client-test', secret: 's'.repeat(48),
  databaseUrl: 'postgres://livestocks_auth_backend:synthetic-never-log-this@127.0.0.1:5432/synthetic' };
afterEach(() => { vi.restoreAllMocks(); SyntheticClient.instances = []; SyntheticClient.queryFailure = null; });

describe('authentication pool idle disconnects', () => {
  it('silently evicts a failed idle client, reconnects, and still rejects active query errors', async () => {
    const logs = [vi.spyOn(console, 'error'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'log')].map(spy => spy.mockImplementation(() => {}));
    const pool = createAuthPool(config);
    (pool as unknown as { Client: typeof SyntheticClient }).Client = SyntheticClient;
    try {
      const first = await pool.connect(); first.release();
      expect(pool.idleCount).toBe(1);
      const failed = SyntheticClient.instances[0];
      const error = Object.assign(new Error('administrative shutdown'), { code: '57P01', credential: 'synthetic-never-log-this' });
      expect(() => failed.emit('error', error)).not.toThrow();
      expect(failed.ended).toBe(true); expect(pool.totalCount).toBe(0); expect(pool.idleCount).toBe(0);
      const replacement = await pool.connect();
      expect(replacement).not.toBe(first); expect(SyntheticClient.instances).toHaveLength(2);
      replacement.release();
      expect((await pool.query('select 1')).rows).toEqual([{ ok: true }]);
      const queryError = Object.assign(new Error('query denied'), { code: '42501' });
      SyntheticClient.queryFailure = queryError;
      await expect(pool.query('select forbidden')).rejects.toBe(queryError);
      expect(pool.totalCount).toBe(0);
      expect((await pool.query('select 1')).rows).toEqual([{ ok: true }]);
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    } finally { await pool.end(); }
  });
});
