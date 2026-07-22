/** IST is UTC+5:30 with no DST — a fixed offset in minutes. */
const IST_OFFSET_MIN = 5 * 60 + 30;

/**
 * Returns the wall-clock date components in IST for a given instant.
 * @param d - Instant
 */
function istParts(d: Date): { year: number; month: number } {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

/**
 * Indian financial year label (Apr–Mar) for an instant, e.g. "2025-26".
 * @param d - Instant (defaults to caller-provided date)
 */
export function financialYear(d: Date): string {
  const { year, month } = istParts(d);
  const startYear = month >= 4 ? year : year - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYY}`;
}

/**
 * IST calendar month bucket for an instant, e.g. "2026-04".
 * @param d - Instant
 */
export function istMonth(d: Date): string {
  const { year, month } = istParts(d);
  return `${year}-${String(month).padStart(2, '0')}`;
}
