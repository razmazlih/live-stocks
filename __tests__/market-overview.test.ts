import { describe, expect, it } from 'vitest';
import { buildMarketOverview, type SymbolMarketData } from '@/lib/market-overview';
import { normalizeMarketData } from '@/lib/services/market-overview';
import { getMarketClock, tradingSession } from '@/lib/utils/trading-hours';
import type { Position, PositionLot } from '@/types';

const ms = Date.parse;
const session = '2026-11-20';
const prev = '2026-11-19';
const open = ms('2026-11-20T20:00:00Z');
const post = ms('2026-11-20T23:00:00Z');
const closed = ms('2026-11-21T17:00:00Z');
const accounting = { annualGrowthRate: 0.1, usdToIls: 4, fxHistoryPoints: [
  { timestamp: ms(prev), close: 4 }, { timestamp: ms(session), close: 4 },
] };
const buy = (quantity: number, price: number, date: string): PositionLot =>
  ({type: 'BUY', quantity, price, executedAt: date, hasCommission: false, commissionAmount: 0});
const sell = (quantity: number, price: number, date: string): PositionLot => ({...buy(quantity, price, date), type: 'SELL'});
const pos = (symbol: string, lots: PositionLot[], location = 'broker'): Position =>
  ({symbol, lots, location, entryDate: lots[0].executedAt, display: symbol, quantity: 1, entryPrice: 100, imageUrl: ''});
const mark = (price: number, asOf: number) => ({price, asOf});
const stock: SymbolMarketData = {
  closes: {[prev]:mark(100, tradingSession(prev)!.close), [session]:mark(110, tradingSession(session)!.close)},
  regular: mark(105, open), extended: mark(108, post - 300_000),
};

describe('US session timing', () => {
  it.each([
    ['2026-11-20T08:59Z','closed'], ['2026-11-20T09:00Z','pre'], ['2026-11-20T14:30Z','regular'],
    ['2026-11-20T21:00Z','post'], ['2026-11-21T01:00Z','closed'], ['2026-11-26T17:00Z','closed'],
    ['2026-11-27T17:59Z','regular'], ['2026-11-27T18:00Z','post'], ['2026-11-27T22:00Z','closed'],
    ['2026-10-26T13:30Z','regular'], ['2026-03-09T13:30Z','regular'], ['2030-11-20T17:00Z','unknown'],
    ['2026-12-07T01:59Z','closed'], ['2026-12-07T02:00Z','overnight'], ['2026-12-07T08:55Z','closed'],
    ['2026-12-07T09:00Z','pre'], ['2026-12-25T03:00Z','closed'], ['2026-12-26T03:00Z','closed'],
  ])('classifies %s as %s', (instant, phase) => expect(getMarketClock(ms(instant)).phase).toBe(phase));

  it('carries Friday into the weekend, Monday pre-market and the next holiday-aware transition', () => {
    expect(getMarketClock(closed).closing?.date).toBe(session);
    expect(getMarketClock(ms('2026-11-23T10:00Z')).closing?.date).toBe(session);
    expect(getMarketClock(ms('2026-11-25T23:00Z')).nextTransition).toBe(ms('2026-11-26T01:00Z'));
    expect(getMarketClock(ms('2026-11-26T11:00Z')).nextTransition).toBe(ms('2026-11-27T09:00Z'));
    expect(getMarketClock(ms('2026-12-05T20:00Z')).nextTransition).toBe(ms('2026-12-07T02:00Z'));
  });
});

