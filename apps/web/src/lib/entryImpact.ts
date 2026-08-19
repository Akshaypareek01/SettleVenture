import type { TransactionType } from './transactionTypes';

export type ImpactFlag = 'up' | 'down' | 'none';

export interface EntryImpact {
  pool: ImpactFlag;
  bank: ImpactFlag;
  contributed: ImpactFlag;
  emiBoard: ImpactFlag;
  fairShare: boolean;
  summary: string;
}

/**
 * Ledger impact for each partner entry type — shown before submit.
 * @param type - Selected transaction type
 */
export function getEntryImpact(type: TransactionType): EntryImpact {
  const map: Record<TransactionType, EntryImpact> = {
    CONTRIBUTION_IN: {
      pool: 'up',
      bank: 'up',
      contributed: 'up',
      emiBoard: 'none',
      fairShare: true,
      summary: 'Money into project bank — counts toward your fair share',
    },
    EXPENSE: {
      pool: 'none',
      bank: 'none',
      contributed: 'up',
      emiBoard: 'none',
      fairShare: true,
      summary: 'Paid from your pocket — counts toward fair share, no bank movement',
    },
    VENDOR_PAYMENT_OUT: {
      pool: 'down',
      bank: 'down',
      contributed: 'none',
      emiBoard: 'none',
      fairShare: false,
      summary: 'Leaves project bank — does not change fair-share balances',
    },
    EARNING_IN: {
      pool: 'none',
      bank: 'up',
      contributed: 'none',
      emiBoard: 'none',
      fairShare: false,
      summary: 'Revenue into bank — does not count toward fair share',
    },
    EMI_PERSONAL: {
      pool: 'none',
      bank: 'none',
      contributed: 'none',
      emiBoard: 'up',
      fairShare: true,
      summary: 'You pay EMI from your pocket — counts toward EMI fair share',
    },
    EMI_FROM_BANK: {
      pool: 'down',
      bank: 'down',
      contributed: 'none',
      emiBoard: 'up',
      fairShare: false,
      summary: 'Project bank pays EMI — bank/pool down, EMI board up (not fair share)',
    },
    PARTNER_TRANSFER: {
      pool: 'none',
      bank: 'none',
      contributed: 'none',
      emiBoard: 'none',
      fairShare: true,
      summary: 'Personal settlement — clears remaining investment, expenses, and EMI',
    },
  };
  return map[type];
}

/**
 * Label for the paidFrom / source field by entry type.
 * @param type - Selected transaction type
 */
export function paidFromLabel(type: TransactionType): { label: string; placeholder: string } {
  switch (type) {
    case 'EXPENSE':
      return {
        label: 'Paid from (cash / personal UPI)',
        placeholder: 'Cash, personal UPI, own card...',
      };
    case 'CONTRIBUTION_IN':
      return {
        label: 'Your source (where money came from)',
        placeholder: 'HDFC Savings, UPI, cash...',
      };
    case 'EARNING_IN':
      return { label: 'Earning source', placeholder: 'Client, trip, cash booking...' };
    case 'VENDOR_PAYMENT_OUT':
    case 'EMI_FROM_BANK':
      return { label: 'Note / reference', placeholder: 'UTR, cheque no., memo...' };
    case 'EMI_PERSONAL':
      return {
        label: 'Paid from (cash / personal UPI)',
        placeholder: 'Cash, personal UPI...',
      };
    case 'PARTNER_TRANSFER':
      return {
        label: 'Paid from (cash / personal UPI)',
        placeholder: 'Cash, personal UPI, bank transfer...',
      };
    default:
      return { label: 'Source / reference', placeholder: '...' };
  }
}
