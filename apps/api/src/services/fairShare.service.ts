import { Types } from 'mongoose';
import { Transaction, PartnerVenture } from '../models/index.js';
import type { TransferBucket } from '../models/Transaction.model.js';
import { toNumber } from '../utils/decimal.js';
import {
  roundMoney,
  type TransferAllocations,
} from './fairShareAlloc.js';

export type FairShareStatus = 'owed_by_group' | 'owes_group' | 'settled';

export interface FairSharePartnerRow {
  partnerId: string;
  name: string;
  raw: number;
  paidOut: number;
  received: number;
  effective: number;
  fairShare: number;
  net: number;
  status: FairShareStatus;
}

export interface SuggestedPayment {
  fromPartnerId: string;
  fromName: string;
  toPartnerId: string;
  toName: string;
  amount: number;
}

export interface FairShareTransferRow {
  id: string;
  amount: number;
  date: string;
  remark?: string;
  paidFrom?: string;
  fromPartnerId: string;
  fromName: string;
  toPartnerId: string;
  toName: string;
  transferBucket: TransferBucket;
  allocations?: TransferAllocations;
}

export interface FairShareBucket {
  total: number;
  fairShare: number;
  partnerCount: number;
  byPartner: FairSharePartnerRow[];
  suggestedPayments: SuggestedPayment[];
  transfers: FairShareTransferRow[];
}

export interface CombinedFairShare {
  byPartner: { partnerId: string; name: string; net: number; status: FairShareStatus }[];
  suggestedPayments: SuggestedPayment[];
  totalRemaining: number;
}

export interface VentureFairShare {
  investment: FairShareBucket;
  expenses: FairShareBucket;
  emi: FairShareBucket;
  combined: CombinedFairShare;
}

type BucketAgg = {
  _id: { partnerId: Types.ObjectId; bucket: TransferBucket };
  total: Types.Decimal128;
};

type CombinedAllocAgg = {
  _id: Types.ObjectId;
  investment: Types.Decimal128;
  expenses: Types.Decimal128;
  emi: Types.Decimal128;
};

/**
 * Builds status from net balance vs fair share.
 * @param net - effective - fairShare
 */
function statusFromNet(net: number): FairShareStatus {
  if (net > 0.01) return 'owed_by_group';
  if (net < -0.01) return 'owes_group';
  return 'settled';
}

/**
 * Greedy debtor→creditor matching for suggested settlement payments.
 * @param rows - Partner net rows (positive = owed by group)
 */
export function suggestPairwisePayments(
  rows: { partnerId: string; name: string; net: number }[]
): SuggestedPayment[] {
  const debtors = rows
    .filter((r) => r.net < -0.01)
    .map((r) => ({ ...r, remaining: roundMoney(-r.net) }))
    .sort((a, b) => b.remaining - a.remaining);
  const creditors = rows
    .filter((r) => r.net > 0.01)
    .map((r) => ({ ...r, remaining: roundMoney(r.net) }))
    .sort((a, b) => b.remaining - a.remaining);

  const payments: SuggestedPayment[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = roundMoney(Math.min(debtors[i].remaining, creditors[j].remaining));
    if (amount <= 0.01) break;
    payments.push({
      fromPartnerId: debtors[i].partnerId,
      fromName: debtors[i].name,
      toPartnerId: creditors[j].partnerId,
      toName: creditors[j].name,
      amount,
    });
    debtors[i].remaining = roundMoney(debtors[i].remaining - amount);
    creditors[j].remaining = roundMoney(creditors[j].remaining - amount);
    if (debtors[i].remaining <= 0.01) i += 1;
    if (creditors[j].remaining <= 0.01) j += 1;
  }
  return payments;
}

/**
 * Builds one fair-share bucket for assigned partners.
 * @param params - Raw totals, transfer adjustments, and transfer history
 */
