// @vitest-environment node
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { buildScreenshotSyncPlan } from '@/lib/screenshot-sync';
import { ScreenshotReconciliationRetiredError } from '@/lib/screenshot-reconciliation-retired';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/better-auth-config', () => ({ betterAuthConfiguration: () => ({ secret: 'test-secret-that-is-at-least-thirty-two-characters', origin: 'https://example.test' }) }));
import { reviseScreenshotDates, suggestScreenshotDate, prepareScreenshotSync, openScreenshotProposal, applyScreenshotSync, reviewScreenshotSync } from '@/lib/screenshot-sync-server';
vi.mock('@/lib/purchase-date-candidates', () => ({ findPurchaseDateCandidates: vi.fn(async () => ({ status: 'matched', estimated: true, canVerifyAcquisition: false, latestCandidateDate: '2025-10-01' })) }));
import { findPurchaseDateCandidates } from '@/lib/purchase-date-candidates';
import type { Principal } from '@/lib/auth/server';
const rpc = vi.fn();
const principal = { userId: 'owner-one', kind: 'mcp', supabase: { rpc } } as unknown as Principal;
const web = { ...principal, kind: 'web' } as Principal;
const sources = [{ id: '10000000-0000-4000-8000-000000000001', name: 'בית השקעות אישי', archived_at: null, created_at: '2026-01-01', legacy_location: null }];
const input = { location: '10000000-0000-4000-8000-000000000001', observedAt: '2026-01-01', rows: [{ symbol: 'AAPL', quantity: 2, averageCostUsd: 100, acquiredOn: '2025-01-01' }] };
// Historical encrypted links stay readable, but cannot mutate the portfolio.
function legacyProposal(value = input) {
  const data = { version: 2, owner: principal.userId, expires: Date.now() + 900000,
    fingerprint: 'a'.repeat(32), input: value, lotIds: value.rows.map(() => randomUUID()),
    importSymbols: value.rows.map(row => row.symbol), canApply: true };
  const key = createHash('sha256').update('livestocks:screenshot-sync:v1:').update('test-secret-that-is-at-least-thirty-two-characters').digest();
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('livestocks:screenshot-sync:v1'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
beforeEach(() => { vi.useRealTimers(); rpc.mockReset(); rpc.mockResolvedValue({ data: { positions: [], lots: [], sources, fingerprint: 'a'.repeat(32) }, error: null }); });
describe('owner-bound screenshot proposal', () => {
  it('retires preparation before reading portfolio data or issuing an encrypted link', async () => {
    await expect(prepareScreenshotSync(principal, input)).rejects.toBeInstanceOf(ScreenshotReconciliationRetiredError);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects wrong owner, tampering and expiry', async () => {
    const value = legacyProposal();
    expect(() => openScreenshotProposal(value, 'owner-two')).toThrow();
    const changedPrefix = value[0] === 'Z' ? 'Y' : 'Z';
    expect(() => openScreenshotProposal(changedPrefix + value.slice(1), 'owner-one')).toThrow();
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    expect(() => openScreenshotProposal(value, 'owner-one')).toThrow();
    vi.useRealTimers();
  });
  it('rejects old review links for both website and MCP before a database write', async () => {
    const value = legacyProposal();
    await expect(applyScreenshotSync(principal, value)).rejects.toBeInstanceOf(ScreenshotReconciliationRetiredError);
    await expect(applyScreenshotSync(web, value)).rejects.toBeInstanceOf(ScreenshotReconciliationRetiredError);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('revises owner-bound dates without converting a price estimate into an actual acquisition', async () => {
    const value = legacyProposal();
    const changed = await reviseScreenshotDates(web, value, [{ symbol: 'AAPL', acquiredOn: null, estimatedAcquiredOn: '2025-10-01' }]);
    const sealed = openScreenshotProposal(changed.token, principal.userId);
    expect(sealed.input.rows[0]).toMatchObject({ acquiredOn: null, estimatedAcquiredOn: '2025-10-01' });
    await expect(reviseScreenshotDates(web, value, [{ symbol: 'MSFT', acquiredOn: '2025-10-01' }])).rejects.toThrow();
    await expect(reviseScreenshotDates(web, value, [{ symbol: 'AAPL', acquiredOn: '2025-10-01', estimatedAcquiredOn: '2025-09-01' }])).rejects.toThrow();
  });
  it('keeps private date lookup scoped to token symbols and observation date', async () => {
    const value = legacyProposal();
    await expect(suggestScreenshotDate(web, value, 'AAPL')).resolves.toMatchObject({ estimated: true, canVerifyAcquisition: false });
    expect(findPurchaseDateCandidates).toHaveBeenCalledWith({ symbol: 'AAPL', priceUsd: 100, lookbackDays: 1825, throughDate: '2026-01-01' });
    await expect(suggestScreenshotDate(web, value, 'MSFT')).rejects.toThrow();
    await expect(suggestScreenshotDate({ ...web, userId: 'other' }, value, 'AAPL')).rejects.toThrow();
  });
  it('retains read-only stale review detection for a historical link', async () => {
    const value = legacyProposal();
    rpc.mockResolvedValueOnce({ data: { positions: [], lots: [], sources, fingerprint: 'b'.repeat(32) }, error: null });
    expect((await reviewScreenshotSync(web, value)).stale).toBe(true);
    expect(buildScreenshotSyncPlan(input, []).canApply).toBe(true);
  });
});
