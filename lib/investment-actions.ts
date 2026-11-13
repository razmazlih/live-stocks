import { z } from 'zod';

export const actionPlanSchema = z.object({
  budgetUsd: z.number().finite().nonnegative(),
  actions: z.array(z.object({
    symbol: z.string().trim().min(1).max(32),
    action: z.enum(['BUY', 'SELL']),
    quantity: z.number().finite().positive(),
    priceUsd: z.number().finite().positive(),
  }).strict()).max(50),
}).strict();

export const snapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  holdings: z.array(z.object({
    position: z.object({
      symbol: z.string().trim().min(1),
      quantity: z.number().finite().nonnegative(),
      isHistoricalActivation: z.boolean().optional(),
    }).passthrough(),
  }).passthrough()),
}).passthrough();

export type InvestmentSnapshot = z.infer<typeof snapshotSchema>;
const normalized = (symbol: string) => symbol.trim().toUpperCase();

/** Only arithmetic and the user's action constraints; never investment suitability. */
export function validateActionPlan(snapshot: InvestmentSnapshot, input: z.infer<typeof actionPlanSchema>, now = Date.now()) {
  const errors: string[] = [];
  const held = new Map<string, number>();
  for (const { position } of snapshot.holdings) {
    if (position.quantity <= 0 || position.isHistoricalActivation) continue;
    const symbol = normalized(position.symbol);
    held.set(symbol, (held.get(symbol) ?? 0) + position.quantity);
  }
  const ageSeconds = (now - Date.parse(snapshot.generatedAt)) / 1000;
  if (ageSeconds > 900 || ageSeconds < -60) errors.push('Portfolio snapshot is stale or future-dated; reload and verify current holdings before an actionable recommendation.');
  const seen = new Set<string>();
  let buyCostUsd = 0;
  let estimatedGrossSaleProceedsUsd = 0;
  for (const item of input.actions) {
    const symbol = normalized(item.symbol);
    if (seen.has(symbol)) errors.push(`${symbol}: duplicate symbol; provide one action per company across all accounts.`);
    seen.add(symbol);
    const amount = item.quantity * item.priceUsd;
    if (!Number.isFinite(amount)) {
      errors.push(`${symbol}: action amount exceeds supported numeric range.`);
      continue;
    }
    const owned = held.get(symbol) ?? 0;
    if (item.action === 'BUY') {
      if (owned > 0) errors.push(`${symbol}: BUY is forbidden because the stock is already held.`);
      buyCostUsd += amount;
    } else {
      if (owned <= 0) errors.push(`${symbol}: SELL requires a current holding.`);
      else if (Math.abs(item.quantity - owned) > Math.max(1e-9, owned * 1e-10)) errors.push(`${symbol}: SELL must cover 100% across all accounts (${owned} shares).`);
      estimatedGrossSaleProceedsUsd += amount;
    }
  }
  if (!Number.isFinite(buyCostUsd) || !Number.isFinite(estimatedGrossSaleProceedsUsd)) errors.push('Total amounts exceed supported numeric range.');
  if (buyCostUsd > input.budgetUsd + 0.000001) errors.push('BUY amounts exceed confirmed available cash; unexecuted sale proceeds cannot fund purchases.');
  return {
    valid: errors.length === 0, errors,
    snapshotGeneratedAt: snapshot.generatedAt, snapshotAgeSeconds: Math.round(ageSeconds),
    buyCostUsd, estimatedGrossSaleProceedsUsd,
    remainingCashBeforeCostsUsd: input.budgetUsd - buyCostUsd,
    scope: 'Arithmetic and recorded holding constraints only; not approval, investment suitability, quote freshness, ticker-alias resolution or trade execution.',
    limitations: ['Future fees, slippage and tax are excluded. Reserve cash for costs.', 'Check ticker aliases, dual listings and corporate actions using external sources.', 'Reconfirm price timestamps and actual holdings before deciding.'],
  };
}
