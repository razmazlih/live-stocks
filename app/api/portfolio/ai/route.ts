import { NextResponse } from 'next/server';
import { cachePortfolioAiSnapshot } from '@/lib/services/portfolio-ai-cache';
import { getSupabaseClient, type Database } from '@/lib/supabase';
import { mapPositionRow, mapPositionPlanRow, expandPositionActivations, computeRealizedSalesWithFx } from '@/lib/positions';
import { calculatePositionMetrics, calculatePortfolioSummary, calculateSymbolExceptionAssessment, calculateRealizedPortfolioTotals, calculateRealizedTaxLiability, enrichPortfolioSummaryWithRealized, mapCandleDataToPoints } from '@/lib/calculations';
import { fetchFinnhubQuote } from '@/lib/services/finnhub';
import { fetchExchangeRateResponse, extractExchangeRate } from '@/lib/services/exchange-rate';
import { fetchYahooCandlesData } from '@/lib/services/yahoo-candles';
import { buildUsdIlsRateResolver, normalizeToUtcDay } from '@/lib/services/historical-fx';
import type { HistoricalPoint } from '@/types';
import { buildCloseProposalSnapshot } from '@/lib/close-proposal-snapshot';

export const revalidate = 0;
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

// Read every page: Supabase's default response limit must not silently truncate a portfolio.
type Tables = Database['public']['Tables'];
async function loadRows<T extends keyof Tables>(table: T, columns: string, order: string): Promise<Tables[T]['Row'][]> {
  const rows: Tables[T]['Row'][] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await getSupabaseClient().from(table).select(columns).order(order).range(offset, offset + 499);
    if (result.error) throw new Error(`Failed to load ${table}`);
    rows.push(...((result.data ?? []) as unknown as Tables[T]['Row'][]));
    if ((result.data ?? []).length < 500) return rows;
  }
}

