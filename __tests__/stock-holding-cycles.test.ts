import { describe, expect, it } from 'vitest';
import { buildStockHoldingCycles } from '@/lib/stock-holding-cycles';
import type { Position, PositionLot } from '@/types';

const lot = (type: PositionLot['type'], quantity: number, date: string): PositionLot => ({
  type, quantity, price: 100, executedAt: `${date}T12:00:00Z`, hasCommission: false, commissionAmount: 0,
});
const position = (id: string, lots: PositionLot[], location: Position['location'] = 'bank_one'): Position => ({
  id, symbol: 'MSFT', display: 'Microsoft', imageUrl: '', entryPrice: 100, quantity: 0,
  entryDate: '2025-01-01T12:00:00Z', location, lots,
});

describe('buildStockHoldingCycles', () => {
  it('separates a full exit from a later repurchase and retains partial sales in the same cycle', () => {
    const cycles = buildStockHoldingCycles([position('one', [
      lot('BUY', 10, '2025-01-01'), lot('SELL', 4, '2025-02-01'),
      lot('SELL', 6, '2025-03-01'), lot('BUY', 5, '2025-06-01'),
    ])]);
    expect(cycles).toHaveLength(2);
    expect(cycles[0]).toMatchObject({ start: Date.UTC(2025, 0, 1, 12), end: Date.UTC(2025, 2, 1, 12), current: false });
    expect(cycles[0].position.lots).toHaveLength(3);
    expect(cycles[1]).toMatchObject({ start: Date.UTC(2025, 5, 1, 12), end: null, current: true });
    expect(cycles[1].position.quantity).toBe(5);
    expect(cycles[1].id).not.toBe(cycles[0].id);
  });

  it('preserves independently open accounts even when another account sells all its shares', () => {
    const cycles = buildStockHoldingCycles([
      position('later', [lot('BUY', 5, '2025-02-01'), lot('SELL', 5, '2025-03-01')]),
      position('earlier', [lot('BUY', 5, '2025-01-01')], 'bank_two'),
    ]);
    expect(cycles.map((cycle) => cycle.position.originalId)).toEqual(['earlier', 'later']);
    expect(cycles.map((cycle) => cycle.current)).toEqual([true, false]);
    expect(cycles[0].position.quantity).toBe(5);
  });

  it('supports legacy positions and excludes invalid dates without marking zero quantity current', () => {
    const cycles = buildStockHoldingCycles([
      { ...position('open', []), quantity: 2 },
      position('closed', []),
      { ...position('invalid', []), entryDate: 'invalid' },
    ]);
    expect(cycles).toHaveLength(2);
    expect(cycles.find((cycle) => cycle.position.originalId === 'open')?.current).toBe(true);
    expect(cycles.find((cycle) => cycle.position.originalId === 'closed')?.current).toBe(false);
  });
});