describe('personal session attribution', () => {
  it('includes same-session round trips and fully sold positions using actual fills gross of fees', () => {
    const result = buildMarketOverview([
      pos('NEW', [{...buy(3,20,session),hasCommission:true,commissionAmount:3},sell(3,25,session)]),
      pos('SOLD',[buy(2,40,prev),sell(2,120,session)]),
      pos('KEPT',[buy(1,90,prev)]),
    ], {SOLD:{closes:{[prev]:stock.closes[prev]}}, KEPT:stock}, open, accounting);
    expect(result.daily).toMatchObject({amountUsd:60,amountIls:240,percent:null,missingSymbols:[],provisional:true});
    expect(result.daily.contributors.map(row => [row.symbol,row.amountUsd])).toEqual([['SOLD',40],['NEW',15],['KEPT',5]]);
  });

  it('counts only money earned after same-day buys; merges symbols across sources and reconciles partial rows', () => {
    const positions = [pos('AAA',[buy(1,10,prev)],'one'),pos('AAA',[buy(2,104,session)],'two'),
      pos('BAD',[buy(5,22,prev)],'two')];
    const result = buildMarketOverview(positions,{AAA:stock},open,accounting);
    expect(result.daily).toMatchObject({amountUsd:7,coveredPositions:2,totalPositions:3,missingSymbols:['BAD'],missingSources:['two']});
    expect(result.daily.contributors).toEqual([{symbol:'AAA',amountUsd:7,amountIls:28}]);
    expect(result.daily.sourceContributors.map(row => [row.sourceId,row.amountUsd])).toEqual([['one',5],['two',2]]);
  });

  it('isolates date-only checkpoints, unknown prices and missing FX, and pins the close target through the weekend', () => {
    const positions = [pos('AAA',[buy(10,90,prev)]),pos('LATER',[buy(5,99,'2026-11-21')])];
    const after = buildMarketOverview(positions,{AAA:stock},post,accounting);
    const saturday = buildMarketOverview(positions,{AAA:stock},closed,accounting);
    expect(after.closeConfirmed).toBe(true);
    expect(after.closingSummary).toEqual(saturday.closingSummary);
    expect(saturday.closingSummary?.totalCurrentPnLUsd).toBe(200);
    expect(saturday.daily).toMatchObject({amountUsd:100,amountIls:400,percent:10});
    expect(buildMarketOverview(positions,{},post,accounting).closeConfirmed).toBe(false);
    expect(buildMarketOverview(positions,{AAA:stock},post,{...accounting,fxHistoryPoints:[]}).daily.amountIls).toBeNull();
    const checkpoint = pos('X',[{...buy(1,10,session),type:'RECONCILE'}]);
    expect(buildMarketOverview([checkpoint],{X:stock},open,accounting).daily.amountUsd).toBeNull();
  });

  it('returns an absolute-move ranking with coverage, preserving a known zero without featuring it', () => {
    const positions = ['A','B','C','D'].map(symbol => pos(symbol,[buy(1,10,prev)]));
    const result = buildMarketOverview(positions,{A:stock,B:{...stock,extended:mark(125,post)},C:{...stock,extended:mark(110,post)}},post,accounting);
    expect(result.extended.map(item=>item.symbol)).toEqual(['B','A']);
    expect(result).toMatchObject({extendedCovered:3,extendedEligible:4});
  });
});

describe('regular close and extended evidence', () => {
  const sec = (date: string) => ms(date)/1000;
  const meta = {symbol:'AAA',currency:'USD',exchangeName:'NMS',exchangeTimezoneName:'America/New_York'};
  const daily = {meta:{...meta,regularMarketTime:sec('2026-11-20T20:58Z'),regularMarketPrice:110},
    timestamp:[sec('2026-11-19T14:30Z'),sec('2026-11-20T14:30Z')],indicators:{quote:[{close:[100,110]}]}};
  const ext = {meta:{...meta,tradingPeriods:{post:[[{start:sec('2026-11-20T21:00Z'),end:sec('2026-11-21T01:00Z')}]]}},
    timestamp:['2026-11-19T21:30Z','2026-11-20T20:55Z','2026-11-20T21:10Z','2026-11-20T22:58Z']
      .map(sec),indicators:{quote:[{close:[999,500,112,980]}]}};
  it('rejects an unfinished daily candle after the closing bell and gates extended bars with explicit session bounds', () => {
    const data = normalizeMarketData('AAA',{},daily,ext,getMarketClock(post),post);
    expect(data.closes[session]).toBeUndefined();
    expect(data.closes[prev].price).toBe(100);
    expect(data.extended).toEqual(mark(112,ms('2026-11-20T21:15Z')));
    const confirmed = {...daily,meta:{...daily.meta,regularMarketTime:sec('2026-11-20T21:00Z')}};
    expect(normalizeMarketData('AAA',{},confirmed,ext,getMarketClock(post),post).closes[session].price).toBe(110);
    expect(normalizeMarketData('AAA',{},daily,{...ext,meta},getMarketClock(post),post).extended).toBeUndefined();
  });
  it('never rolls a missing, old, future or premarket timestamp into a regular quote', () => {
    const chart = {...daily, meta};
    for(const t of [undefined,sec('2026-11-19T20:00Z'),sec('2026-11-20T12:00Z'),sec('2026-11-20T20:05Z')]) {
      expect(normalizeMarketData('AAA',{c:500,t},chart,undefined,getMarketClock(open),open).regular).toBeUndefined();
    }
    expect(normalizeMarketData('AAA',{c:98,t:open/1000},chart,undefined,getMarketClock(open),open).regular?.price).toBe(98);
  });
});

