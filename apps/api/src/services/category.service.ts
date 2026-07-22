import { Category } from '../models/index.js';

const GLOBAL_CATEGORIES: { name: string; direction: 'IN' | 'OUT'; systemKey?: string }[] = [
  { name: 'Partner investment', direction: 'IN', systemKey: 'CONTRIBUTION' },
  { name: 'Earning', direction: 'IN', systemKey: 'EARNING' },
  { name: 'Other deposit', direction: 'IN' },
  { name: 'Diesel', direction: 'OUT' },
  { name: 'Driver fee', direction: 'OUT' },
  { name: 'Maintenance', direction: 'OUT' },
  { name: 'EMI', direction: 'OUT', systemKey: 'EMI' },
  { name: 'Vendor payment', direction: 'OUT' },
  { name: 'Bank charges', direction: 'OUT' },
  { name: 'Other', direction: 'OUT' },
];

/**
 * Ensures global default cashbook categories exist (idempotent).
 */
export async function ensureGlobalCategories(): Promise<void> {
  const count = await Category.countDocuments({ ventureId: null });
  if (count > 0) return;

  await Category.insertMany(
    GLOBAL_CATEGORIES.map((c) => ({
      ...c,
      ventureId: null,
      isActive: true,
    }))
  );
}
