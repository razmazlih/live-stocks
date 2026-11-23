import { describe, expect, it } from 'vitest';
import { demoQuote } from '@/lib/demo/assets';
import { displayedQuote } from '@/lib/live-display-quote';
import type { LiveQuoteTick } from '@/lib/live-quotes';

const tick: LiveQuoteTick = {symbol:'AAPL', price:101, timestamp:Date.parse('2026-11-20T16:10Z'), phase:'regular', source:'trade'};
const snapshot = {c:100, pc:98, t:Date.parse('2026-11-20T15:00Z') / 1000};
describe('displayed live stock quote', () => {
  it('combines a regular trade with a dated matching-session baseline', () => {
    const data = displayedQuote('AAPL', snapshot, tick);
    expect(data.quote?.c).toBe(101); expect(data.quote?.d).toBe(3);
    expect(data.timestamp).toBe(tick.timestamp);
    expect(data.quote?.dp).toBeCloseTo(3/98*100);
  });
  it('keeps newer snapshots, rejects cross-symbol prices and does not mix yesterday’s baseline with today', () => {
    expect(displayedQuote('MSFT',snapshot,tick).quote).toBe(snapshot);
    expect(displayedQuote('AAPL',snapshot,{...tick,timestamp:1}).quote).toBe(snapshot);
    const result = displayedQuote('AAPL',{...snapshot,t:Date.parse('2026-11-19T17:00Z')/1000},tick);
    expect(result.quote?.c).toBe(101); expect(result.quote?.dp).toBeUndefined();
    expect(displayedQuote('AAPL',{c:99}).timestamp).toBeNull();
    const retained = displayedQuote('AAPL',snapshot,{...tick,stale:true});
    expect(retained.stale).toBe(true);
    expect(retained.timestamp).toBe(tick.timestamp);
  });
  it('uses the explicitly simulated previous close for a demo inspector and never assumes it for real data', () => {
    const demo = demoQuote('AAPL');
    const sim: LiveQuoteTick = {...tick, source: 'demo', price: demo.pc + 2};
    expect(displayedQuote('AAPL', demo, sim).quote?.d).toBe(2);
    expect(displayedQuote('AAPL', demo, {...sim,source:'trade'}).quote?.d).toBeUndefined();
  });
  it('uses a regular closing mark for an extended print, with no fabricated last change', () => {
    const post: LiveQuoteTick = {...tick,phase:'post',timestamp:Date.parse('2026-11-20T22:00Z')};
    expect(displayedQuote('AAPL',snapshot,post).quote?.dp).toBeUndefined();
    const result = displayedQuote('AAPL',{c:100,t:Date.parse('2026-11-20T21:00Z')/1000},post);
    expect(result.extended).toBe(true); expect(result.quote?.dp).toBe(1);
  });
});
