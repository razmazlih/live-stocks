import { describe, expect, it } from 'vitest';

import { computeRealizedSalesWithFx } from '@/lib/positions';
import type { Position } from '@/types';

describe('computeRealizedSalesWithFx', () => {
  it('calculates ILS proceeds, cost basis and profit using buy/sell day FX rates', () => {
    const position: Position = {
      symbol: 'TEST',
      display: 'Test',
      imageUrl: '',
      entryPrice: 100,
      quantity: 0,
      entryDate: '2024-01-01T00:00:00Z',
      location: 'bank_one',
      lots: [
        {
          type: 'BUY',
          price: 100,
          quantity: 10,
          executedAt: '2024-01-01T00:00:00Z',
          hasCommission: false,
          commissionAmount: 0,
        },
        {
          type: 'SELL',
          price: 120,
          quantity: 10,
          executedAt: '2024-02-01T00:00:00Z',
          hasCommission: false,
          commissionAmount: 0,
        },
      ],
    };

    const fxMap = new Map<number, number>([
      [new Date('2024-01-01T00:00:00Z').getTime(), 3.5],
      [new Date('2024-02-01T00:00:00Z').getTime(), 3.8],
    ]);

    const sales = computeRealizedSalesWithFx(position, (timestamp) => fxMap.get(timestamp) ?? 3.7);
    expect(sales).toHaveLength(1);
    expect(sales[0].proceedsIls).toBeCloseTo(4560, 10);
    expect(sales[0].costBasisIls).toBeCloseTo(3500, 10);
    expect(sales[0].profitIls).toBeCloseTo(1060, 10);
  });

  it('applies FIFO across multiple buy lots with each lot day FX rate', () => {
    const position: Position = {
      symbol: 'FIFO',
      display: 'Fifo Inc',
      imageUrl: '',
      entryPrice: 100,
      quantity: 0,
      entryDate: '2024-01-01T00:00:00Z',
      location: 'bank_one',
      lots: [
        {
          type: 'BUY',
          price: 100,
          quantity: 5,
          executedAt: '2024-01-01T00:00:00Z',
          hasCommission: false,
          commissionAmount: 0,
        },
        {
          type: 'BUY',
          price: 110,
          quantity: 5,
          executedAt: '2024-01-10T00:00:00Z',
          hasCommission: false,
          commissionAmount: 0,
        },
        {
          type: 'SELL',
          price: 120,
          quantity: 8,
          executedAt: '2024-02-01T00:00:00Z',
          hasCommission: false,
          commissionAmount: 0,
        },
      ],
    };

    const fxMap = new Map<number, number>([
      [new Date('2024-01-01T00:00:00Z').getTime(), 3.5],
      [new Date('2024-01-10T00:00:00Z').getTime(), 3.6],
      [new Date('2024-02-01T00:00:00Z').getTime(), 3.8],
    ]);

    const sales = computeRealizedSalesWithFx(position, (timestamp) => fxMap.get(timestamp) ?? 3.7);
    expect(sales).toHaveLength(1);

    // Cost basis: 5*100 + 3*110 = 830 USD; ILS = 500*3.5 + 330*3.6 = 2938
    expect(sales[0].costBasisUsd).toBeCloseTo(830, 10);
    expect(sales[0].costBasisIls).toBeCloseTo(2938, 10);
    expect(sales[0].proceedsIls).toBeCloseTo(8 * 120 * 3.8, 10);
    expect((sales[0].proceedsIls ?? 0) - (sales[0].costBasisIls ?? 0)).toBeCloseTo(
      sales[0].profitIls ?? 0,
      10,
    );
  });
});
