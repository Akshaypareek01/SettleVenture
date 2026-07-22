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
  const [txns, assignments, venture, emiSummary] = await Promise.all([
    Transaction.find({ ventureId, isDeleted: false }).lean(),
    PartnerVenture.find({ ventureId }).populate('partnerId', 'name').lean(),
    Venture.findById(ventureId).lean(),
    computeVentureEmiSummary(ventureId),
  ]);

  let poolInTotal = 0;
  let poolOutTotal = 0;
  let earningsTotal = 0;
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

  const bankMap = new Map<string, { label: string; totalIn: number; totalOut: number }>();
  for (const acct of venture?.bankAccounts ?? []) {
    bankMap.set(String(acct._id), {
      label: acct.label,
      totalIn: 0,
      totalOut: 0,
    });
  }

  for (const txn of txns) {
    const amt = toNumber(txn.amount);
    const pid = String(txn.partnerId);
    if (!partnerMap.has(pid)) {
      const partner = await Partner.findById(pid).lean();
      partnerMap.set(pid, {
        name: partner?.name ?? 'Unknown',
        depositedToPool: 0,
        directExpenses: 0,
        earningsTotal: 0,
        isAssigned: assignedIds.has(pid),
      });
    }
    const entry = partnerMap.get(pid)!;

    if (txn.type === 'CONTRIBUTION_IN') {
      poolInTotal += amt;
      entry.depositedToPool += amt;
    } else if (txn.type === 'VENDOR_PAYMENT_OUT' || txn.type === 'EMI_FROM_BANK') {
      poolOutTotal += amt;
    } else if (txn.type === 'EXPENSE') {
      entry.directExpenses += amt;
    } else if (txn.type === 'EARNING_IN') {
      earningsTotal += amt;
      entry.earningsTotal += amt;
    }
    // EMI_PERSONAL: tracked in emiSummary only — not fair share, not pool, not bank

    if (txn.bankAccountId) {
      const aid = String(txn.bankAccountId);
      if (!bankMap.has(aid)) {
        bankMap.set(aid, {
          label: txn.bankAccountLabel ?? 'Unknown account',
          totalIn: 0,
          totalOut: 0,
        });
      }
      const bank = bankMap.get(aid)!;
      if (txn.type === 'CONTRIBUTION_IN' || txn.type === 'EARNING_IN') {
        bank.totalIn += amt;
      } else if (txn.type === 'VENDOR_PAYMENT_OUT' || txn.type === 'EMI_FROM_BANK') {
        bank.totalOut += amt;
      }
    }
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
