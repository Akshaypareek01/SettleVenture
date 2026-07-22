import mongoose from 'mongoose';
import {
  CompanyProfile,
  Invoice,
  Transaction,
  Attachment,
  Venture,
  type ICompanySnapshot,
  type IInvoice,
} from '../models/index.js';
import { toDecimalString, toNumber } from '../utils/decimal.js';
import { findSystemCategory, resolveBankAccount } from '../utils/txnCreate.js';

/** Basic Indian GSTIN format: 15 chars, state code + PAN + entity + Z + check. */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Returns true when a GSTIN string looks valid.
 * @param gstin - Company GSTIN
 */
export function isValidGstin(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

export interface LineItemInput {
  description: string;
  qty: number;
  rate: number;
}

export interface InvoiceMoneyBreakdown {
  taxableAmount: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

/**
 * Returns the singleton company profile, creating a default if missing.
 */
export async function getOrCreateCompanyProfile() {
  const existing = await CompanyProfile.findOne().lean();
  if (existing) return existing;
  const created = await CompanyProfile.create({
    firmName: 'ApexLedger Firm',
    invoicePrefix: 'AL-',
    nextInvoiceNumber: 1,
  });
  return created.toObject();
}

/**
 * Ensures company profile has firm name + valid GSTIN before issuing invoices.
 */
export async function assertCompanyReadyToIssue(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const profile = await getOrCreateCompanyProfile();
  if (!profile.firmName?.trim()) {
    return { ok: false, error: 'Company firm name is required before issuing invoices' };
  }
  if (!profile.gstin?.trim()) {
    return {
      ok: false,
      error: 'Set company GSTIN in Admin → Company before issuing invoices',
    };
  }
  if (!isValidGstin(profile.gstin)) {
    return { ok: false, error: 'Company GSTIN format is invalid — fix it in Admin → Company' };
  }
  return { ok: true };
}

/**
 * Builds a denormalized company snapshot for issued invoices.
 * @param profile - Company profile document/lean
 */
export function buildCompanySnapshot(profile: {
  firmName: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  pan?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccountHint?: string;
  ifsc?: string;
}): ICompanySnapshot {
  return {
    firmName: profile.firmName,
    address: profile.address,
    city: profile.city,
    state: profile.state,
    pincode: profile.pincode,
    gstin: profile.gstin,
    pan: profile.pan,
    phone: profile.phone,
    email: profile.email,
    bankName: profile.bankName,
    bankAccountHint: profile.bankAccountHint,
    ifsc: profile.ifsc,
  };
}

/**
 * Computes taxable, GST split, and total from line items.
 * @param lineItems - Invoice lines
 * @param gstRate - GST percent (e.g. 18)
 * @param isInterState - If true, all GST goes to IGST
 */
export function computeInvoiceMoney(
  lineItems: LineItemInput[],
  gstRate: number,
  isInterState: boolean
): InvoiceMoneyBreakdown & {
  lineItems: { description: string; qty: number; rate: number; amount: number }[];
} {
  const lines = lineItems.map((li) => {
    const amount = Math.round(li.qty * li.rate * 100) / 100;
    return {
      description: li.description.trim(),
      qty: li.qty,
      rate: li.rate,
      amount,
    };
  });
  const taxableAmount = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
  const gstAmount = Math.round(taxableAmount * (gstRate / 100) * 100) / 100;
  const half = Math.round((gstAmount / 2) * 100) / 100;
  const cgst = isInterState ? 0 : half;
  const sgst = isInterState ? 0 : Math.round((gstAmount - half) * 100) / 100;
  const igst = isInterState ? gstAmount : 0;
  const totalAmount = Math.round((taxableAmount + gstAmount) * 100) / 100;
  return { lineItems: lines, taxableAmount, gstAmount, cgst, sgst, igst, totalAmount };
}

/**
 * Atomically allocates the next invoice number (PREFIX + padded seq).
 */
export async function allocateInvoiceNumber(): Promise<{
  number: string;
  snapshot: ICompanySnapshot;
}> {
  await getOrCreateCompanyProfile();
  const current = await CompanyProfile.findOneAndUpdate(
    {},
    { $inc: { nextInvoiceNumber: 1 } },
    { new: false }
  );
  if (!current) {
    throw new Error('Company profile not configured');
  }
  const seq = current.nextInvoiceNumber ?? 1;
  const prefix = current.invoicePrefix || 'AL-';
  const number = `${prefix}${String(seq).padStart(4, '0')}`;
  return { number, snapshot: buildCompanySnapshot(current) };
}

/**
 * Serializes an invoice lean doc with numeric money fields.
 * @param inv - Lean invoice
 */
export function serializeInvoice(inv: Record<string, unknown>) {
  const lineItems = Array.isArray(inv.lineItems)
    ? (inv.lineItems as Record<string, unknown>[]).map((li) => ({
        description: li.description,
        qty: li.qty,
        rate: toNumber(li.rate),
        amount: toNumber(li.amount),
      }))
    : [];
  return {
    ...inv,
    taxableAmount: toNumber(inv.taxableAmount),
    gstAmount: toNumber(inv.gstAmount),
    cgst: toNumber(inv.cgst),
    sgst: toNumber(inv.sgst),
    igst: toNumber(inv.igst),
    totalAmount: toNumber(inv.totalAmount),
    lineItems,
    linkedEarningTransactionId: inv.linkedEarningTransactionId
      ? String(inv.linkedEarningTransactionId)
      : undefined,
    linkedBankAccountId: inv.linkedBankAccountId
      ? String(inv.linkedBankAccountId)
      : undefined,
  };
}

/**
 * Marks an issued invoice as paid and creates a linked EARNING_IN transaction.
 */
export async function markInvoicePaid(params: {
  invoice: IInvoice;
  ventureId: string;
  partnerId: mongoose.Types.ObjectId;
  bankAccountId: string;
  paidFrom: string;
  remark: string;
  date: Date;
  attachmentIds: string[];
}): Promise<{ invoice: IInvoice; transactionId: string }> {
  const { invoice, ventureId, partnerId, bankAccountId, paidFrom, remark, date, attachmentIds } =
    params;

  if (invoice.status !== 'issued') {
    throw new Error('Only issued invoices can be marked paid');
  }
  if (!attachmentIds.length) {
    throw new Error('Proof attachment is required');
  }

  const venture = await Venture.findById(ventureId);
  if (!venture || venture.status === 'closed') {
    throw new Error('Project is closed or not found');
  }

  const bank = resolveBankAccount(venture, bankAccountId);
  if (!bank) {
    throw new Error('Invalid or inactive project bank account');
  }

  const earningCat = await findSystemCategory('EARNING');
  const amount = toNumber(invoice.totalAmount);

  const txn = await Transaction.create({
    ventureId,
    type: 'EARNING_IN',
    partnerId,
    amount: mongoose.Types.Decimal128.fromString(toDecimalString(amount)),
    date,
    paidFrom: paidFrom.trim(),
    remark: remark.trim() || `Invoice ${invoice.number} payment`,
    bankAccountId: bank.bankAccountId,
    bankAccountLabel: bank.bankAccountLabel,
    categoryId: earningCat?._id,
    categoryName: earningCat?.name,
    createdById: partnerId,
  });

  await Attachment.updateMany(
    { _id: { $in: attachmentIds }, ventureId },
    { transactionId: txn._id }
  );

  invoice.status = 'paid';
  invoice.linkedEarningTransactionId = txn._id;
  invoice.linkedBankAccountId = bank.bankAccountId;
  invoice.linkedBankAccountLabel = bank.bankAccountLabel;
  await invoice.save();

  return { invoice, transactionId: String(txn._id) };
}

export interface GstMonthRow {
  period: string;
  invoiceCount: number;
  taxableAmount: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

/**
 * Aggregates GST from issued + paid invoices in an optional date range.
 * @param ventureId - Venture id
 * @param from - Optional start ISO/date
 * @param to - Optional end ISO/date
 */
export async function computeGstSummary(
  ventureId: string,
  from?: string,
  to?: string
): Promise<{
  from: string | null;
  to: string | null;
  byMonth: GstMonthRow[];
  totals: Omit<GstMonthRow, 'period'>;
}> {
  const filter: Record<string, unknown> = {
    ventureId,
    status: { $in: ['issued', 'paid'] },
  };

  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) {
    const end = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      end.setUTCHours(23, 59, 59, 999);
    }
    dateFilter.$lte = end;
  }
  if (Object.keys(dateFilter).length) {
    filter.issueDate = dateFilter;
  }

  const invoices = await Invoice.find(filter).lean();
  const monthMap = new Map<string, GstMonthRow>();

  for (const inv of invoices) {
    const d = inv.issueDate ? new Date(inv.issueDate) : new Date(inv.createdAt);
    const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const row = monthMap.get(period) ?? {
      period,
      invoiceCount: 0,
      taxableAmount: 0,
      gstAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalAmount: 0,
    };
    row.invoiceCount += 1;
    row.taxableAmount += toNumber(inv.taxableAmount);
    row.gstAmount += toNumber(inv.gstAmount);
    row.cgst += toNumber(inv.cgst);
    row.sgst += toNumber(inv.sgst);
    row.igst += toNumber(inv.igst);
    row.totalAmount += toNumber(inv.totalAmount);
    monthMap.set(period, row);
  }

  const byMonth = Array.from(monthMap.values())
    .map((r) => ({
      ...r,
      taxableAmount: Math.round(r.taxableAmount * 100) / 100,
      gstAmount: Math.round(r.gstAmount * 100) / 100,
      cgst: Math.round(r.cgst * 100) / 100,
      sgst: Math.round(r.sgst * 100) / 100,
      igst: Math.round(r.igst * 100) / 100,
      totalAmount: Math.round(r.totalAmount * 100) / 100,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  const totals = byMonth.reduce(
    (acc, r) => ({
      invoiceCount: acc.invoiceCount + r.invoiceCount,
      taxableAmount: acc.taxableAmount + r.taxableAmount,
      gstAmount: acc.gstAmount + r.gstAmount,
      cgst: acc.cgst + r.cgst,
      sgst: acc.sgst + r.sgst,
      igst: acc.igst + r.igst,
      totalAmount: acc.totalAmount + r.totalAmount,
    }),
    {
      invoiceCount: 0,
      taxableAmount: 0,
      gstAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalAmount: 0,
    }
  );

  return {
    from: from ?? null,
    to: to ?? null,
    byMonth,
    totals: {
      invoiceCount: totals.invoiceCount,
      taxableAmount: Math.round(totals.taxableAmount * 100) / 100,
      gstAmount: Math.round(totals.gstAmount * 100) / 100,
      cgst: Math.round(totals.cgst * 100) / 100,
      sgst: Math.round(totals.sgst * 100) / 100,
      igst: Math.round(totals.igst * 100) / 100,
      totalAmount: Math.round(totals.totalAmount * 100) / 100,
    },
  };
}
