import { describe, expect, it, vi, afterEach } from 'vitest';

import { calculatePositionMetrics, calculateRequiredExitPrice, hasMaterialExitPriceGap } from '@/lib/calculations';
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

describe('calculateRequiredExitPrice', () => {
  const asOf = new Date('2025-01-01T00:00:00Z');
  const basePosition: Position = {
    symbol: 'TEST',
    display: 'Test Corp',
    imageUrl: '',
    entryPrice: 100,
    quantity: 10,
    entryDate: '2024-01-01T00:00:00Z',
    location: 'bank_one',
  };

  it('recovers a partial realized loss and still reaches the annual target', () => {
    const position: Position = {
      ...basePosition,
      lots: [
        { type: 'BUY', price: 100, quantity: 10, executedAt: '2024-01-01T00:00:00Z', hasCommission: false, commissionAmount: 0 },
        { type: 'SELL', price: 90, quantity: 4, executedAt: '2025-01-01T00:00:00Z', hasCommission: false, commissionAmount: 0 },
      ],
    };

    expect(calculateRequiredExitPrice([position], 0.1, asOf)).toBeCloseTo(123.369217, 5);
  });

  it('includes prior cycles and both accounts for the same symbol', () => {
    const closedCycle: Position = {
      ...basePosition,
      id: 'bank-one-cycle',
      quantity: 0,
      location: 'bank_one',
      lots: [
        { type: 'BUY', price: 100, quantity: 1, executedAt: '2024-01-01T00:00:00Z', hasCommission: false, commissionAmount: 0 },
        { type: 'SELL', price: 80, quantity: 1, executedAt: '2025-01-01T00:00:00Z', hasCommission: false, commissionAmount: 0 },
      ],
    };
    const openCycle: Position = {
      ...basePosition,
      id: 'bank-two-cycle',
      quantity: 2,
      location: 'bank_two',
      lots: [
        { type: 'BUY', price: 200, quantity: 2, executedAt: '2025-01-01T00:00:00Z', hasCommission: false, commissionAmount: 0 },
      ],
    };

    expect(calculateRequiredExitPrice([closedCycle, openCycle], 0.1, asOf)).toBeCloseTo(215.010765, 5);
  });

  it('uses recorded commissions and does not add a future sale commission', () => {
    const position: Position = {
      ...basePosition,
      lots: [
        { type: 'BUY', price: 100, quantity: 10, executedAt: '2025-01-01T00:00:00Z', hasCommission: true, commissionAmount: 20 },
      ],
    };

    expect(calculateRequiredExitPrice([position], 0, asOf)).toBeCloseTo(102, 6);
  });

  it('omits the target when the symbol has no open lots or complete transaction data', () => {
    expect(calculateRequiredExitPrice([{ ...basePosition, quantity: 0, lots: [] }], 0.1, asOf)).toBeUndefined();
    expect(calculateRequiredExitPrice([{ ...basePosition, quantity: 10 }], 0.1, asOf)).toBeUndefined();
    expect(calculateRequiredExitPrice([{
      ...basePosition,
      lots: [{ type: 'BUY', price: 100, quantity: 10, executedAt: 'invalid-date', hasCommission: false, commissionAmount: 0 }],
    }], 0.1, asOf)).toBeUndefined();
  });
});

describe('hasMaterialExitPriceGap', () => {
  it('hides differences below one cent and shows a one-cent gap', () => {
    expect(hasMaterialExitPriceGap(100, 100.009)).toBe(false);
    expect(hasMaterialExitPriceGap(100, 100.01)).toBe(true);
    expect(hasMaterialExitPriceGap(100, undefined)).toBe(false);
  });
});
