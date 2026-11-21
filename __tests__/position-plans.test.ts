import { describe, expect, it } from 'vitest';
import { mapPositionPlanRow } from '@/lib/positions';

describe('mapPositionPlanRow', () => {
  it('normalizes supabase plan rows', () => {
    const row = {
      id: 'plan-1',
      position_id: 'pos-1',
      symbol: 'MSFT',
      display: 'Microsoft',
      image_url: 'https://logo.clearbit.com/microsoft.com',
      side: 'buy',
      target_price: '250.50',
      target_quantity: '12.75',
      target_date: '2024-01-15',
      status: 'pending' as const,
      triggered_at: null,
      expired_at: null,
      executed_price: null,
      has_commission: false,
      commission_amount: '0',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      location: 'bank_two',
    };

    const mapped = mapPositionPlanRow(row as any);

    expect(mapped).toEqual({
      id: 'plan-1',
      positionId: 'pos-1',
      symbol: 'MSFT',
      display: 'Microsoft',
      imageUrl: 'https://logo.clearbit.com/microsoft.com',
      side: 'buy',
      targetPrice: 250.5,
      targetQuantity: 12.75,
      targetDate: '2024-01-15',
      hasCommission: false,
      commissionAmount: 0,
      status: 'pending',
      triggeredAt: null,
      expiredAt: null,
      executedPrice: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      location: 'bank_two',
    });
  });
});
