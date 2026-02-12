import { describe, expect, it } from 'vitest';

import { buildUsdIlsRateResolver } from '@/lib/services/historical-fx';
import type { HistoricalPoint } from '@/types';

describe('buildUsdIlsRateResolver', () => {
  const points: HistoricalPoint[] = [
    { timestamp: new Date('2024-01-01T12:00:00Z').getTime(), close: 3.7 },
    { timestamp: new Date('2024-01-03T12:00:00Z').getTime(), close: 3.8 },
  ];

  it('returns exact day rate when available', () => {
    const resolver = buildUsdIlsRateResolver(points, 3.5);
    const value = resolver(new Date('2024-01-03T01:00:00Z').getTime());
    expect(value).toBeCloseTo(3.8, 10);
  });

  it('falls back to previous day rate when target day is missing', () => {
    const resolver = buildUsdIlsRateResolver(points, 3.5);
    const value = resolver(new Date('2024-01-02T10:00:00Z').getTime());
    expect(value).toBeCloseTo(3.7, 10);
  });

  it('falls back to provided fallback rate when no historical rates exist', () => {
    const resolver = buildUsdIlsRateResolver([], 3.91);
    const value = resolver(new Date('2024-01-02T10:00:00Z').getTime());
    expect(value).toBeCloseTo(3.91, 10);
  });
});