function buildBucket(params: {
  partnerCount: number;
  partners: { partnerId: string; name: string }[];
  rawByPartner: Map<string, number>;
  paidOutByPartner: Map<string, number>;
  receivedByPartner: Map<string, number>;
  transfers: FairShareTransferRow[];
}): FairShareBucket {
  const { partners, partnerCount, rawByPartner, paidOutByPartner, receivedByPartner, transfers } =
    params;

  let total = 0;
  for (const p of partners) {
    total += rawByPartner.get(p.partnerId) ?? 0;
  }
  total = roundMoney(total);
  const fairShare = partnerCount > 0 ? roundMoney(total / partnerCount) : 0;

  const byPartner: FairSharePartnerRow[] = partners.map((p) => {
    const raw = roundMoney(rawByPartner.get(p.partnerId) ?? 0);
    const paidOut = roundMoney(paidOutByPartner.get(p.partnerId) ?? 0);
    const received = roundMoney(receivedByPartner.get(p.partnerId) ?? 0);
    const effective = roundMoney(raw + paidOut - received);
    const net = roundMoney(effective - fairShare);
    return {
      partnerId: p.partnerId,
      name: p.name,
      raw,
      paidOut,
      received,
      effective,
      fairShare,
      net,
      status: statusFromNet(net),
    };
  });

  byPartner.sort((a, b) => a.name.localeCompare(b.name));

  return {
    total,
    fairShare,
    partnerCount,
    byPartner,
    suggestedPayments: suggestPairwisePayments(byPartner),
    transfers,
  };
}

/**
 * Applies single-bucket transfer aggregation rows into the three maps.
 * @param rows - Grouped transfer totals
 * @param invMap - Investment map to mutate
 * @param expMap - Expense map to mutate
 * @param emiMap - EMI map to mutate
 */
function applyLegacyTransferAgg(
  rows: BucketAgg[],
  invMap: Map<string, number>,
  expMap: Map<string, number>,
  emiMap: Map<string, number>
): void {
  for (const row of rows) {
    if (!row._id?.partnerId) continue;
    const id = String(row._id.partnerId);
    const amount = toNumber(row.total);
    if (row._id.bucket === 'INVESTMENT') {
      invMap.set(id, (invMap.get(id) ?? 0) + amount);
    } else if (row._id.bucket === 'EXPENSE') {
      expMap.set(id, (expMap.get(id) ?? 0) + amount);
    } else if (row._id.bucket === 'EMI') {
      emiMap.set(id, (emiMap.get(id) ?? 0) + amount);
    }
  }
}

/**
 * Applies COMBINED transfer allocation totals into the three maps.
 * @param rows - Grouped combined allocation totals
 * @param invMap - Investment map to mutate
 * @param expMap - Expense map to mutate
 * @param emiMap - EMI map to mutate
 */
function applyCombinedAllocAgg(
  rows: CombinedAllocAgg[],
  invMap: Map<string, number>,
  expMap: Map<string, number>,
  emiMap: Map<string, number>
): void {
  for (const row of rows) {
    if (!row._id) continue;
    const id = String(row._id);
    invMap.set(id, (invMap.get(id) ?? 0) + toNumber(row.investment));
    expMap.set(id, (expMap.get(id) ?? 0) + toNumber(row.expenses));
    emiMap.set(id, (emiMap.get(id) ?? 0) + toNumber(row.emi));
  }
}

/**
 * Filters transfers for one bucket, using COMBINED allocation slices.
 * @param all - All mapped transfers
 * @param bucket - Target bucket
 */
function transfersForBucket(
  all: FairShareTransferRow[],
  bucket: 'INVESTMENT' | 'EXPENSE' | 'EMI'
): FairShareTransferRow[] {
  return all.flatMap((t) => {
    if (t.transferBucket === bucket) return [t];
    if (t.transferBucket !== 'COMBINED' || !t.allocations) return [];
    const slice =
      bucket === 'INVESTMENT'
        ? t.allocations.investment
        : bucket === 'EXPENSE'
          ? t.allocations.expenses
          : t.allocations.emi;
    if (slice <= 0.01) return [];
    return [{ ...t, amount: slice }];
  });
}

