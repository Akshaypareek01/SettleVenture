import { Link, useOutletContext } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import { formatINR } from '../../lib/format';

/**
 * Lists project bank accounts with cashbook balances from summary.
 */
export default function ProjectBankPage() {
  const { ventureId, venture, summary } = useOutletContext<ProjectOutletContext>();
  const accounts = venture.bankAccounts ?? [];
  const byBank = summary?.byBankAccount ?? [];

  const balanceFor = (accountId: string) => {
    const row = byBank.find((a) => a.accountId === accountId);
    return row ?? { totalIn: 0, totalOut: 0, balance: 0, label: '' };
  };

  const totalCash = byBank.reduce((s, a) => s + a.balance, 0);

  return (
    <section aria-labelledby="bank-heading">
      <div className="mb-6">
        <h2 id="bank-heading" className="text-xl font-semibold mb-1">
          Bank / Cashbook
        </h2>
        <p className="text-sm text-muted">
          Current bank cash (after all outflows):{' '}
          <span className="text-accent font-semibold">{formatINR(totalCash)}</span>
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="card text-muted text-sm">
          No bank accounts configured yet. An admin must add accounts when creating or editing this
          project.
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Project bank accounts">
          {accounts.map((acct) => {
            const bal = balanceFor(acct._id);
            return (
              <li key={acct._id}>
                <Link
                  to={`/app/project/${ventureId}/bank/${acct._id}`}
                  className="card flex items-center gap-4 hover:border-accent/40 transition-colors"
                  aria-label={`Open cashbook for ${acct.label}`}
                >
                  <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                    <Landmark className="w-5 h-5 text-accent" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">
                      {acct.label}
                      {!acct.isActive && (
                        <span className="ml-2 text-xs text-orange-400 font-normal">Inactive</span>
                      )}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {[acct.bankName, acct.accountHint].filter(Boolean).join(' · ') || 'No details'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-accent">{formatINR(bal.balance)}</p>
                    <p className="text-xs text-muted">
                      In {formatINR(bal.totalIn)} · Out {formatINR(bal.totalOut)}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
