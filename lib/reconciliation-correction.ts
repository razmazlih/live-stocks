import { orderPositionLots, summarizeLots } from '@/lib/positions';
import type { PositionLot } from '@/types';

/** Preview an explicit correction; a balance observation is never assumed to be a trade. */
export function correctedLedgerPreview(lots: PositionLot[], checkpointId: string, replacement?: PositionLot) {
  if (!lots.some(lot => lot.id === checkpointId && lot.type === 'RECONCILE')) throw new Error('Checkpoint not found');
  const checkpoint = lots.find(lot => lot.id === checkpointId)!;
  const corrected = lots.flatMap(lot => lot.id === checkpointId ? (replacement ? [{ ...replacement, id: checkpointId, createdAt: checkpoint.createdAt }] : []) : [lot]);
  let quantity = 0;
  for (const lot of orderPositionLots(corrected)) {
    if (!Number.isFinite(Date.parse(lot.executedAt)) || !Number.isFinite(lot.quantity) || !Number.isFinite(lot.price)
      || lot.quantity < 0 || lot.price < 0 || (lot.type !== 'RECONCILE' && (lot.quantity <= 0 || lot.price <= 0))) throw new Error('Invalid transaction details');
    quantity = lot.type === 'RECONCILE' ? lot.quantity : quantity + (lot.type === 'BUY' ? lot.quantity : -lot.quantity);
    if (quantity < -0.00000001) throw new Error('Correction leaves a sale without enough recorded shares');
  }
  return { before: summarizeLots(lots).totalQuantity, after: summarizeLots(corrected).totalQuantity,
    historyStillIncomplete: corrected.some(lot => lot.type === 'RECONCILE') };
}