/**
 * Builds combined nets (investment + expenses + EMI) and suggested pays.
 * @param partners - Assigned partners
 * @param investment - Investment bucket
 * @param expenses - Expense bucket
 * @param emi - EMI bucket
 */
function buildCombined(
  partners: { partnerId: string; name: string }[],
  investment: FairShareBucket,
  expenses: FairShareBucket,
  emi: FairShareBucket
): CombinedFairShare {
  const byPartner = partners.map((p) => {
    const inv = investment.byPartner.find((r) => r.partnerId === p.partnerId)?.net ?? 0;
    const exp = expenses.byPartner.find((r) => r.partnerId === p.partnerId)?.net ?? 0;
    const emiNet = emi.byPartner.find((r) => r.partnerId === p.partnerId)?.net ?? 0;
    const net = roundMoney(inv + exp + emiNet);
    return { partnerId: p.partnerId, name: p.name, net, status: statusFromNet(net) };
  });
  const suggestedPayments = suggestPairwisePayments(byPartner);
  const totalRemaining = roundMoney(
    suggestedPayments.reduce((sum, pay) => sum + pay.amount, 0)
  );
  return { byPartner, suggestedPayments, totalRemaining };
}

const combinedAllocGroup = {
  investment: { $sum: { $ifNull: ['$transferAllocations.investment', 0] } },
  expenses: { $sum: { $ifNull: ['$transferAllocations.expenses', 0] } },
  emi: { $sum: { $ifNull: ['$transferAllocations.emi', 0] } },
};

/**
 * Computes investment, expense, and EMI fair-share buckets with transfers applied.
 * @param ventureId - Venture ObjectId string
 */
