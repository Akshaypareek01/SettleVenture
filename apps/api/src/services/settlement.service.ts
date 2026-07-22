import { Types } from 'mongoose';
import { Transaction, PartnerVenture, Partner, Venture } from '../models/index.js';
import { toNumber } from '../utils/decimal.js';
import { computeVentureEmiSummary, type VentureEmiSummary } from './emi.service.js';

export interface PartnerSummary {
  partnerId: string;
  name: string;
  depositedToPool: number;
  directExpenses: number;
  earningsTotal: number;
  totalContributed: number;
  pctOfTotal: number;
  /** False when partner has history but is no longer assigned */
  isAssigned: boolean;
}

export interface SettlementRow {
  partnerId: string;
  name: string;
  contributed: number;
  fairShare: number;
  netBalance: number;
  status: 'owed_by_group' | 'owes_group' | 'settled';
}

export interface BankAccountSummary {
  accountId: string;
  label: string;
  totalIn: number;
  totalOut: number;
  balance: number;
}

export interface VentureSummary {
  poolInTotal: number;
  poolOutTotal: number;
  poolBalance: number;
  totalContributed: number;
  earningsTotal: number;
  byPartner: PartnerSummary[];
  byBankAccount: BankAccountSummary[];
  emiSummary: VentureEmiSummary;
  settlement: SettlementRow[];
}

/**
 * Computes pool totals, partner breakdown, bank cashbook, earnings, EMI, and settlement.
 * Fair share uses CONTRIBUTION_IN + EXPENSE only (not earnings / EMI / outflows).
 * @param ventureId - Venture ObjectId string
 */
