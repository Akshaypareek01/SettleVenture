import mongoose, { type ClientSession } from 'mongoose';
import { Transaction } from '../models/index.js';

const IN_TYPES = ['CONTRIBUTION_IN', 'EARNING_IN'];
const OUT_TYPES = ['VENDOR_PAYMENT_OUT', 'EMI_FROM_BANK'];

/**
 * Computes current cash balance for a project bank account from ledger entries.
 * In: CONTRIBUTION_IN + EARNING_IN. Out: VENDOR_PAYMENT_OUT + EMI_FROM_BANK.
 * Sums on Decimal128 inside MongoDB — no float accumulation, no full-ledger load.
 * @param ventureId - Venture id
 * @param bankAccountId - Bank account subdocument id
 * @param session - Optional session so the read joins an open transaction
 */
export async function getBankAccountBalance(
  ventureId: string,
  bankAccountId: string,
  session?: ClientSession
): Promise<number> {
  const [row] = await Transaction.aggregate<{ balance?: mongoose.Types.Decimal128 }>(
    [
      {
        $match: {
          ventureId: new mongoose.Types.ObjectId(ventureId),
          bankAccountId: new mongoose.Types.ObjectId(bankAccountId),
          isDeleted: false,
          type: { $in: [...IN_TYPES, ...OUT_TYPES] },
        },
      },
      {
        $group: {
          _id: null,
          balance: {
            $sum: {
              $cond: [{ $in: ['$type', IN_TYPES] }, '$amount', { $multiply: ['$amount', -1] }],
            },
          },
        },
      },
    ],
    session ? { session } : undefined
  );
  const balance = row?.balance ? parseFloat(row.balance.toString()) : 0;
  return Math.round(balance * 100) / 100;
}

/**
 * Rejects outflows that would overdraw a bank account.
 * @param ventureId - Venture id
 * @param bankAccountId - Account to debit
 * @param amount - Outflow amount
 * @param type - Transaction type
 * @param session - Optional session so the check reads inside a transaction
 */
export async function assertSufficientBankBalance(
  ventureId: string,
  bankAccountId: string,
  amount: number,
  type: string,
  session?: ClientSession
): Promise<{ ok: true } | { ok: false; error: string; balance: number }> {
  if (type !== 'VENDOR_PAYMENT_OUT' && type !== 'EMI_FROM_BANK') {
    return { ok: true };
  }
  const balance = await getBankAccountBalance(ventureId, bankAccountId, session);
  if (amount > balance + 0.001) {
    return {
      ok: false,
      balance,
      error: `Insufficient bank balance. Available: ₹${balance.toLocaleString('en-IN')}, requested: ₹${amount.toLocaleString('en-IN')}`,
    };
  }
  return { ok: true };
}