export async function computeVentureFairShare(ventureId: string): Promise<VentureFairShare> {
  const vid = new Types.ObjectId(ventureId);

  const legacyTransferMatch = {
    ventureId: vid,
    isDeleted: false,
    type: 'PARTNER_TRANSFER' as const,
    transferBucket: { $in: ['INVESTMENT', 'EXPENSE', 'EMI'] },
  };
  const combinedMatch = {
    ventureId: vid,
    isDeleted: false,
    type: 'PARTNER_TRANSFER' as const,
    transferBucket: 'COMBINED' as const,
  };

  const [
    assignments,
    rawAgg,
    paidOutAgg,
    receivedAgg,
    combinedPaidAgg,
    combinedRecvAgg,
    transferDocs,
  ] = await Promise.all([
    PartnerVenture.find({ ventureId }).populate('partnerId', 'name').lean(),
    Transaction.aggregate<{
      _id: Types.ObjectId;
      investment: Types.Decimal128;
      expenses: Types.Decimal128;
      emi: Types.Decimal128;
    }>([
      { $match: { ventureId: vid, isDeleted: false } },
      {
        $group: {
          _id: '$partnerId',
          investment: {
            $sum: { $cond: [{ $eq: ['$type', 'CONTRIBUTION_IN'] }, '$amount', 0] },
          },
          expenses: {
            $sum: { $cond: [{ $eq: ['$type', 'EXPENSE'] }, '$amount', 0] },
          },
          emi: {
            $sum: { $cond: [{ $eq: ['$type', 'EMI_PERSONAL'] }, '$amount', 0] },
          },
        },
      },
    ]),
    Transaction.aggregate<BucketAgg>([
      { $match: legacyTransferMatch },
      {
        $group: {
          _id: { partnerId: '$partnerId', bucket: '$transferBucket' },
          total: { $sum: '$amount' },
        },
      },
    ]),
    Transaction.aggregate<BucketAgg>([
      { $match: { ...legacyTransferMatch, beneficiaryPartnerId: { $ne: null } } },
      {
        $group: {
          _id: { partnerId: '$beneficiaryPartnerId', bucket: '$transferBucket' },
          total: { $sum: '$amount' },
        },
      },
    ]),
    Transaction.aggregate<CombinedAllocAgg>([
      { $match: combinedMatch },
      { $group: { _id: '$partnerId', ...combinedAllocGroup } },
    ]),
    Transaction.aggregate<CombinedAllocAgg>([
      { $match: { ...combinedMatch, beneficiaryPartnerId: { $ne: null } } },
      { $group: { _id: '$beneficiaryPartnerId', ...combinedAllocGroup } },
    ]),
    Transaction.find({
      ventureId: vid,
      isDeleted: false,
      type: 'PARTNER_TRANSFER',
    })
      .populate('partnerId', 'name')
      .populate('beneficiaryPartnerId', 'name')
      .sort({ date: -1 })
      .limit(100)
      .lean(),
  ]);

  const partners = assignments
    .map((a) => {
      const p = a.partnerId as unknown as { _id: Types.ObjectId; name: string };
      return { partnerId: String(p._id), name: p.name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const partnerCount = partners.length;
  const invRaw = new Map<string, number>();
  const expRaw = new Map<string, number>();
  const emiRaw = new Map<string, number>();
  for (const row of rawAgg) {
    const id = String(row._id);
    invRaw.set(id, toNumber(row.investment));
    expRaw.set(id, toNumber(row.expenses));
    emiRaw.set(id, toNumber(row.emi));
  }

  const invPaid = new Map<string, number>();
  const invRecv = new Map<string, number>();
  const expPaid = new Map<string, number>();
  const expRecv = new Map<string, number>();
  const emiPaid = new Map<string, number>();
  const emiRecv = new Map<string, number>();
  applyLegacyTransferAgg(paidOutAgg, invPaid, expPaid, emiPaid);
  applyLegacyTransferAgg(receivedAgg, invRecv, expRecv, emiRecv);
  applyCombinedAllocAgg(combinedPaidAgg, invPaid, expPaid, emiPaid);
  applyCombinedAllocAgg(combinedRecvAgg, invRecv, expRecv, emiRecv);

  const mapTransfer = (t: (typeof transferDocs)[number]): FairShareTransferRow | null => {
    const from = t.partnerId as unknown as { _id: Types.ObjectId; name: string };
    const to = t.beneficiaryPartnerId as unknown as { _id: Types.ObjectId; name: string } | null;
    if (!to?._id || !t.transferBucket) return null;
    const rawAlloc = t.transferAllocations;
    const allocations: TransferAllocations | undefined = rawAlloc
      ? {
          investment: toNumber(rawAlloc.investment),
          expenses: toNumber(rawAlloc.expenses),
          emi: toNumber(rawAlloc.emi),
        }
      : undefined;
    return {
      id: String(t._id),
      amount: toNumber(t.amount),
      date: new Date(t.date).toISOString(),
      remark: t.remark,
      paidFrom: t.paidFrom,
      fromPartnerId: String(from._id),
      fromName: from.name,
      toPartnerId: String(to._id),
      toName: to.name,
      transferBucket: t.transferBucket as TransferBucket,
      allocations,
    };
  };

  const allTransfers = transferDocs
    .map(mapTransfer)
    .filter((t): t is FairShareTransferRow => t !== null);

  const investment = buildBucket({
    partnerCount,
    partners,
    rawByPartner: invRaw,
    paidOutByPartner: invPaid,
    receivedByPartner: invRecv,
    transfers: transfersForBucket(allTransfers, 'INVESTMENT'),
  });
  const expenses = buildBucket({
    partnerCount,
    partners,
    rawByPartner: expRaw,
    paidOutByPartner: expPaid,
    receivedByPartner: expRecv,
    transfers: transfersForBucket(allTransfers, 'EXPENSE'),
  });
  const emi = buildBucket({
    partnerCount,
    partners,
    rawByPartner: emiRaw,
    paidOutByPartner: emiPaid,
    receivedByPartner: emiRecv,
    transfers: transfersForBucket(allTransfers, 'EMI'),
  });

  return {
    investment,
    expenses,
    emi,
    combined: buildCombined(partners, investment, expenses, emi),
  };
}