describe('overnight availability and stale FX', () => {
  it('waits for an explicitly identified overnight period and prices referenced to the latest regular close', () => {
    const now = ms('2026-12-07T03:30Z');
    const clock = getMarketClock(now);
    const lastDay = '2026-12-04';
    const day = tradingSession(lastDay)!;
    const meta = {symbol:'AAA',currency:'USD',exchangeName:'NMS',exchangeTimezoneName:'America/New_York',
      regularMarketPrice:100,regularMarketTime:day.close/1000};
    const daily = {meta,timestamp:[day.open/1000],indicators:{quote:[{close:[100]}]}};
    const period = {start:ms('2026-12-07T02:00Z')/1000,end:ms('2026-12-07T08:55Z')/1000};
    const bar = {timestamp:[ms('2026-12-07T03:15Z')/1000],indicators:{quote:[{close:[95]}]}};
    const supported = normalizeMarketData('AAA',{},daily,{...bar,meta:{...meta,tradingPeriods:{overnight:[[period]]}}},clock,now);
    const unsupported = normalizeMarketData('AAA',{},daily,{...bar,meta:{...meta,tradingPeriods:{pre:[[period]]}}},clock,now);
    const positions = [pos('AAA',[buy(2,80,prev)])];
    expect(buildMarketOverview(positions,{AAA:supported},now,accounting)).toMatchObject({phase:'overnight',extended:[{symbol:'AAA',price:95,percent:-5}]});
    expect(buildMarketOverview(positions,{AAA:unsupported},now,accounting)).toMatchObject({phase:'closed',extended:[]});
  });

  it('does not promote an old FX observation to a known current daily gain or closing profit in shekels', () => {
    const data = buildMarketOverview([pos('AAA',[buy(1,70,prev)])],{AAA:stock},post,
      {...accounting,fxHistoryPoints:[{timestamp:ms('2026-01-06'),close:8}]});
    expect(data.daily.amountUsd).toBe(10);
    expect(data.daily.amountIls).toBeNull();
    expect(data.closingSummary?.totalCurrentPnLIls).toBeNaN();
  });
});

it('uses the FX provider’s local date and freezes ILS conversion before the US closing bell', () => {
  const thursday = tradingSession('2026-10-22')!;
  const friday = tradingSession('2026-10-23')!;
  const positions = [pos('AAA',[buy(1,90,thursday.date)])];
  const marks = {AAA:{closes:{
    [thursday.date]:mark(100,thursday.close), [friday.date]:mark(110,friday.close),
  }, regular:mark(105,friday.open+60_000)}};
  const fx = {...accounting,fxHistoryPoints:[
    {timestamp:ms('2026-10-21T23:00:00Z'),close:3}, // Thursday in London.
    {timestamp:ms('2026-10-22T23:00:00Z'),close:4}, // Friday in London.
  ]};
  expect(buildMarketOverview(positions,marks,friday.open+60_000,fx).daily).toMatchObject({fxDate:friday.date,amountIls:20});
  expect(buildMarketOverview(positions,marks,friday.close+300_000,fx).daily).toMatchObject({fxDate:thursday.date,amountIls:30});
  const weekendFx = {...fx,fxHistoryPoints:[...fx.fxHistoryPoints,{timestamp:ms('2026-10-23T12:00:00Z'),close:5}]};
  const saturday = buildMarketOverview(positions,marks,friday.close+86_400_000,weekendFx);
  expect(saturday.daily).toMatchObject({fxDate:thursday.date,amountIls:30});
  expect(saturday.closingSummary?.totalCurrentPnLIls).toBe(60);
});

it('at the bell shows a previous complete dated result only until the first eligible quote arrives', () => {
  const instant = tradingSession(session)!.open;
  const wednesday = '2026-11-18';
  const holding = pos('AAA', [buy(2,80,wednesday)]);
  const history = { [prev]: stock.closes[prev], [wednesday]: mark(96,tradingSession(wednesday)!.close) };
  const noneToday = { AAA: { closes: history, regular: mark(999, instant - 1) } };
  const accountingFx = {...accounting,fxHistoryPoints:[...accounting.fxHistoryPoints,{timestamp:ms(wednesday),close:3.5}]};
  expect(buildMarketOverview([holding],noneToday,instant,accountingFx)).toMatchObject({
    phase:'regular',sessionDate:prev,asOf:tradingSession(prev)!.close,closingFxDate:wednesday,
    daily:{previousSession:true,amountUsd:8,amountIls:28,fxDate:wednesday},
  });
  expect(buildMarketOverview([holding],{AAA:{closes:history,regular:mark(105,instant)}},instant,accountingFx)).toMatchObject({
    sessionDate:session,asOf:instant,daily:{previousSession:false,amountUsd:10},
  });
  expect(buildMarketOverview([holding],{AAA:{closes:{[prev]:stock.closes[prev]}}},instant,accountingFx)).toMatchObject({
    sessionDate:session,daily:{previousSession:false,amountUsd:null},
  });
  const newAccount = [pos('AAA',[buy(1,91,session)])];
  expect(buildMarketOverview(newAccount,noneToday,instant,accountingFx).daily).toMatchObject({previousSession:false,amountUsd:null});
});
