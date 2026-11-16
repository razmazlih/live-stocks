import { z } from 'zod';
import type { Position } from '@/types';
import { summarizeLots } from '@/lib/positions';

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return value >= '1900-01-01' && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'A real calendar date is required');
const decimal = z.number().finite().positive().max(1_000_000_000).refine(
  value => Math.abs(value * 10_000 - Math.round(value * 10_000)) < 0.00001,
  'At most four decimal places are supported',
);
export const screenshotSyncRowSchema = z.object({
  symbol: z.string().trim().min(1).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9.^=:-]*$/).transform(value => value.toUpperCase()),
  quantity: decimal,
  averageCostUsd: decimal.nullable(),
  acquiredOn: calendarDate.nullable(),
}).strict();
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
    if (row.acquiredOn && row.acquiredOn > input.observedAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', index, 'acquiredOn'], message: 'Acquisition date cannot follow the observation date' });
  });
});
export type ScreenshotSyncInput = z.infer<typeof screenshotSyncInputSchema>;
export type ScreenshotSyncRow = z.infer<typeof screenshotSyncRowSchema>;
export type ScreenshotSyncChange = Omit<ScreenshotSyncRow, 'averageCostUsd' | 'acquiredOn'> & { averageCostUsd: number; acquiredOn: string };
export type ScreenshotSyncBlockedReason = 'missing_cost' | 'missing_acquisition_date' | 'existing_position_differs' | 'invalid_existing_position';
export interface ScreenshotSyncPlan {
  location: ScreenshotSyncInput['location'];
  observedAt: string;
  changes: ScreenshotSyncChange[];
  unchanged: ScreenshotSyncRow[];
  blocked: { symbol: string; reason: ScreenshotSyncBlockedReason }[];
  canApply: boolean;
}

/** Holdings are observations, not executions. Never infer trades or replace a FIFO ledger. */
export function buildScreenshotSyncPlan(input: ScreenshotSyncInput, positions: Position[]): ScreenshotSyncPlan {
  const validated = screenshotSyncInputSchema.parse(input);
  const plan: ScreenshotSyncPlan = { location: validated.location, observedAt: validated.observedAt, changes: [], unchanged: [], blocked: [], canApply: false };
  for (const row of validated.rows) {
    const existing = positions.filter(position => position.location === validated.location && position.symbol.trim().toUpperCase() === row.symbol);
    if (existing.length) {
      let quantity = 0;
      let cost = 0;
      let invalid = false;
      for (const position of existing) {
        const summary = position.lots?.length ? summarizeLots(position.lots) : null;
        const currentQuantity = summary ? summary.totalQuantity : position.quantity;
        const currentCost = summary ? summary.costBasis : position.quantity * position.entryPrice;
        if (!Number.isFinite(currentQuantity) || !Number.isFinite(currentCost) || currentQuantity < 0 || currentCost < 0) invalid = true;
        quantity += currentQuantity;
        cost += currentCost;
      }
      // Screenshot precision may round the broker's fee-inclusive average cost to four decimals.
      const matches = !invalid && Math.abs(quantity - row.quantity) < 0.00005 && (row.averageCostUsd === null || (quantity > 0 && Math.abs(cost / quantity - row.averageCostUsd) < 0.00005));
      if (matches) plan.unchanged.push(row);
      else plan.blocked.push({ symbol: row.symbol, reason: invalid ? 'invalid_existing_position' : 'existing_position_differs' });
      continue;
    }
    if (row.averageCostUsd === null) plan.blocked.push({ symbol: row.symbol, reason: 'missing_cost' });
    else if (row.acquiredOn === null) plan.blocked.push({ symbol: row.symbol, reason: 'missing_acquisition_date' });
    else plan.changes.push({ ...row, averageCostUsd: row.averageCostUsd, acquiredOn: row.acquiredOn });
  }
  plan.canApply = plan.blocked.length === 0 && plan.changes.length > 0;
  return plan;
}
