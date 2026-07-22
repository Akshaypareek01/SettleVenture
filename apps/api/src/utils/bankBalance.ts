import mongoose from 'mongoose';
import { Transaction } from '../models/index.js';
import { toNumber } from './decimal.js';

/**
 * Computes current cash balance for a project bank account from ledger entries.
 * In: CONTRIBUTION_IN + EARNING_IN. Out: VENDOR_PAYMENT_OUT + EMI_FROM_BANK.
 * @param ventureId - Venture id
 * @param bankAccountId - Bank account subdocument id
 */
export async function getBankAccountBalance(
  ventureId: string,
  bankAccountId: string
): Promise<number> {
  const txns = await Transaction.find({
    ventureId,
    bankAccountId,
    isDeleted: false,
    type: { $in: ['CONTRIBUTION_IN', 'EARNING_IN', 'VENDOR_PAYMENT_OUT', 'EMI_FROM_BANK'] },
  })
    .select('type amount')
    .lean();

  let balance = 0;
  for (const txn of txns) {
    const amt = toNumber(txn.amount as mongoose.Types.Decimal128);
    if (txn.type === 'CONTRIBUTION_IN' || txn.type === 'EARNING_IN') {
      balance += amt;
    } else {
      balance -= amt;
    }
  }
  return Math.round(balance * 100) / 100;
}

/**
 * Rejects outflows that would overdraw a bank account.
 * @param ventureId - Venture id
 * @param bankAccountId - Account to debit
 * @param amount - Outflow amount
 * @param type - Transaction type
 */
export async function assertSufficientBankBalance(
  ventureId: string,
  bankAccountId: string,
  amount: number,
  type: string
): Promise<{ ok: true } | { ok: false; error: string; balance: number }> {
  if (type !== 'VENDOR_PAYMENT_OUT' && type !== 'EMI_FROM_BANK') {
    return { ok: true };
  }
  const balance = await getBankAccountBalance(ventureId, bankAccountId);
  if (amount > balance + 0.001) {
    return {
      ok: false,
      balance,
      error: `Insufficient bank balance. Available: ₹${balance.toLocaleString('en-IN')}, requested: ₹${amount.toLocaleString('en-IN')}`,
    };
  }
  return { ok: true };
}
