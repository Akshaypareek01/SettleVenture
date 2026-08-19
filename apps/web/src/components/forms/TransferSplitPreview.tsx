import { formatINR } from '../../lib/format';
import type { TransferAllocations } from '../../lib/fairShareAlloc';

interface TransferSplitPreviewProps {
  maxAmount: number;
  allocations: TransferAllocations;
  amount: number;
}

/**
 * Shows remaining cap and how a combined transfer splits across buckets.
 */
export default function TransferSplitPreview({
  maxAmount,
  allocations,
  amount,
}: TransferSplitPreviewProps) {
  const hasAmount = Number.isFinite(amount) && amount > 0;
  const rows: { label: string; value: number }[] = [
    { label: 'Investment', value: allocations.investment },
    { label: 'Direct expenses', value: allocations.expenses },
    { label: 'EMI', value: allocations.emi },
  ];

  return (
    <div className="rounded-xl border border-border bg-elevated/40 px-4 py-3 space-y-2" role="status">
      <p className="text-sm font-medium">Auto-split preview</p>
      <p className="text-xs text-muted">
        Remaining between these partners: {formatINR(maxAmount)}. Split follows what the payer
        still owes in each line.
      </p>
      {hasAmount ? (
        <ul className="text-sm space-y-1" aria-label="Transfer allocation preview">
          {rows.map((row) => (
            <li key={row.label} className="flex justify-between gap-3">
              <span className="text-muted">{row.label}</span>
              <span className="font-medium">{formatINR(row.value)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Enter an amount to see the split.</p>
      )}
    </div>
  );
}
