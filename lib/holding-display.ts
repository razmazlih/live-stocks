import type { PositionMetrics } from '@/types';

export function getHoldingTarget(metric: PositionMetrics) {
  const raw = metric.requiredExitPrice;
  // Round upward to a tradable cent so display rounding never lowers the exit goal.
  const salePrice = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.ceil(raw * 100 - 1e-8) / 100 : undefined;
  const current = metric.currentPrice;
  const difference = salePrice !== undefined && Number.isFinite(current) && current >= 0 ? current - salePrice : Number.NaN;
  const distancePercent = !Number.isFinite(difference) ? undefined : difference < 0
    ? current > 0 ? -difference / current * 100 : undefined
    : salePrice !== undefined && salePrice > 0 ? difference / salePrice * 100 : undefined;
  return { salePrice, difference, distancePercent };
}

