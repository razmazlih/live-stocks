import type { PositionLocation } from '@/types';

export interface PositionPurchaseInput {
  requestId: string;
  symbol: string;
  display: string;
  imageUrl: string;
  location: PositionLocation;
  price: number;
  quantity: number;
  executedAt: string;
  hasCommission: boolean;
  commissionAmount: number;
}

interface PurchaseClient {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

export interface PositionPurchaseResult {
  positionId: string;
  lotId: string;
  reused: boolean;
}

/** The database resolves identity and writes the purchase in one transaction. Never fall back to a raw insert. */
export async function recordPositionPurchase(client: PurchaseClient, input: PositionPurchaseInput): Promise<PositionPurchaseResult> {
  const { data, error } = await client.rpc('record_position_purchase', {
    p_request_id: input.requestId,
    p_symbol: input.symbol.trim().toUpperCase(),
    p_display: input.display.trim(),
    p_image_url: input.imageUrl.trim(),
    p_location: input.location,
    p_price: input.price,
    p_quantity: input.quantity,
    p_executed_at: input.executedAt,
    p_has_commission: input.hasCommission,
    p_commission_amount: input.hasCommission ? input.commissionAmount : 0,
  });
  if (error) throw error;
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  if (!row || typeof row.position_id !== 'string' || typeof row.lot_id !== 'string' || typeof row.reused !== 'boolean') {
    throw new Error('Purchase was not confirmed by the database');
  }
  return { positionId: row.position_id, lotId: row.lot_id, reused: row.reused };
}
