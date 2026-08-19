import { ArrowRight } from 'lucide-react';
import type {
  CombinedFairShare,
  FairShareBucket,
  SuggestedPayment,
  VentureFairShare,
} from '../../lib/api';
import { formatDate, formatINR, formatSignedINR, settlementLabel } from '../../lib/format';

interface ProjectFairShareOverviewProps {
  data: VentureFairShare;
  onSettle?: (pay: SuggestedPayment) => void;
}

/**
 * Combined remaining plus investment, expense, and EMI fair-share sections.
 */
export default function ProjectFairShareOverview({
  data,
  onSettle,
}: ProjectFairShareOverviewProps) {
  return (
    <div className="space-y-8">
      <CombinedSection
        combined={data.combined}
        investment={data.investment}
        expenses={data.expenses}
        emi={data.emi}
        onSettle={onSettle}
      />
      <BucketSection
        title="Partner Investment"
        subtitle="Equal split of money deposited into project bank accounts"
        accentClass="text-accent"
        bucket={data.investment}
        rawLabel="Invested"
      />
      <BucketSection
        title="Direct Expenses"
        subtitle="Equal split of out-of-pocket spends (not from project bank)"
        accentClass="text-amber-300"
        bucket={data.expenses}
        rawLabel="Spent"
      />
      <BucketSection
        title="EMI"
        subtitle="Equal split of personal EMI paid toward the bank — EMI from bank is not counted twice"
        accentClass="text-violet-300"
        bucket={data.emi}
        rawLabel="Paid"
      />
    </div>
  );
}

interface CombinedSectionProps {
  combined: CombinedFairShare;
  investment: FairShareBucket;
  expenses: FairShareBucket;
  emi: FairShareBucket;
  onSettle?: (pay: SuggestedPayment) => void;
}

/**
 * Looks up a partner's raw contribution in a fair-share bucket.
 * @param bucket - Investment, expense, or EMI bucket
 * @param partnerId - Partner id
 */
function rawContribution(bucket: FairShareBucket, partnerId: string): number {
  return bucket.byPartner.find((p) => p.partnerId === partnerId)?.raw ?? 0;
}

/**
 * Combined remaining across investment, expenses, and EMI with who-owes-whom.
 */
