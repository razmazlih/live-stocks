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
  return { c: price, d: 0, dp: 0, h: price, l: price, o: price, pc: price, t: 0 };
}
export function demoAsset(symbol: string) {
  const asset = demoAssets.find(asset => asset.symbol === symbol.toUpperCase());
  return asset ? { symbol: asset.symbol, display: asset.display, imageUrl: '' } : null;
}
