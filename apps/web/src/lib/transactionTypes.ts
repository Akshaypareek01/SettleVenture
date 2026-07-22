export type TransactionType =
  | 'CONTRIBUTION_IN'
  | 'EXPENSE'
  | 'VENDOR_PAYMENT_OUT'
  | 'EARNING_IN'
  | 'EMI_PERSONAL'
  | 'EMI_FROM_BANK';

export interface EntryTypeOption {
  value: TransactionType;
  label: string;
  description: string;
  adminOnly?: boolean;
}

/** Entry types available on the add-entry form (partners + admin). */
export const PARTNER_ENTRY_TYPES: EntryTypeOption[] = [
  {
    value: 'CONTRIBUTION_IN',
    label: 'Partner Investment',
    description: 'Money you put into a project bank account',
  },
  {
    value: 'EXPENSE',
    label: 'Direct Expense',
    description: 'Paid directly from your pocket — not from a project bank account',
  },
  {
    value: 'VENDOR_PAYMENT_OUT',
    label: 'Bank outflow',
    description: 'Money leaving a project bank account (diesel, vendor, fees, etc.)',
  },
  {
    value: 'EARNING_IN',
    label: 'Earning',
    description: 'Revenue deposited into a project bank account',
  },
  {
    value: 'EMI_PERSONAL',
    label: 'EMI (personal)',
    description: 'You pay this month’s EMI from your own money',
  },
  {
    value: 'EMI_FROM_BANK',
    label: 'EMI from bank',
    description: 'Project bank account pays EMI on behalf of a partner',
  },
];

/** Reserved for future admin-only types. */
export const ADMIN_ENTRY_TYPES: EntryTypeOption[] = [];

/**
 * Returns a display label for a transaction type code.
 * @param type - Transaction type enum value
 */
export function transactionTypeLabel(type?: string): string {
  const labels: Record<string, string> = {
    CONTRIBUTION_IN: 'Partner Investment',
    EXPENSE: 'Direct Expense',
    VENDOR_PAYMENT_OUT: 'Bank outflow',
    EARNING_IN: 'Earning',
    EMI_PERSONAL: 'EMI (personal)',
    EMI_FROM_BANK: 'EMI from bank',
  };
  return labels[type ?? ''] ?? 'Entry';
}

/**
 * Tailwind badge classes for transaction type chips.
 * @param type - Transaction type enum value
 */
export function transactionTypeBadgeClass(type?: string): string {
  const classes: Record<string, string> = {
    CONTRIBUTION_IN: 'bg-accent/15 text-accent border-accent/30',
    EXPENSE: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    VENDOR_PAYMENT_OUT: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    EARNING_IN: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    EMI_PERSONAL: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    EMI_FROM_BANK: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  };
  return classes[type ?? ''] ?? 'bg-elevated text-muted border-border';
}
