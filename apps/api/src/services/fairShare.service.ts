import { Types } from 'mongoose';
import { Transaction, PartnerVenture } from '../models/index.js';
import { toNumber } from '../utils/decimal.js';

export type FairShareStatus = 'owed_by_group' | 'owes_group' | 'settled';
export type TransferBucket = 'INVESTMENT' | 'EXPENSE';

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
}

export interface FairShareBucket {
  total: number;
  fairShare: number;
  partnerCount: number;
  byPartner: FairSharePartnerRow[];
  suggestedPayments: SuggestedPayment[];
  transfers: FairShareTransferRow[];
}

export interface VentureFairShare {
  investment: FairShareBucket;
  expenses: FairShareBucket;
}

/**
 * Rounds a money amount to 2 decimal places.
 * @param n - Amount
 */
function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

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
 * Builds one fair-share bucket (investment or expenses) for assigned partners.
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
 * Computes investment and expense fair-share buckets with partner transfers applied.
 * @param ventureId - Venture ObjectId string
 */
export async function computeVentureFairShare(ventureId: string): Promise<VentureFairShare> {
  const vid = new Types.ObjectId(ventureId);

  type BucketAgg = { _id: { partnerId: Types.ObjectId; bucket: TransferBucket }; total: Types.Decimal128 };

  const transferMatch = {
    ventureId: vid,
    isDeleted: false,
    type: 'PARTNER_TRANSFER' as const,
    transferBucket: { $in: ['INVESTMENT', 'EXPENSE'] },
  };

  const [assignments, rawAgg, paidOutAgg, receivedAgg, transferDocs] = await Promise.all([
    PartnerVenture.find({ ventureId }).populate('partnerId', 'name').lean(),
    Transaction.aggregate<{
      _id: Types.ObjectId;
      investment: Types.Decimal128;
      expenses: Types.Decimal128;
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
        },
      },
    ]),
    Transaction.aggregate<BucketAgg>([
      { $match: transferMatch },
      {
        $group: {
          _id: { partnerId: '$partnerId', bucket: '$transferBucket' },
          total: { $sum: '$amount' },
        },
      },
    ]),
    Transaction.aggregate<BucketAgg>([
      { $match: { ...transferMatch, beneficiaryPartnerId: { $ne: null } } },
      {
        $group: {
          _id: { partnerId: '$beneficiaryPartnerId', bucket: '$transferBucket' },
          total: { $sum: '$amount' },
        },
      },
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
  for (const row of rawAgg) {
    const id = String(row._id);
    invRaw.set(id, toNumber(row.investment));
    expRaw.set(id, toNumber(row.expenses));
  }

  /**
   * Applies transfer aggregation rows into investment/expense maps.
   * @param rows - Grouped transfer totals
   * @param invMap - Investment map to mutate
   * @param expMap - Expense map to mutate
   */
  function applyTransferAgg(
    rows: BucketAgg[],
    invMap: Map<string, number>,
    expMap: Map<string, number>
  ): void {
    for (const row of rows) {
      if (!row._id?.partnerId) continue;
      const id = String(row._id.partnerId);
      const amount = toNumber(row.total);
      if (row._id.bucket === 'INVESTMENT') {
        invMap.set(id, (invMap.get(id) ?? 0) + amount);
      } else {
        expMap.set(id, (expMap.get(id) ?? 0) + amount);
      }
    }
  }

  const invPaid = new Map<string, number>();
  const invRecv = new Map<string, number>();
  const expPaid = new Map<string, number>();
  const expRecv = new Map<string, number>();
  applyTransferAgg(paidOutAgg, invPaid, expPaid);
  applyTransferAgg(receivedAgg, invRecv, expRecv);

  const mapTransfer = (t: (typeof transferDocs)[number]): FairShareTransferRow | null => {
    const from = t.partnerId as unknown as { _id: Types.ObjectId; name: string };
    const to = t.beneficiaryPartnerId as unknown as { _id: Types.ObjectId; name: string } | null;
    if (!to?._id || !t.transferBucket) return null;
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
    };
  };

  const allTransfers = transferDocs
    .map(mapTransfer)
    .filter((t): t is FairShareTransferRow => t !== null);

  return {
    investment: buildBucket({
      partnerCount,
      partners,
      rawByPartner: invRaw,
      paidOutByPartner: invPaid,
      receivedByPartner: invRecv,
      transfers: allTransfers.filter((t) => t.transferBucket === 'INVESTMENT'),
    }),
    expenses: buildBucket({
      partnerCount,
      partners,
      rawByPartner: expRaw,
      paidOutByPartner: expPaid,
      receivedByPartner: expRecv,
      transfers: allTransfers.filter((t) => t.transferBucket === 'EXPENSE'),
    }),
  };
}
