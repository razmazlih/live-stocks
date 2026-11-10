import { describe, expect, it, vi } from 'vitest';
import { recordPositionPurchase, type PositionPurchaseInput } from '@/lib/position-purchase';
import { computeRealizedSales, mapPositionRow } from '@/lib/positions';

const purchase: PositionPurchaseInput = {
  requestId: 'request-1', symbol: ' adbe ', display: ' Adobe Inc. ', imageUrl: '',
  location: 'bank_one', price: 120, quantity: 3, executedAt: '2026-11-10',
  hasCommission: true, commissionAmount: 8,
};

function clientWith(data: unknown, error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }), from: vi.fn() };
}

describe('recordPositionPurchase', () => {
  it('uses the atomic identity-aware RPC with normalized symbol, account, execution and fee data', async () => {
    const client = clientWith([{ position_id: 'existing', lot_id: 'new-lot', reused: true }]);
    expect(await recordPositionPurchase(client, purchase)).toEqual({ positionId: 'existing', lotId: 'new-lot', reused: true });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith('record_position_purchase', {
      p_request_id: 'request-1', p_symbol: 'ADBE', p_display: 'Adobe Inc.', p_image_url: '',
      p_location: 'bank_one', p_price: 120, p_quantity: 3, p_executed_at: '2026-11-10',
      p_has_commission: true, p_commission_amount: 8,
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('passes a different account explicitly and accepts a separately created position', async () => {
    const client = clientWith([{ position_id: 'pepper-position', lot_id: 'lot-2', reused: false }]);
    expect(await recordPositionPurchase(client, { ...purchase, location: 'bank_two', hasCommission: false })).toEqual({ positionId: 'pepper-position', lotId: 'lot-2', reused: false });
    expect(client.rpc.mock.calls[0][1]).toMatchObject({ p_location: 'bank_two', p_has_commission: false, p_commission_amount: 0 });
  });

  it('does not fall back to creating a position when the RPC fails or is unavailable', async () => {
    const error = { code: 'PGRST202', message: 'Function missing' };
    const client = clientWith(null, error);
    await expect(recordPositionPurchase(client, purchase)).rejects.toBe(error);
    expect(client.from).not.toHaveBeenCalled();
  });

  it.each([null, [], [{ position_id: 'p' }], [{ position_id: 'p', lot_id: 'l', reused: true }, { position_id: 'p2', lot_id: 'l2', reused: false }]])('requires one complete database confirmation (%j)', async data => {
    await expect(recordPositionPurchase(clientWith(data), purchase)).rejects.toThrow('Purchase was not confirmed');
  });
});

describe('purchase continuation calculations', () => {
  function positionWith(lots: { id: string; side: 'BUY' | 'SELL'; price: number; quantity: number; executed_at: string }[]) {
    return mapPositionRow({ id: 'same-position', symbol: 'ADBE', display: 'Adobe Inc.', image_url: '', location: 'bank_one', entry_price: 100, quantity: 0, entry_date: '2026-01-01', position_lots: lots.map(lot => ({ ...lot, position_id: 'same-position', has_commission: false, commission_amount: 0 })) });
  }
  const firstBuy = { id: 'first-buy', side: 'BUY' as const, price: 100, quantity: 5, executed_at: '2026-01-01' };
  const nextBuy = { id: 'next-buy', side: 'BUY' as const, price: 120, quantity: 3, executed_at: '2026-11-10' };

  it('adds a purchase to active holdings while retaining their lots and weighted cost', () => {
    const position = positionWith([firstBuy, nextBuy]);
    expect(position.id).toBe('same-position');
    expect(position.quantity).toBe(8);
    expect(position.entryPrice).toBe(107.5);
    expect(position.lots?.map(lot => lot.id)).toEqual(['first-buy', 'next-buy']);
  });

  it('reopens the same position while keeping the old sale and realized profit', () => {
    const firstSale = { id: 'old-sale', side: 'SELL' as const, price: 110, quantity: 5, executed_at: '2026-02-01' };
    const closed = positionWith([firstBuy, firstSale]);
    const reopened = positionWith([firstBuy, firstSale, nextBuy]);
    expect(closed.quantity).toBe(0);
    expect(reopened.id).toBe(closed.id);
    expect(reopened.quantity).toBe(3);
    expect(reopened.entryPrice).toBe(120);
    expect(reopened.lots).toHaveLength(3);
    expect(computeRealizedSales(reopened)).toEqual(computeRealizedSales(closed));
    expect(computeRealizedSales(reopened)[0].profitUsd).toBe(50);
  });
});
