export interface TransferAllocations {
  investment: number;
  expenses: number;
  emi: number;
}

export interface BucketNets {
  byPartner: { partnerId: string; name: string; net: number }[];
}

/**
 * Rounds a money amount to 2 decimal places.
 * @param n - Amount
 */
export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Combined net across the three fair-share buckets.
 * @param nets - Per-bucket nets for one partner
 */
export function combinedNetOf(nets: TransferAllocations): number {
  return roundMoney(nets.investment + nets.expenses + nets.emi);
}

/**
 * Payer shortfalls per bucket (how much they still owe in that line).
 * @param nets - Per-bucket nets (negative = owes the group)
 */
export function bucketShortfalls(nets: TransferAllocations): TransferAllocations {
  return {
    investment: roundMoney(Math.max(0, -nets.investment)),
    expenses: roundMoney(Math.max(0, -nets.expenses)),
    emi: roundMoney(Math.max(0, -nets.emi)),
  };
}

/**
 * Max A→B transfer from combined nets: min(payer debt, receiver credit).
 * @param payerNets - Payer per-bucket nets
 * @param receiverNets - Receiver per-bucket nets
 */
export function maxPairTransfer(
  payerNets: TransferAllocations,
  receiverNets: TransferAllocations
): number {
  const payerDebt = roundMoney(Math.max(0, -combinedNetOf(payerNets)));
  const receiverCredit = roundMoney(Math.max(0, combinedNetOf(receiverNets)));
  return roundMoney(Math.min(payerDebt, receiverCredit));
}

/**
 * Splits a transfer amount across bucket shortfalls proportionally.
 * @param amount - Transfer total
 * @param shortfalls - Payer remaining shortfalls
 */
export function splitTransferAmount(
  amount: number,
  shortfalls: TransferAllocations
): TransferAllocations {
  const weights: TransferAllocations = {
    investment: Math.max(0, shortfalls.investment),
    expenses: Math.max(0, shortfalls.expenses),
    emi: Math.max(0, shortfalls.emi),
  };
  const total = weights.investment + weights.expenses + weights.emi;
  if (amount <= 0 || total <= 0.01) {
    return { investment: 0, expenses: 0, emi: 0 };
  }

  const rounded: TransferAllocations = {
    investment: roundMoney((amount * weights.investment) / total),
    expenses: roundMoney((amount * weights.expenses) / total),
    emi: roundMoney((amount * weights.emi) / total),
  };
  const drift = roundMoney(
    amount - rounded.investment - rounded.expenses - rounded.emi
  );
  const keys = ['investment', 'expenses', 'emi'] as const;
  const largest = [...keys].sort((a, b) => weights[b] - weights[a])[0];
  rounded[largest] = roundMoney(rounded[largest] + drift);
  return rounded;
}

/**
 * Looks up one partner's net in a bucket (0 if missing).
 * @param bucket - Bucket partner rows
 * @param partnerId - Partner id
 */
export function netForPartner(bucket: BucketNets, partnerId: string): number {
  return bucket.byPartner.find((p) => p.partnerId === partnerId)?.net ?? 0;
}

/**
 * Builds per-bucket nets for a partner from the three fair-share buckets.
 * @param buckets - Investment, expense, and EMI buckets
 * @param partnerId - Partner id
 */
export function partnerBucketNets(
  buckets: { investment: BucketNets; expenses: BucketNets; emi: BucketNets },
  partnerId: string
): TransferAllocations {
  return {
    investment: netForPartner(buckets.investment, partnerId),
    expenses: netForPartner(buckets.expenses, partnerId),
    emi: netForPartner(buckets.emi, partnerId),
  };
}
