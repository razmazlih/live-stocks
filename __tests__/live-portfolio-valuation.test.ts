import { describe, expect, it } from 'vitest';
import type { Position } from '@/types';
import type { LiveQuoteTick } from '@/lib/live-quotes';
import { applySessionTicks, repricePortfolio, valuePortfolio } from '@/lib/portfolio-valuation';
import { buildMarketOverview, demoMarketBasis } from '@/lib/market-overview';

const time = Date.parse('2026-11-20T20:00:00Z');
const holding: Position = { id: 'a', symbol: 'AAPL', display: 'Apple', imageUrl: '', quantity: 2, entryPrice: 190, location: 'first', entryDate: '2025-05-01' };
const quotes = { AAPL: { c: 210, d: 2, pc: 208, t: time / 1000 } };
const core = { positions: [holding], activationPositions: [holding], rate: 3.7, quotes, valuationTime: time,
  fxHistoryPoints: [{timestamp: Date.parse('2025-05-01'), close: 3.5}] };
const tick: LiveQuoteTick = {symbol:'AAPL',price:212,timestamp:time+1000,phase:'regular',source:'trade'};

describe('live portfolio valuation', () => {
  it('revalues in both currencies and keeps targets and realized amounts independent of market ticks', () => {
    const base = valuePortfolio(core, .05);
    const live = repricePortfolio(base, {AAPL:tick}, time + 1000);
    expect(live.summary.totalValue).toBe(424);
    expect(live.summary.totalNetPnLUsd - base.summary.totalNetPnLUsd).toBe(4);
    expect(live.summary.totalNetPnLIls - base.summary.totalNetPnLIls).toBeCloseTo(14.8);
    expect(live.metrics[0].dailyChange).toBe(4);
    expect(live.summary.totalProjectedPnLUsd).toBe(base.summary.totalProjectedPnLUsd);
    expect(live.summary.totalRealizedProfitUsd).toBe(base.summary.totalRealizedProfitUsd);
    expect(valuePortfolio(core,.1).summary.totalProjectedPnLUsd).toBeGreaterThan(base.summary.totalProjectedPnLUsd);
    expect(repricePortfolio(base,{AAPL:{...tick,timestamp:time-1000}},time)).toBe(base);
  });
  it('updates a verified postmarket mover while keeping all regular closing amounts frozen', () => {
    const post = Date.parse('2026-11-20T22:00:00Z');
    const data = demoMarketBasis([holding], quotes, post, 3.7);
    const next = applySessionTicks(data.marks, {AAPL:{...tick,phase:'post',price:220,timestamp:post}}, post);
    const accounting = {annualGrowthRate:.05,usdToIls:3.7,fxHistoryPoints:data.fxHistoryPoints};
    const first = buildMarketOverview([holding],data.marks,post,accounting);
    const changed = buildMarketOverview([holding],next,post,accounting);
    expect(changed.extended[0].price).toBe(220);
    expect(changed.closingSummary).toEqual(first.closingSummary);
    expect(changed.daily).toEqual(first.daily);
    expect(applySessionTicks(next,{AAPL:tick},post)).toBe(next);
    expect(applySessionTicks(next,{AAPL:{...tick,timestamp:post+1000,phase:'post'}},post)).toBe(next);
  });
});
