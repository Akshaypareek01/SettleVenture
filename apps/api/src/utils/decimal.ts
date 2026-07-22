/**
 * Converts MongoDB Decimal128 or number to a JS number for display/calc.
 * @param value - Decimal128, number, or string amount
 */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  if (typeof value === 'object' && value !== null && 'toString' in value) {
    return parseFloat(String(value)) || 0;
  }
  return 0;
}

/**
 * Converts a rupee amount to Decimal128-safe string (2 decimal places).
 * @param amount - Amount in INR
 */
export function toDecimalString(amount: number): string {
  if (amount <= 0) throw new Error('Amount must be positive');
  return amount.toFixed(2);
}

/**
 * Formats a non-negative amount for Decimal128 (allows zero).
 * @param amount - Amount in INR
 */
export function toDecimalStringNonNegative(amount: number): string {
  if (amount < 0) throw new Error('Amount cannot be negative');
  return amount.toFixed(2);
}

/**
 * Formats amount as INR currency string.
 * @param amount - Numeric amount
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