function CombinedSection({
  combined,
  investment,
  expenses,
  emi,
  onSettle,
}: CombinedSectionProps) {
  return (
    <section className="space-y-4" aria-labelledby="fair-combined">
      <div>
        <h2 id="fair-combined" className="text-lg font-semibold">
          Remaining to settle
        </h2>
        <p className="text-sm text-muted mt-1">
          Investment + direct expenses + personal EMI. One transfer clears all three.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-sm text-muted mb-1">Total remaining</p>
          <p className="text-2xl font-bold text-sky-300">{formatINR(combined.totalRemaining)}</p>
          <p className="text-xs text-muted mt-1">Sum of suggested partner-to-partner pays</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Suggested payments</p>
          <p className="text-2xl font-bold">{combined.suggestedPayments.length}</p>
          <p className="text-xs text-muted mt-1">Log under + Transfer to clear</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-1">Net by partner</h3>
        <p className="text-xs text-muted mb-4">
          Contribution per line, then combined net. Positive net = group owes them.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="text-left py-2 pr-4">Partner</th>
              <th className="text-right py-2 px-3">Investment</th>
              <th className="text-right py-2 px-3">Direct expenses</th>
              <th className="text-right py-2 px-3">EMI</th>
              <th className="text-right py-2 px-3">Total</th>
              <th className="text-right py-2 px-3">Net</th>
              <th className="text-left py-2 pl-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {combined.byPartner.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-muted">
                  No assigned partners yet.
                </td>
              </tr>
            ) : (
              combined.byPartner.map((p) => {
                const inv = rawContribution(investment, p.partnerId);
                const exp = rawContribution(expenses, p.partnerId);
                const emiPaid = rawContribution(emi, p.partnerId);
                return (
                  <tr key={p.partnerId} className="border-b border-border/50">
                    <td className="py-3 pr-4 font-medium">{p.name}</td>
                    <td className="py-3 px-3 text-right text-accent">{formatINR(inv)}</td>
                    <td className="py-3 px-3 text-right text-amber-300">{formatINR(exp)}</td>
                    <td className="py-3 px-3 text-right text-violet-300">{formatINR(emiPaid)}</td>
                    <td className="py-3 px-3 text-right font-semibold">
                      {formatINR(inv + exp + emiPaid)}
                    </td>
                    <td
                      className={`py-3 px-3 text-right font-semibold ${
                        p.net >= 0 ? 'text-accent' : 'text-red-400'
                      }`}
                    >
                      {formatSignedINR(p.net)}
                    </td>
                    <td className="py-3 pl-3 text-muted">{settlementLabel(p.status)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-1">Who should pay whom</h3>
        <p className="text-xs text-muted mb-4">
          {onSettle
            ? 'Click a row to log that transfer. It auto-splits across investment, expenses, and EMI.'
            : 'Suggested personal transfers so everyone lands on equal fair share.'}
        </p>
        {combined.suggestedPayments.length === 0 ? (
          <p className="text-sm text-muted">All settled.</p>
        ) : (
          <ul className="space-y-3" aria-label="Combined suggested payments">
            {combined.suggestedPayments.map((pay) => (
              <li key={`${pay.fromPartnerId}-${pay.toPartnerId}-${pay.amount}`}>
                {onSettle ? (
                  <button
                    type="button"
                    onClick={() => onSettle(pay)}
                    className="w-full flex flex-wrap items-center gap-2 sm:gap-3 text-sm rounded-xl border border-border bg-elevated/40 px-3 py-3 text-left hover:border-sky-500/40 hover:bg-elevated"
                    aria-label={`Settle ${formatINR(pay.amount)} from ${pay.fromName} to ${pay.toName}`}
                  >
                    <span className="font-medium">{pay.fromName}</span>
                    <ArrowRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                    <span className="font-medium">{pay.toName}</span>
                    <span className="font-bold text-sky-300 sm:ml-auto">{formatINR(pay.amount)}</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm rounded-xl border border-border bg-elevated/40 px-3 py-3">
                    <span className="font-medium">{pay.fromName}</span>
                    <ArrowRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                    <span className="font-medium">{pay.toName}</span>
                    <span className="font-bold text-sky-300 sm:ml-auto">{formatINR(pay.amount)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface BucketSectionProps {
  title: string;
  subtitle: string;
  accentClass: string;
  bucket: FairShareBucket;
  rawLabel: string;
}

/**
 * One fair-share bucket: KPIs, partner table, suggested pays, recent transfers.
 */
function BucketSection({ title, subtitle, accentClass, bucket, rawLabel }: BucketSectionProps) {
  return (
    <section className="space-y-4" aria-labelledby={`fair-${title.replace(/\s+/g, '-')}`}>
      <div>
        <h2 id={`fair-${title.replace(/\s+/g, '-')}`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted mt-1">{subtitle}</p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-muted mb-1">Total</p>
          <p className={`text-2xl font-bold ${accentClass}`}>{formatINR(bucket.total)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Fair share each</p>
          <p className="text-2xl font-bold">{formatINR(bucket.fairShare)}</p>
          <p className="text-xs text-muted mt-1">
            {bucket.partnerCount} partner{bucket.partnerCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Suggested payments</p>
          <p className="text-2xl font-bold">{bucket.suggestedPayments.length}</p>
          <p className="text-xs text-muted mt-1">To settle remaining imbalance</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-1">By partner</h3>
        <p className="text-xs text-muted mb-4">
          Effective = {rawLabel.toLowerCase()} + paid to others − received from others. Positive net =
          group owes them.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="text-left py-2 pr-4">Partner</th>
              <th className="text-right py-2 px-3">{rawLabel}</th>
              <th className="text-right py-2 px-3">Paid out</th>
              <th className="text-right py-2 px-3">Received</th>
              <th className="text-right py-2 px-3">Effective</th>
              <th className="text-right py-2 px-3">Fair share</th>
              <th className="text-right py-2 px-3">Net</th>
              <th className="text-left py-2 pl-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {bucket.byPartner.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-muted">
                  No assigned partners yet.
                </td>
              </tr>
            ) : (
              bucket.byPartner.map((p) => (
                <tr key={p.partnerId} className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">{p.name}</td>
                  <td className={`py-3 px-3 text-right ${accentClass}`}>{formatINR(p.raw)}</td>
                  <td className="py-3 px-3 text-right text-muted">{formatINR(p.paidOut)}</td>
                  <td className="py-3 px-3 text-right text-muted">{formatINR(p.received)}</td>
                  <td className="py-3 px-3 text-right font-semibold">{formatINR(p.effective)}</td>
                  <td className="py-3 px-3 text-right">{formatINR(p.fairShare)}</td>
                  <td
                    className={`py-3 px-3 text-right font-semibold ${
                      p.net >= 0 ? 'text-accent' : 'text-red-400'
                    }`}
                  >
                    {formatSignedINR(p.net)}
                  </td>
                  <td className="py-3 pl-3 text-muted">{settlementLabel(p.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-1">Who should pay whom</h3>
        <p className="text-xs text-muted mb-4">
          Suggested personal transfers so everyone lands on equal fair share. Log them under +
          Transfer.
        </p>
        {bucket.suggestedPayments.length === 0 ? (
          <p className="text-sm text-muted">All settled for this bucket.</p>
        ) : (
          <ul className="space-y-3" aria-label={`Suggested payments for ${title}`}>
            {bucket.suggestedPayments.map((pay) => (
              <li
                key={`${pay.fromPartnerId}-${pay.toPartnerId}-${pay.amount}`}
                className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm rounded-xl border border-border bg-elevated/40 px-3 py-3"
              >
                <span className="font-medium">{pay.fromName}</span>
                <ArrowRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                <span className="font-medium">{pay.toName}</span>
                <span className={`font-bold ${accentClass} sm:ml-auto`}>
                  {formatINR(pay.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {bucket.transfers.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-1">Recent transfers</h3>
          <p className="text-xs text-muted mb-4">Latest partner-to-partner payments in this bucket.</p>
          <ul className="space-y-3" aria-label={`Recent transfers for ${title}`}>
            {bucket.transfers.slice(0, 8).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline justify-between gap-2 text-sm border-b border-border/40 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="font-medium">
                    {t.fromName} → {t.toName}
                  </p>
                  {t.remark && <p className="text-muted text-xs mt-0.5">{t.remark}</p>}
                  <p className="text-xs text-muted mt-1">{formatDate(t.date)}</p>
                </div>
                <p className={`font-semibold ${accentClass}`}>{formatINR(t.amount)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
