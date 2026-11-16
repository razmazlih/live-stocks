import { z } from 'zod';
import type { Position } from '@/types';
import { summarizeLots, orderPositionLots } from '@/lib/positions';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return value >= '1900-01-01' && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'A real calendar date is required');
const decimal = z.number().finite().nonnegative().max(1_000_000_000).refine(
  value => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 0.00001,
  'At most four decimal places are supported',
);
export const screenshotSyncRowSchema = z.object({
  symbol: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9.^=:-]*$/).transform(value => value.toUpperCase()),
  quantity: decimal,
  averageCostUsd: decimal.nullable(),
  acquiredOn: calendarDate.nullable(),
  estimatedAcquiredOn: calendarDate.nullable().optional(),
}).strict().superRefine((row, context) => {
  if (row.acquiredOn && row.estimatedAcquiredOn) context.addIssue({ code: z.ZodIssueCode.custom, path: ['estimatedAcquiredOn'], message: 'An acquisition date is either confirmed or estimated, not both' });
  if (row.quantity > 0 && row.averageCostUsd === 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['averageCostUsd'], message: 'Open holdings require a positive cost basis' });
  if (row.quantity === 0 && row.averageCostUsd !== null && row.averageCostUsd !== 0) context.addIssue({ code: z.ZodIssueCode.custom, path: ['averageCostUsd'], message: 'A zero balance cannot carry an open cost basis' });
});
export const screenshotSyncInputSchema = z.object({
  location: z.enum(['bank_one', 'bank_two']),
  observedAt: calendarDate,
  rows: z.array(screenshotSyncRowSchema).min(1).max(100),
}).strict().superRefine((input, context) => {
  const today = new Date().toISOString().slice(0, 10);
  if (input.observedAt > today) context.addIssue({ code: z.ZodIssueCode.custom, path: ['observedAt'], message: 'Observation date cannot be in the future' });
  const symbols = new Set<string>();
  input.rows.forEach((row, index) => {
    if (symbols.has(row.symbol)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'symbol'], message: 'Duplicate symbol in the same account' });
    symbols.add(row.symbol);
    if (row.estimatedAcquiredOn && row.estimatedAcquiredOn > input.observedAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'estimatedAcquiredOn'], message: 'Estimated date cannot follow the observation date' });
    if (row.acquiredOn && row.acquiredOn > input.observedAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'acquiredOn'], message: 'Acquisition date cannot follow the observation date' });
  });
});
export type ScreenshotSyncInput = z.infer<typeof screenshotSyncInputSchema>;
export type ScreenshotSyncRow = z.infer<typeof screenshotSyncRowSchema>;
export type ScreenshotSyncChange = Omit<ScreenshotSyncRow, 'averageCostUsd'> & {
  averageCostUsd: number;
  kind: 'add' | 'reconcile' | 'close';
  previousQuantity: number;
  previousAverageCostUsd: number | null;
};
export type ScreenshotSyncBlockedReason = 'missing_cost' | 'invalid_existing_position' | 'observation_precedes_recorded_events';
export interface ScreenshotSyncPlan {
  location: ScreenshotSyncInput['location'];
  observedAt: string;
  changes: ScreenshotSyncChange[];
  unchanged: ScreenshotSyncRow[];
  blocked: { symbol: string; reason: ScreenshotSyncBlockedReason }[];
  canApply: boolean;
}

/** An observation replaces the open FIFO balance through an explicit checkpoint, never a fabricated trade. */
export function buildScreenshotSyncPlan(input: ScreenshotSyncInput, positions: Position[]): ScreenshotSyncPlan {
  const validated = screenshotSyncInputSchema.parse(input);
  const plan: ScreenshotSyncPlan = { location: validated.location, observedAt: validated.observedAt, changes: [], unchanged: [], blocked: [], canApply: false };
  for (const row of validated.rows) {
    const existing = positions.filter(position => position.location === validated.location && position.symbol.trim().toUpperCase() === row.symbol);
    let quantity = 0;
    let cost = 0;
    let invalid = false;
    const basisDates: (string | null)[] = [];
    for (const position of existing) {
      const summary = position.lots?.length ? summarizeLots(position.lots) : null;
      const currentQuantity = summary ? summary.totalQuantity : position.quantity;
      const currentCost = summary ? summary.costBasis : position.quantity * position.entryPrice;
      if (!Number.isFinite(currentQuantity) || !Number.isFinite(currentCost) || currentQuantity < 0 || currentCost < 0) invalid = true;
      if (currentQuantity > 0) {
        if (summary) basisDates.push(...summary.openLots.map(lot => lot.executedAt ? lot.executedAt.slice(0, 10) : null));
        else basisDates.push(position.entryDate ? position.entryDate.slice(0, 10) : null);
      }
      quantity += currentQuantity;
      cost += currentCost;
    }
    if (invalid) { plan.blocked.push({ symbol: row.symbol, reason: 'invalid_existing_position' }); continue; }
    // A dated observation cannot overwrite transactions known to occur after it.
    if (existing.some(position => position.lots?.length ? position.lots.some(lot => lot.executedAt.slice(0, 10) > validated.observedAt) : position.quantity > 0 && position.entryDate.slice(0, 10) > validated.observedAt)) {
      plan.blocked.push({ symbol: row.symbol, reason: 'observation_precedes_recorded_events' }); continue;
    }
    const knownDates = basisDates.filter((date): date is string => date !== null).sort();
    const currentCheckpoints = existing.map(position => orderPositionLots(position.lots ?? []).filter(lot => lot.type === 'RECONCILE').at(-1));
    const estimateMatches = !row.estimatedAcquiredOn || currentCheckpoints.some(lot => !lot?.basisAcquiredOn && lot?.basisDateEstimate === row.estimatedAcquiredOn);
    const clearMatches = !(row.acquiredOn === null && row.estimatedAcquiredOn === null) || (basisDates.every(date => date === null) && currentCheckpoints.every(lot => !lot?.basisDateEstimate));
    const dateMatches = clearMatches && estimateMatches && (row.quantity === 0 || row.acquiredOn === null || (basisDates.length > 0 && !basisDates.includes(null) && knownDates[0] === row.acquiredOn));
    const matches = dateMatches && Math.abs(quantity - row.quantity) < 0.00005 && (row.quantity === 0 || row.averageCostUsd === null || (quantity > 0 && Math.abs(cost / quantity - row.averageCostUsd) < 0.00005));
    if (matches) { plan.unchanged.push(row); continue; }
    if (row.quantity > 0 && row.averageCostUsd === null) { plan.blocked.push({ symbol: row.symbol, reason: 'missing_cost' }); continue; }
    plan.changes.push({ ...row, averageCostUsd: row.quantity === 0 ? 0 : row.averageCostUsd!, kind: row.quantity === 0 ? 'close' : existing.length ? 'reconcile' : 'add', previousQuantity: quantity, previousAverageCostUsd: quantity > 0 ? cost / quantity : null });
  }
  plan.canApply = plan.blocked.length === 0 && plan.changes.length > 0;
  return plan;
}
