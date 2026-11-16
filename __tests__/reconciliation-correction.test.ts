import { describe, expect, it } from 'vitest';
import { correctedLedgerPreview } from '@/lib/reconciliation-correction';
import type { PositionLot } from '@/types';

const buy: PositionLot = { id: 'buy', type: 'BUY', quantity: 2, price: 100, executedAt: '2026-01-01', hasCommission: false, commissionAmount: 0 };
const checkpoint: PositionLot = { ...buy, id: 'checkpoint', type: 'RECONCILE', quantity: 5, executedAt: '2026-03-01' };
describe('explicit correction of an old plugin balance checkpoint', () => {
  it('replays actual executions rather than treating the observed balance as an extra purchase', () => {
    expect(correctedLedgerPreview([buy, checkpoint], 'checkpoint', { ...buy, quantity: 3, executedAt: '2026-02-01' })).toEqual({ before: 5, after: 5, historyStillIncomplete: false });
    expect(correctedLedgerPreview([buy, checkpoint], 'checkpoint', { ...buy, quantity: 5, executedAt: '2026-02-01' }).after).toBe(7);
  });
  it('removes a checkpoint without deleting earlier real transactions', () => {
    expect(correctedLedgerPreview([buy, checkpoint], 'checkpoint')).toEqual({ before: 5, after: 2, historyStillIncomplete: false });
  });
  it('blocks a deletion or correction that leaves an historical sale unmatched', () => {
    const sell: PositionLot = { ...buy, id: 'sell', type: 'SELL', quantity: 4, executedAt: '2026-04-01' };
    expect(() => correctedLedgerPreview([buy, checkpoint, sell], 'checkpoint')).toThrow('enough recorded shares');
    expect(() => correctedLedgerPreview([buy, checkpoint, sell], 'checkpoint', { ...buy, type: 'SELL', executedAt: '2026-02-01' })).toThrow('enough recorded shares');
  });
  it('does not claim complete history when another checkpoint remains', () => {
    expect(correctedLedgerPreview([buy, checkpoint, { ...checkpoint, id: 'later', executedAt: '2026-04-01' }], 'checkpoint').historyStillIncomplete).toBe(true);
  });
});
