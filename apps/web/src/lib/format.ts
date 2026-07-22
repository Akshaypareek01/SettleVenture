/**
 * Formats a number as Indian Rupees.
 * @param amount - Numeric amount
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formats a signed INR amount (keeps + / − for settlement nets).
 * @param amount - Numeric amount (can be negative)
 */
export function formatSignedINR(amount: number): string {
  const abs = formatINR(Math.abs(amount));
  if (amount > 0.01) return `+${abs}`;
  if (amount < -0.01) return `−${abs}`;
  return formatINR(0);
}

/**
 * Formats an ISO date string for display.
 * @param dateStr - ISO date string
 */
export function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr));
}

/**
 * Returns human-readable settlement status label.
 * @param status - Settlement status code
 */
export function settlementLabel(status: string): string {
  const labels: Record<string, string> = {
    owed_by_group: 'Group owes them',
    owes_group: 'Owes group',
    settled: 'Settled',
  };
  return labels[status] ?? status;
}
