/** Fixed synthetic prices for the demo, never live market data. */
export const demoAssets = [
  { symbol: 'AAPL', display: 'Apple', price: 212 },
  { symbol: 'MSFT', display: 'Microsoft', price: 425 },
  { symbol: 'NVDA', display: 'NVIDIA', price: 132 },
  { symbol: 'GOOGL', display: 'Alphabet', price: 180 },
  { symbol: 'AMZN', display: 'Amazon', price: 205 },
  { symbol: 'TSLA', display: 'Tesla', price: 260 },
  { symbol: 'META', display: 'Meta Platforms', price: 590 },
  { symbol: 'TTWO', display: 'Take-Two Interactive', price: 235 },
  { symbol: 'SPY', display: 'SPDR S&P 500 ETF', price: 625 },
];
export function demoQuote(symbol: string, fallbackPrice = 100) {
  const price = demoAssets.find(asset => asset.symbol === symbol.toUpperCase())?.price ?? fallbackPrice;
  const changes: Record<string, number> = { AAPL: 2.5, MSFT: -1.75, NVDA: 4.25 };
  const change = changes[symbol.toUpperCase()] ?? 0;
  const previousClose = price - change;
  return { c: price, d: change, dp: 100 * change / previousClose, h: Math.max(price, previousClose),
    l: Math.min(price, previousClose), o: previousClose, pc: previousClose, t: 0 };
}
export function demoAsset(symbol: string) {
  const asset = demoAssets.find(asset => asset.symbol === symbol.toUpperCase());
  return asset ? { symbol: asset.symbol, display: asset.display, imageUrl: '' } : null;
}
