import { z } from 'zod';
import mongoose from 'mongoose';
import { Category, PartnerVenture, Venture } from '../models/index.js';
import { ensureGlobalCategories } from '../services/category.service.js';

export const EMI_PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export const createTxnSchema = z
  .object({
    type: z
      .enum([
        'CONTRIBUTION_IN',
        'EXPENSE',
        'VENDOR_PAYMENT_OUT',
        'EARNING_IN',
        'EMI_PERSONAL',
        'EMI_FROM_BANK',
      ])
      .default('CONTRIBUTION_IN'),
    amount: z.number().positive(),
    paidFrom: z.string().min(1, 'Bank/account is required'),
    paidTo: z.string().optional(),
    remark: z.string().min(1, 'Reason is required'),
    date: z.string().datetime({ message: 'Valid entry date is required' }),
    attachmentIds: z.array(z.string()).min(1, 'Proof attachment is required'),
    bankAccountId: z.string().optional(),
    categoryId: z.string().optional(),
    beneficiaryPartnerId: z.string().optional(),
    emiPeriod: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'VENDOR_PAYMENT_OUT' && !data.paidTo?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Vendor / destination is required',
        path: ['paidTo'],
      });
    }
    if (
      (data.type === 'EMI_PERSONAL' || data.type === 'EMI_FROM_BANK') &&
      (!data.emiPeriod || !EMI_PERIOD_REGEX.test(data.emiPeriod))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'EMI period must be YYYY-MM',
        path: ['emiPeriod'],
      });
    }
    if (data.type === 'EMI_FROM_BANK' && !data.beneficiaryPartnerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Beneficiary partner is required for EMI from bank',
        path: ['beneficiaryPartnerId'],
      });
    }
  });

export type CreateTxnInput = z.infer<typeof createTxnSchema>;

/**
 * Resolves an active bank account on the venture.
 * @param venture - Venture with bankAccounts
 * @param bankAccountId - Requested account id
 */
export function resolveBankAccount(
  venture: { bankAccounts?: { _id: mongoose.Types.ObjectId; label: string; isActive: boolean }[] },
  bankAccountId: string | undefined
): { bankAccountId: mongoose.Types.ObjectId; bankAccountLabel: string } | null {
  if (!bankAccountId) return null;
  const acct = (venture.bankAccounts ?? []).find((a) => String(a._id) === bankAccountId);
  if (!acct || !acct.isActive) return null;
  return { bankAccountId: acct._id, bankAccountLabel: acct.label };
}

/**
 * Loads a system category by key (ensures globals exist first).
 * @param systemKey - Category systemKey
 */
export async function findSystemCategory(systemKey: string) {
  await ensureGlobalCategories();
  return Category.findOne({ systemKey, isActive: true, ventureId: null }).lean();
}

type CategoryFields = { categoryId?: mongoose.Types.ObjectId; categoryName?: string };

/**
 * Resolves category fields for a new transaction.
 * @param ventureId - Venture id
 * @param data - Parsed create payload
 */
export async function resolveCategoryFields(
  ventureId: string,
  data: CreateTxnInput
): Promise<{ ok: true; fields: CategoryFields } | { ok: false; error: string }> {
  if (data.type === 'EARNING_IN') {
    const cat = await findSystemCategory('EARNING');
    if (!cat) return { ok: false, error: 'Earning category not configured' };
    return { ok: true, fields: { categoryId: cat._id, categoryName: cat.name } };
  }
  if (data.type === 'EMI_PERSONAL' || data.type === 'EMI_FROM_BANK') {
    const cat = await findSystemCategory('EMI');
    if (!cat) return { ok: false, error: 'EMI category not configured' };
    return { ok: true, fields: { categoryId: cat._id, categoryName: cat.name } };
  }
  if (data.type === 'CONTRIBUTION_IN' && !data.categoryId) {
    const cat = await findSystemCategory('CONTRIBUTION');
    if (cat) return { ok: true, fields: { categoryId: cat._id, categoryName: cat.name } };
    return { ok: true, fields: {} };
  }
  if (data.type === 'VENDOR_PAYMENT_OUT' && !data.categoryId) {
    return { ok: false, error: 'Category is required for bank outflows' };
  }
  if (!data.categoryId) return { ok: true, fields: {} };

  if (!mongoose.Types.ObjectId.isValid(data.categoryId)) {
    return { ok: false, error: 'Invalid category' };
  }
  const category = await Category.findOne({
    _id: data.categoryId,
    isActive: true,
    $or: [{ ventureId: null }, { ventureId }],
  }).lean();
  if (!category) return { ok: false, error: 'Category not found' };
  if (data.type === 'VENDOR_PAYMENT_OUT' && category.direction !== 'OUT') {
    return { ok: false, error: 'Outflow requires an OUT category' };
  }
  if (data.type === 'CONTRIBUTION_IN' && category.direction !== 'IN') {
    return { ok: false, error: 'Investment requires an IN category' };
  }
  return { ok: true, fields: { categoryId: category._id, categoryName: category.name } };
}

/**
 * Validates EMI beneficiary assignment is active with EMI enabled.
 * @param ventureId - Venture id
 * @param beneficiaryPartnerId - Partner whose EMI is being paid
 */
export async function assertEmiBeneficiary(
  ventureId: string,
  beneficiaryPartnerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!mongoose.Types.ObjectId.isValid(beneficiaryPartnerId)) {
    return { ok: false, error: 'Invalid beneficiary partner' };
  }
  const assignment = await PartnerVenture.findOne({
    ventureId,
    partnerId: beneficiaryPartnerId,
  }).lean();
  if (!assignment) {
    return { ok: false, error: 'Beneficiary is not assigned to this project' };
  }
  if (!assignment.isEmiActive) {
    return { ok: false, error: 'EMI is not active for this partner on this project' };
  }
  return { ok: true };
}

/**
 * Whether this txn type must touch a project bank account.
 * @param type - Transaction type
 */
export function typeNeedsBankAccount(type: CreateTxnInput['type']): boolean {
  return (
    type === 'CONTRIBUTION_IN' ||
    type === 'VENDOR_PAYMENT_OUT' ||
    type === 'EARNING_IN' ||
    type === 'EMI_FROM_BANK'
  );
}

/**
 * Ensures venture has an active bank account when required.
 * @param venture - Venture document
 * @param type - Transaction type
 * @param bankAccountId - Optional selected account
 */
export function assertBankAccountRequirement(
  venture: InstanceType<typeof Venture>,
  type: CreateTxnInput['type'],
  bankAccountId?: string
): { ok: true } | { ok: false; error: string } {
  if (!typeNeedsBankAccount(type)) return { ok: true };
  const activeAccounts = (venture.bankAccounts ?? []).filter((a) => a.isActive);
  if (activeAccounts.length === 0) {
    return { ok: false, error: 'This project has no active bank accounts' };
  }
  if (!bankAccountId) {
    return { ok: false, error: 'Project bank account is required' };
  }
  return { ok: true };
}
