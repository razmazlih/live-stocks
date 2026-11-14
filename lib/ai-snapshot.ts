import type { PositionMetrics } from '@/types';

/** A privacy-limited view of the signed-in user's portfolio, one record per ticker. */
export function buildAiSnapshot(metrics: PositionMetrics[], selected: string[] | null, updatedAt: Date | null, stale: boolean) {
  const groups = new Map<string, PositionMetrics[]>();
  for (const metric of metrics) {
    const symbol = metric.position.symbol.trim().toUpperCase();
    if (!symbol || metric.position.quantity <= 0 || metric.position.isHistoricalActivation) continue;
    groups.set(symbol, [...(groups.get(symbol) ?? []), metric]);
  }
  const totalValue = [...groups.values()].flat().reduce((sum, metric) => sum + metric.currentValue, 0);
  const stocks = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).filter(([symbol]) => selected === null || selected.includes(symbol)).map(([symbol, holdings]) => {
    const quantity = holdings.reduce((sum, metric) => sum + metric.position.quantity, 0);
    const cost = holdings.reduce((sum, metric) => sum + metric.position.entryPrice * metric.position.quantity, 0);
    const value = holdings.reduce((sum, metric) => sum + metric.currentValue, 0);
    const round = (value: number) => Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
    // Missing daily data stays missing rather than becoming a fabricated zero.
    const dailyChange = holdings.every((metric) => metric.dailyChangePercent !== undefined)
      ? holdings.reduce((sum, metric) => sum + metric.dailyChangePercent! * metric.position.quantity, 0) / quantity
      : null;
    return {
      symbol,
      name: holdings[0].position.display || symbol,
      averageEntryPriceUsd: round(cost / quantity),
      currentPriceUsd: round(value / quantity),
      dailyChangePercent: dailyChange === null ? null : round(dailyChange),
      changeSinceEntryPercent: cost > 0 ? round((value / cost - 1) * 100) : null,
      allocationOfOpenPortfolioPercent: totalValue > 0 ? round(value / totalValue * 100) : null,
    };
  });
  return { schemaVersion: 1, updatedAt: updatedAt?.toISOString() ?? null, freshness: stale ? 'stale' : updatedAt ? 'last_successful_load' : 'unavailable', priceCurrency: 'USD', allocationBasis: 'all_open_holdings', stocks };
}
