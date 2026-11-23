import type { HistoricalPoint, Position } from '@/types';
import { buildUsdIlsRateResolver } from '@/lib/services/historical-fx';
import { computeRealizedSalesWithFx } from '@/lib/positions';
import {
  calculatePortfolioSummary, calculatePositionMetrics, calculateRequiredExitPrice,
  calculateRealizedPortfolioTotals, calculateRealizedTaxLiability,
  enrichPortfolioSummaryWithRealized, normalizeOpenPortfolioSummary,
} from '@/lib/calculations';
import { getMarketClock } from '@/lib/utils/trading-hours';
import { displayedQuote } from '@/lib/live-display-quote';
import type { LiveQuoteTick } from '@/lib/live-quotes';
import type { SymbolMarketData } from '@/lib/market-overview';

type PriceSnapshot = { c?: number; d?: number; t?: number; pc?: number };
export interface ValuationBasis {
  positions: Position[];
  activationPositions: Position[];
  quotes: Record<string, PriceSnapshot>;
  fxHistoryPoints: HistoricalPoint[];
  rate: number;
  valuationTime: number;
}

export function valuePortfolio(basis: ValuationBasis, growthRate: number) {
  const { positions: mappedPositions, activationPositions, quotes, rate, valuationTime, fxHistoryPoints } = basis;
  const getFxRateAt = buildUsdIlsRateResolver(fxHistoryPoints, rate, { allowFallback: false });
  const positionsBySymbol = new Map<string, Position[]>();
  mappedPositions.forEach((position) => {
    const symbol = position.symbol.trim().toUpperCase();
    const group = positionsBySymbol.get(symbol);
    if (group) {
      group.push(position);
    } else {
      positionsBySymbol.set(symbol, [position]);
    }
  });
  const requiredExitPriceBySymbol = new Map(
    Array.from(positionsBySymbol.entries()).map(([symbol, symbolPositions]) => [
      symbol,
      calculateRequiredExitPrice(symbolPositions, growthRate, new Date(valuationTime)),
    ]),
  );

  const calculatedMetrics = activationPositions.map((position) => {
    const quote = quotes[position.symbol.trim().toUpperCase()];
    const currentPrice = typeof quote?.c === 'number' && Number.isFinite(quote.c) && quote.c > 0 ? quote.c : Number.NaN;
    const dailyChange = quote?.d;

    const metrics = calculatePositionMetrics(
      position,
      // Closed activations have no market exposure; missing quotes must not turn zero value into NaN.
      position.quantity <= 0 && !Number.isFinite(currentPrice) ? 0 : currentPrice,
      rate,
      growthRate,
      dailyChange,
      getFxRateAt,
      new Date(valuationTime),
    );
    return {
      ...metrics,
      currentPrice,
      requiredExitPrice: position.quantity > 0
        ? requiredExitPriceBySymbol.get(position.symbol.trim().toUpperCase())
        : undefined,
    };
  });
  const portfolioSummary = calculatePortfolioSummary(calculatedMetrics, rate);
  const openMetrics = calculatedMetrics.filter((metric) => metric.position.quantity > 0);
  const openSummaryBase = calculatePortfolioSummary(openMetrics, rate);
  const realizedSalesWithFx = mappedPositions.flatMap((position) =>
    computeRealizedSalesWithFx(position, getFxRateAt),
  );
  const annualGrowthRate = Number.isFinite(growthRate)
    ? growthRate
    : 0;

  const realizedTotals = calculateRealizedPortfolioTotals(
    realizedSalesWithFx,
    annualGrowthRate,
    rate,
    getFxRateAt,
  );

  const chronologicalSales = realizedSalesWithFx
    .slice()
    .sort((a, b) => new Date(a.sellDate).getTime() - new Date(b.sellDate).getTime());

  const taxSummary = calculateRealizedTaxLiability(
    chronologicalSales.map((sale) => ({
      profitUsd: sale.profitUsd,
      profitIls: sale.profitIls ?? sale.profitUsd * rate,
      timestamp: new Date(sale.sellDate).getTime(),
    }))
  );

  const normalizedOpenSummary = normalizeOpenPortfolioSummary(openSummaryBase);
  const enrichedSummary = enrichPortfolioSummaryWithRealized(portfolioSummary, realizedTotals, taxSummary);

  return { basis, growthRate, getFxRateAt, metrics: calculatedMetrics, summary: enrichedSummary,
    openSummary: normalizedOpenSummary, sales: realizedSalesWithFx, realizedTotals, taxSummary };
}

export type PortfolioValuation = ReturnType<typeof valuePortfolio>;

/** Stream prices affect open exposures. The realized ledger, tax and closed activations remain dated. */
export function repricePortfolio(base: PortfolioValuation, ticks: Record<string, LiveQuoteTick>, asOf: number) {
  const { basis } = base;
  const clock = getMarketClock(asOf);
  if (!clock.session || clock.phase !== 'regular') return base;
  const { open, close } = clock.session;
  let changed = false;
  const metrics = base.metrics.map(metric => {
    const symbol = metric.position.symbol.trim().toUpperCase();
    const tick = ticks[symbol];
    const quote = basis.quotes[symbol];
    if (!tick || tick.phase !== 'regular' || tick.timestamp < open || tick.timestamp >= close ||
      tick.timestamp > asOf || tick.timestamp < (quote?.t ?? 0) * 1000 || metric.position.quantity <= 0 ||
      !Number.isFinite(tick.price) || tick.price <= 0) return metric;
    const snapshot = typeof quote?.c === 'number' ? { ...quote, c: quote.c } : null;
    const dailyChange = displayedQuote(symbol, snapshot, tick).quote?.d;
    if (tick.price === metric.currentPrice && dailyChange === metric.dailyChange) return metric;
    changed = true;
    return { ...calculatePositionMetrics(metric.position, tick.price, basis.rate, base.growthRate,
      dailyChange, base.getFxRateAt, new Date(basis.valuationTime)), requiredExitPrice: metric.requiredExitPrice };
  });
  if (!changed) return base;
  const summary = enrichPortfolioSummaryWithRealized(calculatePortfolioSummary(metrics, basis.rate), base.realizedTotals, base.taxSummary);
  const openSummary = normalizeOpenPortfolioSummary(calculatePortfolioSummary(metrics.filter(m => m.position.quantity > 0), basis.rate));
  return { ...base, metrics, summary, openSummary };
}

export function applySessionTicks(marks: Record<string, SymbolMarketData>, ticks: Record<string, LiveQuoteTick>, asOf: number) {
  const clock = getMarketClock(asOf);
  if (clock.phase === 'closed' || clock.phase === 'unknown') return marks;
  const start = clock.phase === 'regular' ? clock.session?.open : clock.phase === 'pre' ? clock.session?.pre
    : clock.phase === 'post' ? clock.session?.close : clock.overnight?.start;
  if (start === undefined) return marks;
  const field = clock.phase === 'regular' ? 'regular' : 'extended';
  let next = marks;
  for (const [symbol, tick] of Object.entries(ticks)) {
    const previous = marks[symbol];
    if (!previous || tick.phase !== clock.phase || tick.timestamp < start || tick.timestamp > asOf ||
      tick.timestamp <= (previous[field]?.asOf ?? 0) || !Number.isFinite(tick.price) || tick.price <= 0) continue;
    if (next === marks) next = { ...marks };
    next[symbol] = { ...previous, [field]: { asOf: tick.timestamp, price: tick.price } };
  }
  return next;
}
