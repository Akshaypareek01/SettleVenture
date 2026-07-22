import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { VentureSummary } from '../../lib/api';
import { formatINR, formatSignedINR, settlementLabel } from '../../lib/format';

interface ProjectAnalysisTabProps {
  ventureId: string;
  summary: VentureSummary;
  showSettlement?: boolean;
}

/**
 * Project financial breakdown — pool vs direct expenses vs partner totals.
 */
export default function ProjectAnalysisTab({
  ventureId,
  summary,
  showSettlement = false,
}: ProjectAnalysisTabProps) {
  const directExpenseTotal = summary.byPartner.reduce((sum, p) => sum + p.directExpenses, 0);
  const emi = summary.emiSummary;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-muted mb-1">Partner Investment</p>
          <p className="text-2xl font-bold text-accent">{formatINR(summary.poolInTotal)}</p>
          <p className="text-xs text-muted mt-1">Into shared pool</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Direct Expenses</p>
          <p className="text-2xl font-bold text-amber-300">{formatINR(directExpenseTotal)}</p>
          <p className="text-xs text-muted mt-1">Paid directly by partners</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Pool Payments Out</p>
          <p className="text-2xl font-bold text-blue-300">{formatINR(summary.poolOutTotal)}</p>
          <p className="text-xs text-muted mt-1">From pool to vendors</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Pool Balance</p>
          <p className="text-2xl font-bold">{formatINR(summary.poolBalance)}</p>
          <p className="text-xs text-muted mt-1">In − Out</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="card">
          <p className="text-sm text-muted mb-1">Earnings</p>
          <p className="text-2xl font-bold text-emerald-300">
            {formatINR(summary.earningsTotal ?? 0)}
          </p>
          <p className="text-xs text-muted mt-1">Not part of fair-share settlement</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">EMI paid</p>
          <p className="text-2xl font-bold text-violet-300">
            {formatINR(emi?.totalPaid ?? 0)}
          </p>
          <p className="text-xs text-muted mt-1">
            Remaining {formatINR(emi?.totalRemaining ?? 0)}
            {emi
              ? ` · Bank ${formatINR(emi.totalBankPaid)} / Personal ${formatINR(emi.totalPersonalPaid)}`
              : ''}
          </p>
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-muted mb-1">Total partner contribution</p>
        <p className="text-3xl font-bold">{formatINR(summary.totalContributed)}</p>
        <p className="text-xs text-muted mt-2">
          Investment + direct expenses combined. Fair-share settlement uses currently assigned
          partners only.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-1">Breakdown by partner</h3>
        <p className="text-xs text-muted mb-4">
          Click a partner to open their full analytics &amp; report.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="text-left py-2 pr-4">Partner</th>
              <th className="text-right py-2 px-4">Investment</th>
              <th className="text-right py-2 px-4">Direct Expense</th>
              <th className="text-right py-2 px-4">Total</th>
              <th className="text-right py-2 px-4">Share %</th>
              <th className="text-right py-2 pl-4">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.byPartner.map((p) => (
              <tr key={p.partnerId} className="border-b border-border/50 hover:bg-elevated/50">
                <td className="py-3 pr-4 font-medium">
                  <Link
                    to={`/app/project/${ventureId}/partner/${p.partnerId}`}
                    className="text-zinc-100 hover:text-accent"
                  >
                    {p.name}
                  </Link>
                  {p.isAssigned === false && (
                    <span className="ml-2 text-xs text-muted border border-border px-1.5 py-0.5 rounded">
                      Former
                    </span>
                  )}
                </td>
                <td className="py-3 px-4 text-right text-accent">{formatINR(p.depositedToPool)}</td>
                <td className="py-3 px-4 text-right text-amber-300">{formatINR(p.directExpenses)}</td>
                <td className="py-3 px-4 text-right font-semibold">{formatINR(p.totalContributed)}</td>
                <td className="py-3 px-4 text-right text-muted">
                  {(p.pctOfTotal * 100).toFixed(1)}%
                </td>
                <td className="py-3 pl-4 text-right">
                  <Link
                    to={`/app/project/${ventureId}/partner/${p.partnerId}`}
                    className="inline-flex items-center gap-1 text-accent text-xs font-medium hover:underline"
                    aria-label={`Open analytics for ${p.name}`}
                  >
                    Analytics
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showSettlement && (
        <div className="card overflow-x-auto">
          <h3 className="font-semibold mb-1">Settlement</h3>
          <p className="text-xs text-muted mb-4">
            Among assigned partners only. Positive = group owes them; negative = they owe the group.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left py-2 pr-4">Partner</th>
                <th className="text-right py-2 px-4">Contributed</th>
                <th className="text-right py-2 px-4">Fair Share</th>
                <th className="text-right py-2 px-4">Net balance</th>
                <th className="text-left py-2 pl-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.settlement.map((s) => (
                <tr key={s.partnerId} className="border-b border-border/50">
                  <td className="py-3 pr-4 font-medium">
                    <Link
                      to={`/app/project/${ventureId}/partner/${s.partnerId}`}
                      className="hover:text-accent"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-right">{formatINR(s.contributed)}</td>
                  <td className="py-3 px-4 text-right">{formatINR(s.fairShare)}</td>
                  <td
                    className={`py-3 px-4 text-right font-semibold ${
                      s.netBalance > 0.01
                        ? 'text-accent'
                        : s.netBalance < -0.01
                          ? 'text-red-400'
                          : 'text-muted'
                    }`}
                  >
                    {formatSignedINR(s.netBalance)}
                  </td>
                  <td className="py-3 pl-4 text-muted">{settlementLabel(s.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