async function buildSnapshot() {
  const startedAt = new Date().toISOString();
  const [positionRows, lotRows, planRows, settingsRows] = await Promise.all([
    loadRows('positions', '*', 'id'),
    loadRows('position_lots', '*', 'id'),
    loadRows('position_plans', '*', 'id'),
    loadRows('settings', 'annual_growth_rate,currency,finnhub_token,updated_at', 'id'),
  ]);
  const settings = settingsRows[0];
  const warnings: string[] = [];
  const configuredRate = settings?.annual_growth_rate;
  const annualGrowthRate = typeof configuredRate === 'number' && Number.isFinite(configuredRate) && configuredRate > -1
    ? configuredRate : null;
  if (annualGrowthRate === null) warnings.push('Annual return target is unavailable; target calculations are omitted.');
  const positions = positionRows.map(row => mapPositionRow({ ...row, position_lots: lotRows.filter(lot => lot.position_id === row.id) }));
  const activations = positions.flatMap(expandPositionActivations);
  const symbols = [...new Set([...positions.map(p => p.symbol), ...planRows.map(p => p.symbol)].map(s => s.trim().toUpperCase()))].filter(Boolean).sort();
  const token = settings?.finnhub_token || process.env.FINNHUB_TOKEN;
  const [quoteEntries, fxResult] = await Promise.all([
    Promise.all(symbols.map(async symbol => [symbol, await fetchFinnhubQuote(symbol, { token, init: { cache: 'no-store', signal: AbortSignal.timeout(10000) } })] as const)),
    fetchExchangeRateResponse({ init: { cache: 'no-store', signal: AbortSignal.timeout(10000) }, retries: 1 }).then(data => extractExchangeRate(data, 'ILS')).catch(() => null),
  ]);
  const quotes = new Map(quoteEntries);
  if (fxResult === null) warnings.push('Current USD/ILS rate unavailable; ILS values are omitted.');
  let fxHistory: HistoricalPoint[] = [];
  const timestamps = lotRows.map(lot => new Date(lot.executed_at).getTime()).filter(Number.isFinite);
  if (timestamps.length) {
    try {
      fxHistory = mapCandleDataToPoints(await fetchYahooCandlesData('ILS=X', Math.floor(normalizeToUtcDay(Math.min(...timestamps)) / 1000) - 10 * 86400, Math.floor(Date.now() / 1000), 'D'));
    } catch { /* Explicitly reported below; USD calculations remain available. */ }
  }
  const fx = fxResult ?? 1;
  const rateAt = buildUsdIlsRateResolver(fxHistory, fx, { allowFallback: false });
  if (timestamps.some(timestamp => !Number.isFinite(rateAt(timestamp)))) {
    warnings.push('Historical USD/ILS rates are missing for recorded transactions; affected ILS calculations are omitted.');
  }
  const realizedSales = positions.flatMap(p => computeRealizedSalesWithFx(p, rateAt)).sort((a,b) => a.sellDate.localeCompare(b.sellDate));
  const open = activations.filter(p => p.quantity > 0 && !p.isHistoricalActivation);
  const missingSymbols = [...new Set(open.filter(p => !quotes.get(p.symbol.trim().toUpperCase())).map(p => p.symbol.trim().toUpperCase()))];
  if (missingSymbols.length) warnings.push(`Missing market prices: ${missingSymbols.join(', ')}. Full portfolio valuation and allocations are omitted.`);
  const metrics = open.map(position => {
    const quote = quotes.get(position.symbol.trim().toUpperCase());
    if (!quote) return null;
    return calculatePositionMetrics(position, quote.price, fx, annualGrowthRate ?? 0, quote.dailyChange, rateAt);
  });
  const pricedMetrics = metrics.filter(m => m !== null);
  const openSummary = missingSymbols.length ? null : calculatePortfolioSummary(pricedMetrics, fx, positions, rateAt);
  const tax = calculateRealizedTaxLiability(realizedSales.map(s => ({ profitUsd: s.profitUsd, profitIls: s.profitIls ?? 0, timestamp: new Date(s.sellDate).getTime() })));
  const realizedTotals = calculateRealizedPortfolioTotals(realizedSales, annualGrowthRate ?? 0, fx, rateAt);
  const summary = openSummary ? enrichPortfolioSummaryWithRealized(openSummary, realizedTotals, tax) : null;
  const holdings = open.map((position, index) => {
    const metric = metrics[index];
    return {
      position,
      currentPriceUsd: metric?.currentPrice ?? null,
      marketValueUsd: metric?.currentValue ?? null,
      marketValueIls: fxResult !== null ? metric?.currentValueIls ?? null : null,
      unrealizedPnlUsd: metric?.positionPnLUsd ?? null,
      unrealizedPnlIls: fxResult !== null ? metric?.positionPnLIls ?? null : null,
      returnPercent: metric?.roiPercent ?? null,
      allocationPercent: openSummary && openSummary.totalValue > 0 && metric ? metric.currentValue / openSummary.totalValue * 100 : null,
      annualTargetPriceUsd: annualGrowthRate !== null ? calculateSymbolExceptionAssessment([position], undefined, annualGrowthRate)?.projectedPrice ?? null : null,
    };
  });
  const targets = annualGrowthRate === null ? null : symbols.map(symbol => {
    const grouped = activations.filter(p => p.symbol.trim().toUpperCase() === symbol);
    const assessment = calculateSymbolExceptionAssessment(grouped, quotes.get(symbol)?.price, annualGrowthRate);
    if (!assessment) return null;
    return { ...assessment, positions: undefined };
  }).filter(t => t !== null);
  const calculationAsOf = Date.now();
  const quoteObservations = Object.fromEntries(quoteEntries.map(([symbol, quote]) => [symbol, { priceUsd: quote?.price ?? null, dailyChangePerShareUsd: quote?.dailyChange ?? null, marketTimestamp: quote?.timestamp ? new Date(quote.timestamp * 1000).toISOString() : null, source: 'Finnhub', status: quote ? 'last_available' : 'unavailable' }]));
  const closePairProposals = buildCloseProposalSnapshot({ positions, metrics: pricedMetrics, annualGrowthRate, asOf: calculationAsOf, quotes: quoteObservations });
  const closePairOnlyProposals = buildCloseProposalSnapshot({ positions, metrics: pricedMetrics, annualGrowthRate, asOf: calculationAsOf, quotes: quoteObservations, maxLosers: 1 });
  // Never expose settings tokens. Convert non-finite/missing values to explicit nulls.
  const payload = {
    schemaVersion: 1, startedAt, generatedAt: new Date().toISOString(),
    scope: 'all recorded positions and plans in the configured shared portfolio',
    currencies: { prices: 'USD', base: 'USD', display: settings?.currency ?? 'USD', usdToIls: fxResult, fxSource: fxResult === null ? 'unavailable' : 'open.er-api.com', historicalFxPointCount: fxHistory.length },
    dataQuality: { completeMarketValuation: missingSymbols.length === 0, missingQuoteSymbols: missingSymbols, warnings },
    goals: { annualGrowthRate, annualGrowthRatePercent: annualGrowthRate === null ? null : annualGrowthRate * 100, meaning: 'User annual compound return target, evaluated as of today; not a price forecast or guaranteed return. currentGapUsd is positive for a shortfall and negative for a surplus.', symbolTargets: targets },
    summary: summary ? { ...summary, ...(annualGrowthRate === null ? { totalProjectedPnLUsd: null, totalProjectedPnLIls: null, totalCombinedUsd: null, totalCombinedIls: null } : {}) } : null,
    closePairProposals, closePairOnlyProposals, holdings, positions, plans: planRows.map(mapPositionPlanRow), realizedSales,
    realized: { totals: { ...realizedTotals, expectedProfitUsd: annualGrowthRate === null ? null : realizedTotals.expectedProfitUsd, expectedProfitIls: annualGrowthRate === null ? null : realizedTotals.expectedProfitIls }, estimatedTaxUsd: tax.taxUsd, estimatedTaxIls: fxResult === null ? null : tax.taxIls, assumedTaxRate: 0.25 },
    quotes: quoteObservations,
    limitations: [
      'Read-only snapshot; reading this API does not execute or update pending plans.',
      'Database tables are read separately, not as an atomic transaction.',
      'Quotes are last available market observations, possibly delayed or from a prior trading session; generatedAt is not a market timestamp.',
      'Allocation denominator includes recorded open securities only; cash, deposits, withdrawals, dividends, liabilities, sector exposure, risk tolerance and investment horizon are not tracked and are unknown.',
      'Tax is an application estimate using a 25% model, not actual paid tax or a complete tax assessment. Summary totalTaxesPaid fields mean estimated tax.',
      'ILS profit includes currency gains and losses using daily historical purchase/sale FX and current FX for open market value. Missing historical FX makes affected ILS amounts unavailable; non-trading days use the last available past rate.',
      'Position lots include recorded commissions; future sale costs and slippage are unknown. Pending plans are intentions, not holdings.',
      'Historical prices, volatility, drawdowns, benchmark returns and company fundamentals are not included; obtain them separately before making recommendations.',
    ],
  };
  return JSON.parse(JSON.stringify(payload, (key, value) => {
    if (fxResult === null && (/ils/i.test(key) && key !== 'historicalFxPointCount')) return null;
    return value === undefined || (typeof value === 'number' && !Number.isFinite(value)) ? null : value;
  }));
}

const getSnapshot = cachePortfolioAiSnapshot(buildSnapshot);

export async function GET(request?: Request) {
  try {
    const snapshot = await getSnapshot();
    if (request && new URL(request.url).searchParams.get('format') === 'html') {
      const json = JSON.stringify(snapshot, null, 2)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Portfolio snapshot for AI analysis</title></head><body><h1>Portfolio snapshot for AI analysis</h1><p>Read-only portfolio data. All amounts, timestamps, sources and limitations are included in the JSON below. This snapshot uses the same five-minute server cache as the JSON API.</p><pre>${json}</pre></body></html>`, {
        headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' },
      });
    }
    return NextResponse.json(snapshot, { headers });
  } catch {
    return NextResponse.json({ error: 'Failed to load complete portfolio snapshot' }, { status: 500, headers: { ...headers, 'Retry-After': '30' } });
  }
}
