import { afterEach, expect, it, vi } from 'vitest';
import { getUsdToIlsRate } from '@/lib/services/exchange-rate';

afterEach(() => vi.unstubAllGlobals());
it('does not invent a current FX rate when the provider omits ILS', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: {} }) }));
  expect(await getUsdToIlsRate({ allowFallback: false })).toBeNaN();
});
it('uses the provider rate in strict mode', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: { ILS: 3.25 } }) }));
  expect(await getUsdToIlsRate({ allowFallback: false })).toBe(3.25);
});
