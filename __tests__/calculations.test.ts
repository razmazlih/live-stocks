import { describe, expect, it, vi, afterEach } from 'vitest';

import { calculatePositionMetrics } from '@/lib/calculations';
import { Position } from '@/types';

describe('calculatePositionMetrics', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const basePosition: Position = {
    symbol: 'TEST',
    display: 'Test Corp',
    imageUrl: '',
    entryPrice: 100,
    quantity: 10,
    entryDate: '2024-05-30T10:00:00Z',
    location: 'bank_one',
  };

  it('uses quote-based daily change for positions opened before today', () => {
    const now = new Date('2024-06-02T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const metrics = calculatePositionMetrics(basePosition, 120, 3.7, 0.05, 5);

    expect(metrics.dailyChange).toBe(5);
    expect(metrics.dailyChangePercent).toBeCloseTo((5 / (120 - 5)) * 100, 10);
  });

  it('uses average entry price for daily change when position opened today', () => {
    const today = new Date('2024-06-02T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(today);

    const todaysPosition: Position = {
      ...basePosition,
      entryPrice: 95,
      entryDate: '2024-06-02T09:00:00Z',
    };

    const metrics = calculatePositionMetrics(todaysPosition, 110, 3.7, 0.05, 3);

    expect(metrics.dailyChange).toBe(15);
    expect(metrics.dailyChangePercent).toBeCloseTo(((110 - 95) / 95) * 100, 10);
  });

  it('bases projected price on commission-adjusted cost basis', () => {
    const now = new Date('2024-06-10T12:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const positionWithCommission: Position = {
      ...basePosition,
      entryPrice: 100,
      quantity: 10,
      entryDate: '2024-06-10T12:00:00Z',
      lots: [
        {
          id: 'lot-1',
          positionId: 'pos-1',
          type: 'BUY',
          price: 100,
          quantity: 10,
          executedAt: '2024-06-10T12:00:00Z',
          hasCommission: true,
          commissionAmount: 20,
        },
      ],
    };

    const metrics = calculatePositionMetrics(positionWithCommission, 120, 3.7, 0);

    expect(metrics.projectedPrice).toBeCloseTo(102, 6);
  });
});
