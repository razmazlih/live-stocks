import type { Position, HistoricalPoint } from '@/types';

export const DEMO_USER_ID = 'local-demo-account';
export const DEMO_COOKIE = 'livestocks-local-demo';
export const DEMO_SOURCE_ID = '10000000-0000-4000-8000-000000000001';
export const demoUser = { id: DEMO_USER_ID, email: 'demo@example.test', name: 'חשבון דמו', emailVerified: true };
export const demoPositions: Position[] = [
  ['AAPL', 'Apple', 185, 12, 212], ['MSFT', 'Microsoft', 390, 8, 425], ['NVDA', 'NVIDIA', 140, 20, 132],
].map(([symbol, display, price, quantity], index) => ({
  id: `20000000-0000-4000-8000-00000000000${index + 1}`, symbol: String(symbol), display: String(display),
  imageUrl: '', entryPrice: Number(price), quantity: Number(quantity), entryDate: '2026-10-01T12:00:00Z', location: DEMO_SOURCE_ID,
  lots: [{ id: `demo-lot-${index}`, type: 'BUY', price: Number(price), quantity: Number(quantity), executedAt: '2026-10-01T12:00:00Z', hasCommission: false, commissionAmount: 0, commissionKnown: true }], plans: [],
}));

export function demoDashboard() {
  const prices = [212, 425, 132];
  const candlesByKey: Record<string, HistoricalPoint[]> = Object.fromEntries(demoPositions.map((position, index) => [position.id!, Array.from({ length: 46 }, (_, day) => ({
    timestamp: Date.UTC(2026, 9, 1 + day), close: position.entryPrice + (prices[index] - position.entryPrice) * day / 45 + Math.sin(day / 3) * 2,
  }))]));
  return { positions: demoPositions, activationPositions: demoPositions, usdToIls: 3.65,
    fxHistoryPoints: [{ timestamp: Date.UTC(2026, 9, 1), close: 3.65 }],
    quotes: Object.fromEntries(demoPositions.map((position, index) => [position.symbol, { c: prices[index], d: index === 2 ? -1.2 : 2.5 }])),
    candlesByKey, contextCandlesByKey: candlesByKey, spyPoints: Array.from({ length: 46 }, (_, day) => ({ timestamp: Date.UTC(2026, 9, 1 + day), close: 600 + day * 0.5 })) };
}

export function demoTable(table: string): Record<string, unknown>[] {
  const created_at = '2026-10-01T12:00:00Z';
  if (table === 'investment_sources') return [{ id: DEMO_SOURCE_ID, name: 'תיק הדגמה', archived_at: null, legacy_location: null, created_at }];
  if (table === 'settings') return [{ id: 'demo-settings', annual_growth_rate: 0.05, currency: 'USD', refresh_interval: 60, is_active: true, created_at }];
  if (table === 'positions') return demoPositions.map(p => ({ id: p.id, symbol: p.symbol, display: p.display, image_url: '', entry_price: p.entryPrice, quantity: p.quantity, entry_date: p.entryDate, location: p.location, created_at }));
  if (table === 'position_lots') return demoPositions.flatMap(p => p.lots!.map(l => ({ id: l.id, position_id: p.id, side: l.type, price: l.price, quantity: l.quantity, executed_at: l.executedAt, has_commission: false, commission_amount: 0, commission_known: true, created_at })));
  return [];
}
