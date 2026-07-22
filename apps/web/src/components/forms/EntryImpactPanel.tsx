import { getEntryImpact, type ImpactFlag } from '../../lib/entryImpact';
import type { TransactionType } from '../../lib/transactionTypes';

interface EntryImpactPanelProps {
  type: TransactionType;
}

/**
 * Renders an arrow chip for a ledger dimension.
 * @param label - Dimension name
 * @param flag - up / down / none
 */
function ImpactChip({ label, flag }: { label: string; flag: ImpactFlag }) {
  if (flag === 'none') {
    return (
      <span className="text-xs px-2 py-1 rounded-lg border border-border text-muted">
        {label}: —
      </span>
    );
  }
  const up = flag === 'up';
  return (
    <span
      className={`text-xs px-2 py-1 rounded-lg border ${
        up
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-red-500/40 bg-red-500/10 text-red-300'
      }`}
    >
      {label}: {up ? '↑' : '↓'}
    </span>
  );
}

/**
 * Shows pool / bank / contributed / EMI impact for the selected entry type.
 */
export default function EntryImpactPanel({ type }: EntryImpactPanelProps) {
  const impact = getEntryImpact(type);

  return (
    <div
      className="rounded-xl border border-border bg-elevated/50 px-4 py-3 space-y-2"
      role="status"
      aria-live="polite"
      aria-label="Entry impact preview"
    >
      <p className="text-sm text-zinc-200">{impact.summary}</p>
      <div className="flex flex-wrap gap-2">
        <ImpactChip label="Pool" flag={impact.pool} />
        <ImpactChip label="Bank" flag={impact.bank} />
        <ImpactChip label="Your contribution" flag={impact.contributed} />
        <ImpactChip label="EMI board" flag={impact.emiBoard} />
        <span
          className={`text-xs px-2 py-1 rounded-lg border ${
            impact.fairShare
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border text-muted'
          }`}
        >
          Fair share: {impact.fairShare ? 'yes' : 'no'}
        </span>
      </div>
    </div>
  );
}
