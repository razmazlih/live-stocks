export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function toFixedNumber(value: number, digits = 2): number {
  return Number.parseFloat(value.toFixed(digits));
}
