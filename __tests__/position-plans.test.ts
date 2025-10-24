import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { mapPositionPlanRow } from '@/lib/positions';
import { processPendingPlans } from '@/lib/plans';
import type { PositionPlan } from '@/types';
import { fetchFinnhubQuote } from '@/lib/services/finnhub';

const tableHandlers: Record<string, () => Record<string, any>> = {};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const factory = tableHandlers[table];
      if (!factory) {
        throw new Error(`No mock configured for table ${table}`);
      }
      return factory();
    },
  },
}));

vi.mock('@/lib/services/finnhub', () => ({
  fetchFinnhubQuote: vi.fn(),
}));

const fetchFinnhubQuoteMock = fetchFinnhubQuote as unknown as ReturnType<typeof vi.fn>;

function setTableHandler(table: string, factory: () => Record<string, any>) {
  tableHandlers[table] = factory;
}

beforeEach(() => {
  for (const key of Object.keys(tableHandlers)) {
    delete tableHandlers[key];
  }
  fetchFinnhubQuoteMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

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
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
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
      status: 'pending',
      triggeredAt: null,
      expiredAt: null,
      executedPrice: null,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    });
  });
});

describe('processPendingPlans', () => {
  it('triggers plans for existing positions and records lots', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-03-10T10:00:00Z'));

    const pendingRow = {
      id: 'plan-existing',
      position_id: 'pos-1',
      symbol: 'AAPL',
      display: 'Apple',
      image_url: 'https://logo.clearbit.com/apple.com',
      side: 'buy',
      target_price: '140',
      target_quantity: '5',
      target_date: '2024-03-10',
      status: 'pending' as const,
      triggered_at: null,
      expired_at: null,
      executed_price: null,
      created_at: null,
      updated_at: null,
    };

    const updates: any[] = [];
    const lotInserts: any[] = [];
    const positionInsertMock = vi.fn();

    setTableHandler('position_plans', () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [pendingRow], error: null }),
      }),
      update: vi.fn((payload: any) => ({
        eq: vi.fn().mockImplementation(async () => {
          updates.push(payload);
          return { data: null, error: null };
        }),
      })),
    }));

    setTableHandler('position_lots', () => ({
      insert: vi.fn(async (payload: any) => {
        lotInserts.push(payload);
        return { data: null, error: null };
      }),
    }));

    setTableHandler('positions', () => ({
      insert: positionInsertMock,
    }));

    const quoteTimestamp = Math.floor(new Date('2024-03-10T09:55:00Z').getTime() / 1000);
    fetchFinnhubQuoteMock.mockResolvedValue({ price: 135, timestamp: quoteTimestamp });

    const result = await processPendingPlans({ token: 'token-1' });

    expect(fetchFinnhubQuoteMock).toHaveBeenCalledWith('AAPL', { token: 'token-1' });
    expect(positionInsertMock).not.toHaveBeenCalled();
    expect(lotInserts).toEqual([
      {
        position_id: 'pos-1',
        side: 'BUY',
        price: 135,
        quantity: 5,
        executed_at: '2024-03-10',
      },
    ]);
    expect(updates[0]).toMatchObject({
      status: 'triggered',
      position_id: 'pos-1',
      triggered_at: '2024-03-10',
      executed_price: 135,
    });
    expect((result.triggered[0] as PositionPlan).status).toBe('triggered');
    expect(result.expired).toHaveLength(0);
  });

  it('creates a new position when triggering an unattached plan', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-05T09:00:00Z'));

    const pendingRow = {
      id: 'plan-detached',
      position_id: null,
      symbol: 'NVDA',
      display: 'NVIDIA',
      image_url: null,
      side: 'buy',
      target_price: '600',
      target_quantity: '2',
      target_date: '2024-05-06',
      status: 'pending' as const,
      triggered_at: null,
      expired_at: null,
      executed_price: null,
      created_at: null,
      updated_at: null,
    };

    const updates: any[] = [];
    const lotInserts: any[] = [];
    const positionInserts: any[] = [];

    setTableHandler('position_plans', () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [pendingRow], error: null }),
      }),
      update: vi.fn((payload: any) => ({
        eq: vi.fn().mockImplementation(async () => {
          updates.push(payload);
          return { data: null, error: null };
        }),
      })),
    }));

    setTableHandler('position_lots', () => ({
      insert: vi.fn(async (payload: any) => {
        lotInserts.push(payload);
        return { data: null, error: null };
      }),
    }));

    setTableHandler('positions', () => ({
      insert: vi.fn((payload: any) => {
        positionInserts.push(payload);
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'pos-new' }, error: null }),
          }),
        };
      }),
    }));

    const quoteTimestamp = Math.floor(new Date('2024-05-05T08:30:00Z').getTime() / 1000);
    fetchFinnhubQuoteMock.mockResolvedValue({ price: 590, timestamp: quoteTimestamp });

    const result = await processPendingPlans({ token: 'token-2' });

    expect(positionInserts[0]).toMatchObject({
      symbol: 'NVDA',
      display: 'NVIDIA',
      entry_price: 590,
      quantity: 2,
      entry_date: '2024-05-05',
    });
    expect(lotInserts[0]).toMatchObject({
      position_id: 'pos-new',
      price: 590,
      quantity: 2,
      side: 'BUY',
      executed_at: '2024-05-05',
    });
    expect(updates[0]).toMatchObject({
      status: 'triggered',
      position_id: 'pos-new',
      executed_price: 590,
    });
    expect(result.triggered[0]?.positionId).toBe('pos-new');
  });

  it('expires plans that pass their target date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-01T00:00:00Z'));

    const pendingRow = {
      id: 'plan-expire',
      position_id: null,
      symbol: 'TSLA',
      display: 'Tesla',
      image_url: null,
      side: 'buy',
      target_price: '200',
      target_quantity: '1',
      target_date: '2024-06-30',
      status: 'pending' as const,
      triggered_at: null,
      expired_at: null,
      executed_price: null,
      created_at: null,
      updated_at: null,
    };

    const updates: any[] = [];

    setTableHandler('position_plans', () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [pendingRow], error: null }),
      }),
      update: vi.fn((payload: any) => ({
        eq: vi.fn().mockImplementation(async () => {
          updates.push(payload);
          return { data: null, error: null };
        }),
      })),
    }));

    fetchFinnhubQuoteMock.mockResolvedValue({ price: 180 });

    const result = await processPendingPlans({ token: 'token-3' });

    expect(updates[0]).toMatchObject({ status: 'expired', expired_at: '2024-07-01' });
    expect(fetchFinnhubQuoteMock).not.toHaveBeenCalled();
    expect(result.expired[0]?.status).toBe('expired');
    expect(result.triggered).toHaveLength(0);
  });

  it('executes sell plans when price rises to the target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-08-15T12:00:00Z'));

    const pendingRow = {
      id: 'plan-sell',
      position_id: 'pos-2',
      symbol: 'AMZN',
      display: 'Amazon',
      image_url: 'https://logo.clearbit.com/amazon.com',
      side: 'sell' as const,
      target_price: '150',
      target_quantity: '3',
      target_date: '2024-08-20',
      status: 'pending' as const,
      triggered_at: null,
      expired_at: null,
      executed_price: null,
      created_at: null,
      updated_at: null,
    };

    const updates: any[] = [];
    const lotInserts: any[] = [];

    setTableHandler('position_plans', () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [pendingRow], error: null }),
      }),
      update: vi.fn((payload: any) => ({
        eq: vi.fn().mockImplementation(async () => {
          updates.push(payload);
          return { data: null, error: null };
        }),
      })),
    }));

    setTableHandler('position_lots', () => ({
      insert: vi.fn(async (payload: any) => {
        lotInserts.push(payload);
        return { data: null, error: null };
      }),
    }));

    const quoteTimestamp = Math.floor(new Date('2024-08-15T11:50:00Z').getTime() / 1000);
    fetchFinnhubQuoteMock.mockResolvedValue({ price: 155, timestamp: quoteTimestamp });

    const result = await processPendingPlans({ token: 'token-4' });

    expect(fetchFinnhubQuoteMock).toHaveBeenCalledWith('AMZN', { token: 'token-4' });
    expect(lotInserts[0]).toMatchObject({
      position_id: 'pos-2',
      side: 'SELL',
      price: 155,
      quantity: 3,
      executed_at: '2024-08-15',
    });
    expect(updates[0]).toMatchObject({
      status: 'triggered',
      position_id: 'pos-2',
      triggered_at: '2024-08-15',
      executed_price: 155,
    });
    expect(result.triggered[0]?.side).toBe('sell');
  });

  it('does not trigger buy plans when the market price is above the target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-09-02T12:00:00Z'));

    const pendingRow = {
      id: 'plan-no-trigger',
      position_id: null,
      symbol: 'MSFT',
      display: 'Microsoft',
      image_url: null,
      side: 'buy',
      target_price: '320',
      target_quantity: '4',
      target_date: '2024-09-05',
      status: 'pending' as const,
      triggered_at: null,
      expired_at: null,
      executed_price: null,
      created_at: null,
      updated_at: null,
    };

    setTableHandler('position_plans', () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [pendingRow], error: null }),
      }),
    }));

    setTableHandler('position_lots', () => ({
      insert: vi.fn(async () => ({ data: null, error: null })),
    }));

    setTableHandler('positions', () => ({
      insert: vi.fn(),
    }));

    const quoteTimestamp = Math.floor(new Date('2024-09-02T11:30:00Z').getTime() / 1000);
    fetchFinnhubQuoteMock.mockResolvedValue({ price: 335, timestamp: quoteTimestamp });

    const result = await processPendingPlans({ token: 'token-5' });

    expect(result.triggered).toHaveLength(0);
    expect(result.expired).toHaveLength(0);
  });

  it('triggers plans when the latest quote is recent even if it is from the previous UTC day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-09-02T12:00:00Z'));

    const pendingRow = {
      id: 'plan-recent-quote',
      position_id: 'pos-3',
      symbol: 'MSFT',
      display: 'Microsoft',
      image_url: null,
      side: 'buy' as const,
      target_price: '320',
      target_quantity: '4',
      target_date: '2024-09-05',
      status: 'pending' as const,
      triggered_at: null,
      expired_at: null,
      executed_price: null,
      created_at: null,
      updated_at: null,
    };

    const updates: any[] = [];
    const lotInserts: any[] = [];

    setTableHandler('position_plans', () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [pendingRow], error: null }),
      }),
      update: vi.fn((payload: any) => ({
        eq: vi.fn().mockImplementation(async () => {
          updates.push(payload);
          return { data: null, error: null };
        }),
      })),
    }));

    setTableHandler('position_lots', () => ({
      insert: vi.fn(async (payload: any) => {
        lotInserts.push(payload);
        return { data: null, error: null };
      }),
    }));

    const recentTimestamp = Math.floor(new Date('2024-09-01T23:30:00Z').getTime() / 1000);
    fetchFinnhubQuoteMock.mockResolvedValue({ price: 310, timestamp: recentTimestamp });

    const result = await processPendingPlans({ token: 'token-5' });

    expect(lotInserts[0]).toMatchObject({
      position_id: 'pos-3',
      side: 'BUY',
      price: 310,
      quantity: 4,
      executed_at: '2024-09-02',
    });

    expect(updates[0]).toMatchObject({
      status: 'triggered',
      position_id: 'pos-3',
      executed_price: 310,
    });

    expect(result.triggered).toHaveLength(1);
  });

  it('skips plans when only stale price data is available', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-09-02T12:00:00Z'));

    const pendingRow = {
      id: 'plan-stale-quote',
      position_id: null,
      symbol: 'MSFT',
      display: 'Microsoft',
      image_url: null,
      side: 'buy',
      target_price: '320',
      target_quantity: '4',
      target_date: '2024-09-05',
      status: 'pending' as const,
      triggered_at: null,
      expired_at: null,
      executed_price: null,
      created_at: null,
      updated_at: null,
    };

    setTableHandler('position_plans', () => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [pendingRow], error: null }),
      }),
    }));

    setTableHandler('position_lots', () => ({
      insert: vi.fn(async () => ({ data: null, error: null })),
    }));

    setTableHandler('positions', () => ({
      insert: vi.fn(),
    }));

    const staleTimestamp = Math.floor(new Date('2024-08-30T20:00:00Z').getTime() / 1000);
    fetchFinnhubQuoteMock.mockResolvedValue({ price: 315, timestamp: staleTimestamp });

    const result = await processPendingPlans({ token: 'token-5' });

    expect(result.triggered).toHaveLength(0);
    expect(result.expired).toHaveLength(0);
  });
});
