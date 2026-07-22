import { Transaction, Partner, Venture, Attachment, PartnerVenture } from '../models/index.js';
import { toNumber } from '../utils/decimal.js';
import { getDownloadUrl } from './r2.service.js';
import { computeVentureSummary } from './settlement.service.js';

export interface PartnerEntryRow {
  _id: string;
  type: string;
  amount: number;
  date: string;
  paidFrom?: string;
  paidTo?: string;
  remark?: string;
  attachments: { id: string; fileName: string; fileType: string; downloadUrl: string }[];
}

export interface PartnerTypeBreakdown {
  type: string;
  count: number;
  total: number;
}

export interface PartnerVentureAnalytics {
  venture: { id: string; name: string };
  partner: { id: string; name: string; email: string };
  totals: {
    depositedToPool: number;
    directExpenses: number;
    totalContributed: number;
    pctOfTotal: number;
    entryCount: number;
    investmentCount: number;
    expenseCount: number;
    poolPaymentCount: number;
    earningsTotal: number;
    earningsCount: number;
    emiPaidTotal: number;
    emiCount: number;
  };
  settlement: {
    fairShare: number;
    netBalance: number;
    status: string;
  } | null;
  byType: PartnerTypeBreakdown[];
  entries: PartnerEntryRow[];
}

/**
 * Builds per-partner analytics for a venture: totals, type split, settlement, entry log.
 * @param ventureId - Venture ObjectId string
 * @param partnerId - Partner ObjectId string
 */
export async function computePartnerVentureAnalytics(
  ventureId: string,
  partnerId: string
): Promise<PartnerVentureAnalytics | null> {
  const [venture, partner, summary] = await Promise.all([
    Venture.findById(ventureId).lean(),
    Partner.findById(partnerId).select('name email').lean(),
    computeVentureSummary(ventureId),
  ]);

  if (!venture || !partner) return null;

  const assigned = await PartnerVenture.findOne({ ventureId, partnerId }).lean();
  const partnerSummary = summary.byPartner.find((p) => p.partnerId === partnerId);
  if (!assigned && !partnerSummary) return null;

  const txns = await Transaction.find({
    ventureId,
    partnerId,
    isDeleted: false,
  })
    .sort({ date: -1 })
    .lean();

  const txnIds = txns.map((t) => t._id);
  const attachments = await Attachment.find({ transactionId: { $in: txnIds } }).lean();
  const attachMap = new Map<string, typeof attachments>();
  for (const a of attachments) {
    const key = String(a.transactionId);
    if (!attachMap.has(key)) attachMap.set(key, []);
    attachMap.get(key)!.push(a);
  }

  const typeMap = new Map<string, { count: number; total: number }>();
  let investmentCount = 0;
  let expenseCount = 0;
  let poolPaymentCount = 0;
  let earningsTotal = 0;
  let earningsCount = 0;
  let emiPaidTotal = 0;
  let emiCount = 0;

  const entries: PartnerEntryRow[] = await Promise.all(
    txns.map(async (t) => {
      const amount = toNumber(t.amount);
      const type = t.type;
      const bucket = typeMap.get(type) ?? { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += amount;
      typeMap.set(type, bucket);

      if (type === 'CONTRIBUTION_IN') investmentCount += 1;
      else if (type === 'EXPENSE') expenseCount += 1;
      else if (type === 'VENDOR_PAYMENT_OUT') poolPaymentCount += 1;
      else if (type === 'EARNING_IN') {
        earningsCount += 1;
        earningsTotal += amount;
      } else if (type === 'EMI_PERSONAL' || type === 'EMI_FROM_BANK') {
        emiCount += 1;
        emiPaidTotal += amount;
      }

      const files = attachMap.get(String(t._id)) ?? [];
      return {
        _id: String(t._id),
        type,
        amount,
        date: t.date.toISOString(),
        paidFrom: t.paidFrom,
        paidTo: t.paidTo,
        remark: t.remark,
        attachments: await Promise.all(
          files.map(async (a) => ({
            id: String(a._id),
            fileName: a.fileName,
            fileType: a.fileType,
            downloadUrl: await getDownloadUrl(a.r2Key, a.publicUrl),
          }))
        ),
      };
    })
  );

  // Also count EMI where this partner is beneficiary but logged by someone else
  const beneficiaryEmi = await Transaction.find({
    ventureId,
    beneficiaryPartnerId: partnerId,
    type: 'EMI_FROM_BANK',
    isDeleted: false,
    partnerId: { $ne: partnerId },
  }).lean();
  for (const t of beneficiaryEmi) {
    emiCount += 1;
    emiPaidTotal += toNumber(t.amount);
  }

  const settlementRow = summary.settlement.find((s) => s.partnerId === partnerId) ?? null;

  return {
    venture: { id: String(venture._id), name: venture.name },
    partner: { id: String(partner._id), name: partner.name, email: partner.email },
    totals: {
      depositedToPool: partnerSummary?.depositedToPool ?? 0,
      directExpenses: partnerSummary?.directExpenses ?? 0,
      totalContributed: partnerSummary?.totalContributed ?? 0,
      pctOfTotal: partnerSummary?.pctOfTotal ?? 0,
      entryCount: entries.length,
      investmentCount,
      expenseCount,
      poolPaymentCount,
      earningsTotal: Math.round(earningsTotal * 100) / 100,
      earningsCount,
      emiPaidTotal: Math.round(emiPaidTotal * 100) / 100,
      emiCount,
    },
    settlement: settlementRow
      ? {
          fairShare: settlementRow.fairShare,
          netBalance: settlementRow.netBalance,
          status: settlementRow.status,
        }
      : null,
    byType: Array.from(typeMap.entries()).map(([type, data]) => ({
      type,
      count: data.count,
      total: data.total,
    })),
    entries,
  };
}

/**
 * Escapes a CSV cell value.
 * @param value - Raw cell content
 */
function csvCell(value: string | number | undefined): string {
  const raw = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

/**
 * Builds a CSV report string for partner venture analytics.
 * @param data - Partner analytics payload
 */
export function buildPartnerAnalyticsCsv(data: PartnerVentureAnalytics): string {
  const lines: string[] = [];
  lines.push('Partner Report');
  lines.push(`Project,${csvCell(data.venture.name)}`);
  lines.push(`Partner,${csvCell(data.partner.name)}`);
  lines.push(`Email,${csvCell(data.partner.email)}`);
  lines.push('');
  lines.push('Summary');
  lines.push(`Partner Investment,${data.totals.depositedToPool}`);
  lines.push(`Direct Expenses,${data.totals.directExpenses}`);
  lines.push(`Total Contributed,${data.totals.totalContributed}`);
  lines.push(`Share %,${(data.totals.pctOfTotal * 100).toFixed(2)}`);
  lines.push(`Entry Count,${data.totals.entryCount}`);
  if (data.settlement) {
    lines.push(`Fair Share,${data.settlement.fairShare}`);
    lines.push(`Net Balance,${data.settlement.netBalance}`);
    lines.push(`Settlement Status,${csvCell(data.settlement.status)}`);
  }
  lines.push('');
  lines.push('Date,Type,Amount,From,To,Remark');
  for (const e of data.entries) {
    lines.push(
      [
        csvCell(e.date.slice(0, 10)),
        csvCell(e.type),
        e.amount,
        csvCell(e.paidFrom),
        csvCell(e.paidTo),
        csvCell(e.remark),
      ].join(',')
    );
  }
  return lines.join('\n');
}
