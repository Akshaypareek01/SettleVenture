import { Types } from 'mongoose';
import { PartnerVenture, Transaction, Partner } from '../models/index.js';
import { toNumber } from '../utils/decimal.js';
import { istMonth } from '../utils/dateIst.js';

export interface PartnerEmiSummary {
  partnerId: string;
  name: string;
  isEmiActive: boolean;
  loanAmount: number;
  monthlyEmi: number;
  emiStartDate: string | null;
  tenureMonths: number | null;
  paidAmount: number;
  remaining: number;
  monthsDue: number;
  monthsWithPayment: number;
  overduePeriods: string[];
  personalPaid: number;
  bankPaid: number;
}

export interface VentureEmiSummary {
  partners: PartnerEmiSummary[];
  totalLoan: number;
  totalPaid: number;
  totalRemaining: number;
  totalPersonalPaid: number;
  totalBankPaid: number;
}

/**
 * Formats a Date as YYYY-MM in IST (matches EMI period entry + GST months).
 * @param d - Date
 */
export function toEmiPeriod(d: Date): string {
  return istMonth(d);
}

/**
 * Lists the YYYY-MM periods due from start (inclusive), capped so they never
 * run past the loan tenure or the current IST month — whichever comes first.
 * A finished loan therefore stops accruing "due" months.
 * @param start - EMI start date
 * @param tenureMonths - Total scheduled installments (null = uncapped by tenure)
 * @param now - Reference "now"
 */
export function listEmiPeriodsDue(
  start: Date,
  tenureMonths: number | null,
  now = new Date()
): string[] {
  const periods: string[] = [];
  const startPeriod = istMonth(start);
  const [sy, sm] = startPeriod.split('-').map(Number);
  const [ey, em] = istMonth(now).split('-').map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    if (tenureMonths && periods.length >= tenureMonths) break;
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return periods;
}

/**
 * Computes per-partner EMI board for a venture.
 * Remaining = loanAmount − sum(EMI payments for beneficiary).
 * @param ventureId - Venture ObjectId string
 */
export async function computeVentureEmiSummary(ventureId: string): Promise<VentureEmiSummary> {
  const assignments = await PartnerVenture.find({ ventureId }).populate('partnerId', 'name').lean();
  const emiTxns = await Transaction.find({
    ventureId,
    isDeleted: false,
    type: { $in: ['EMI_PERSONAL', 'EMI_FROM_BANK'] },
  }).lean();

  const paidByBeneficiary = new Map<
    string,
    { total: number; personal: number; bank: number; periods: Set<string> }
  >();

  for (const t of emiTxns) {
    const bid = String(t.beneficiaryPartnerId ?? t.partnerId);
    const amt = toNumber(t.amount);
    const bucket = paidByBeneficiary.get(bid) ?? {
      total: 0,
      personal: 0,
      bank: 0,
      periods: new Set<string>(),
    };
    bucket.total += amt;
    if (t.type === 'EMI_PERSONAL') bucket.personal += amt;
    else bucket.bank += amt;
    if (t.emiPeriod) bucket.periods.add(t.emiPeriod);
    paidByBeneficiary.set(bid, bucket);
  }

  const partners: PartnerEmiSummary[] = [];
  let totalLoan = 0;
  let totalPaid = 0;
  let totalRemaining = 0;
  let totalPersonalPaid = 0;
  let totalBankPaid = 0;

  for (const a of assignments) {
    const p = a.partnerId as unknown as { _id: Types.ObjectId; name: string } | null;
    if (!p?._id) continue;
    const partnerId = String(p._id);
    const loanAmount = toNumber(a.loanAmount);
    const monthlyEmi = toNumber(a.monthlyEmi);
    const paid = paidByBeneficiary.get(partnerId) ?? {
      total: 0,
      personal: 0,
      bank: 0,
      periods: new Set<string>(),
    };
    const remaining = Math.max(0, Math.round((loanAmount - paid.total) * 100) / 100);

    let overduePeriods: string[] = [];
    let monthsDue = 0;
    if (a.isEmiActive && a.emiStartDate) {
      const duePeriods = listEmiPeriodsDue(new Date(a.emiStartDate), a.tenureMonths ?? null);
      monthsDue = duePeriods.length;
      overduePeriods = duePeriods.filter((period) => !paid.periods.has(period));
    }

    partners.push({
      partnerId,
      name: p.name,
      isEmiActive: !!a.isEmiActive,
      loanAmount,
      monthlyEmi,
      emiStartDate: a.emiStartDate ? new Date(a.emiStartDate).toISOString() : null,
      tenureMonths: a.tenureMonths ?? null,
      paidAmount: Math.round(paid.total * 100) / 100,
      remaining,
      monthsDue,
      monthsWithPayment: paid.periods.size,
      overduePeriods,
      personalPaid: Math.round(paid.personal * 100) / 100,
      bankPaid: Math.round(paid.bank * 100) / 100,
    });

    totalLoan += loanAmount;
    totalPaid += paid.total;
    totalRemaining += remaining;
    totalPersonalPaid += paid.personal;
    totalBankPaid += paid.bank;
  }

  // Include EMI payments for partners no longer assigned
  for (const [partnerId, paid] of paidByBeneficiary) {
    if (partners.some((p) => p.partnerId === partnerId)) continue;
    const partner = await Partner.findById(partnerId).select('name').lean();
    partners.push({
      partnerId,
      name: partner?.name ?? 'Unknown',
      isEmiActive: false,
      loanAmount: 0,
      monthlyEmi: 0,
      emiStartDate: null,
      tenureMonths: null,
      paidAmount: Math.round(paid.total * 100) / 100,
      remaining: 0,
      monthsDue: 0,
      monthsWithPayment: paid.periods.size,
      overduePeriods: [],
      personalPaid: Math.round(paid.personal * 100) / 100,
      bankPaid: Math.round(paid.bank * 100) / 100,
    });
    totalPaid += paid.total;
    totalPersonalPaid += paid.personal;
    totalBankPaid += paid.bank;
  }

  return {
    partners,
    totalLoan: Math.round(totalLoan * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalRemaining: Math.round(totalRemaining * 100) / 100,
    totalPersonalPaid: Math.round(totalPersonalPaid * 100) / 100,
    totalBankPaid: Math.round(totalBankPaid * 100) / 100,
  };
}
