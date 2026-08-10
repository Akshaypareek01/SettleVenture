import { ArrowRight } from 'lucide-react';
import type { FairShareBucket, VentureFairShare } from '../../lib/api';
import { formatDate, formatINR, formatSignedINR, settlementLabel } from '../../lib/format';

interface ProjectFairShareOverviewProps {
  data: VentureFairShare;
}

/**
 * Investment and direct-expense fair-share sections with suggested payments.
 */
export default function ProjectFairShareOverview({ data }: ProjectFairShareOverviewProps) {
  return (
    <div className="space-y-8">
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
    </div>
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
