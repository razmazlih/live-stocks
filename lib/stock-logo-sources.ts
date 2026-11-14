/** Exclude the retired logo host even when supplied by old data or a browser cache. */
export function isRetiredStockLogoUrl(value: string): boolean {
  try {
    const hostname = new URL(value.trim(), 'https://localhost').hostname.toLowerCase().replace(/\.+$/, '');
    return hostname === 'logo.clearbit.com' || hostname.endsWith('.logo.clearbit.com');
  } catch {
    return false;
  }
}

export function getStockLogoUrl(symbol: string, imageUrl?: string | null): string {
  const supplied = imageUrl?.trim();
  return supplied && !isRetiredStockLogoUrl(supplied)
    ? supplied
    : `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol.trim().toUpperCase())}.png`;
}
