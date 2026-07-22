import { z } from 'zod';
import mongoose from 'mongoose';

export const bankAccountInputSchema = z.object({
  _id: z.string().optional(),
  label: z.string().min(1, 'Account label is required'),
  bankName: z.string().optional(),
  accountHint: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export type BankAccountInput = z.infer<typeof bankAccountInputSchema>;

/**
 * Maps API bank-account payloads onto Venture subdocuments.
 * @param accounts - Raw bank account inputs from the client
 */
export function mapBankAccounts(accounts: BankAccountInput[]): {
  _id?: mongoose.Types.ObjectId;
  label: string;
  bankName?: string;
  accountHint?: string;
  isActive: boolean;
  createdAt?: Date;
}[] {
  return accounts.map((a) => {
    const hasId = a._id && mongoose.Types.ObjectId.isValid(a._id);
    return {
      ...(hasId ? { _id: new mongoose.Types.ObjectId(a._id) } : {}),
      label: a.label.trim(),
      bankName: a.bankName?.trim() || undefined,
      accountHint: a.accountHint?.trim() || undefined,
      isActive: a.isActive ?? true,
      ...(!hasId ? { createdAt: new Date() } : {}),
    };
  });
}