export async function computeVentureSummary(ventureId: string): Promise<VentureSummary> {
  const vid = new Types.ObjectId(ventureId);
  const [partnerAgg, bankAgg, assignments, venture, emiSummary] = await Promise.all([
    // Per-partner sums, computed in MongoDB on Decimal128 (no float drift, no full load).
    Transaction.aggregate<{
      _id: Types.ObjectId;
      depositedToPool: Types.Decimal128;
      directExpenses: Types.Decimal128;
      earningsTotal: Types.Decimal128;
    }>([
      { $match: { ventureId: vid, isDeleted: false } },
      {
        $group: {
          _id: '$partnerId',
          depositedToPool: {
            $sum: { $cond: [{ $eq: ['$type', 'CONTRIBUTION_IN'] }, '$amount', 0] },
          },
          directExpenses: {
            $sum: { $cond: [{ $eq: ['$type', 'EXPENSE'] }, '$amount', 0] },
          },
          earningsTotal: {
            $sum: { $cond: [{ $eq: ['$type', 'EARNING_IN'] }, '$amount', 0] },
          },
        },
      },
    ]),
    // Per-bank in/out sums.
    Transaction.aggregate<{
      _id: Types.ObjectId;
      label: string;
      totalIn: Types.Decimal128;
      totalOut: Types.Decimal128;
    }>([
      { $match: { ventureId: vid, isDeleted: false, bankAccountId: { $ne: null } } },
      {
        $group: {
          _id: '$bankAccountId',
          label: { $last: '$bankAccountLabel' },
          totalIn: {
            $sum: {
              $cond: [{ $in: ['$type', ['CONTRIBUTION_IN', 'EARNING_IN']] }, '$amount', 0],
            },
          },
          totalOut: {
            $sum: {
              $cond: [{ $in: ['$type', ['VENDOR_PAYMENT_OUT', 'EMI_FROM_BANK']] }, '$amount', 0],
            },
          },
        },
      },
    ]),
    PartnerVenture.find({ ventureId }).populate('partnerId', 'name').lean(),
    Venture.findById(ventureId).lean(),
    computeVentureEmiSummary(ventureId),
  ]);

  const assignedIds = new Set(
    assignments.map((a) => {
      const p = a.partnerId as unknown as { _id: Types.ObjectId };
      return String(p._id);
    })
  );
  const partnerMap = new Map<
    string,
    {
      name: string;
      depositedToPool: number;
      directExpenses: number;
      earningsTotal: number;
      isAssigned: boolean;
    }
  >();

  for (const a of assignments) {
    const p = a.partnerId as unknown as { _id: Types.ObjectId; name: string };
    partnerMap.set(String(p._id), {
      name: p.name,
      depositedToPool: 0,
      directExpenses: 0,
      earningsTotal: 0,
      isAssigned: true,
    });
  }

  // Names for partners with history but no current assignment — one batched query.
  const unknownIds = partnerAgg
    .map((r) => String(r._id))
    .filter((id) => !partnerMap.has(id));
  if (unknownIds.length) {
    const formerPartners = await Partner.find({ _id: { $in: unknownIds } })
      .select('name')
      .lean();
    const nameById = new Map(formerPartners.map((p) => [String(p._id), p.name]));
    for (const id of unknownIds) {
      partnerMap.set(id, {
        name: nameById.get(id) ?? 'Unknown',
        depositedToPool: 0,
        directExpenses: 0,
        earningsTotal: 0,
        isAssigned: assignedIds.has(id),
      });
    }
  }

  let poolInTotal = 0;
  let poolOutTotal = 0;
  let earningsTotal = 0;

  for (const row of partnerAgg) {
    const entry = partnerMap.get(String(row._id));
    if (!entry) continue;
    entry.depositedToPool = toNumber(row.depositedToPool);
    entry.directExpenses = toNumber(row.directExpenses);
    entry.earningsTotal = toNumber(row.earningsTotal);
    poolInTotal += entry.depositedToPool;
    earningsTotal += entry.earningsTotal;
  }

  const bankMap = new Map<string, { label: string; totalIn: number; totalOut: number }>();
  for (const acct of venture?.bankAccounts ?? []) {
    bankMap.set(String(acct._id), { label: acct.label, totalIn: 0, totalOut: 0 });
  }
  for (const row of bankAgg) {
    const aid = String(row._id);
    const existing = bankMap.get(aid);
    const totalIn = toNumber(row.totalIn);
    const totalOut = toNumber(row.totalOut);
    poolOutTotal += totalOut;
    bankMap.set(aid, {
      label: existing?.label ?? row.label ?? 'Unknown account',
      totalIn,
      totalOut,
    });
  }

  const byPartner: PartnerSummary[] = [];
  let totalContributedAll = 0;
  let assignedContributed = 0;

  for (const [partnerId, data] of partnerMap) {
    const totalContributed = data.depositedToPool + data.directExpenses;
    totalContributedAll += totalContributed;
    if (data.isAssigned) assignedContributed += totalContributed;
    byPartner.push({
      partnerId,
      name: data.name,
      depositedToPool: data.depositedToPool,
      directExpenses: data.directExpenses,
      earningsTotal: Math.round(data.earningsTotal * 100) / 100,
      totalContributed,
      pctOfTotal: 0,
      isAssigned: data.isAssigned,
    });
  }

  // Assigned partners first, then former partners with history
  byPartner.sort((a, b) => {
    if (a.isAssigned !== b.isAssigned) return a.isAssigned ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const p of byPartner) {
    p.pctOfTotal = totalContributedAll > 0 ? p.totalContributed / totalContributedAll : 0;
  }

  const byBankAccount: BankAccountSummary[] = Array.from(bankMap.entries()).map(
    ([accountId, data]) => ({
      accountId,
      label: data.label,
      totalIn: Math.round(data.totalIn * 100) / 100,
      totalOut: Math.round(data.totalOut * 100) / 100,
      balance: Math.round((data.totalIn - data.totalOut) * 100) / 100,
    })
  );

  // Fair share / settlement only among currently assigned partners
  const assignedPartners = byPartner.filter((p) => p.isAssigned);
  const activePartnerCount = Math.max(assignedPartners.length, 1);
  const fairShare = assignedContributed / activePartnerCount;

  const settlement: SettlementRow[] = assignedPartners.map((p) => {
    const netBalance = p.totalContributed - fairShare;
    let status: SettlementRow['status'] = 'settled';
    if (netBalance > 0.01) status = 'owed_by_group';
    else if (netBalance < -0.01) status = 'owes_group';
    return {
      partnerId: p.partnerId,
      name: p.name,
      contributed: p.totalContributed,
      fairShare: Math.round(fairShare * 100) / 100,
      netBalance: Math.round(netBalance * 100) / 100,
      status,
    };
  });

  return {
    poolInTotal,
    poolOutTotal,
    poolBalance: poolInTotal - poolOutTotal,
    totalContributed: totalContributedAll,
    earningsTotal: Math.round(earningsTotal * 100) / 100,
    byPartner,
    byBankAccount,
    emiSummary,
    settlement,
  };
}

/**
 * Returns total invested by a partner across all assigned ventures.
 * @param partnerId - Partner ObjectId string
 */
export async function computePartnerTotalInvested(partnerId: string): Promise<number> {
  const assignments = await PartnerVenture.find({ partnerId }).lean();
  const ventureIds = assignments.map((a) => a.ventureId);
  const txns = await Transaction.find({
    partnerId,
    ventureId: { $in: ventureIds },
    isDeleted: false,
    type: { $in: ['CONTRIBUTION_IN', 'EXPENSE'] },
  }).lean();

  return txns.reduce((sum, t) => sum + toNumber(t.amount), 0);
}
