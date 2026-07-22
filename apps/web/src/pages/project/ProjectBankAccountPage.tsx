import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import ProjectTransactionsTab from '../../components/project/ProjectTransactionsTab';
import { formatINR } from '../../lib/format';

/**
 * Single bank account cashbook ledger.
 */
export default function ProjectBankAccountPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { ventureId, venture, summary } = useOutletContext<ProjectOutletContext>();

  const account = (venture.bankAccounts ?? []).find((a) => a._id === accountId);
  const bal = summary?.byBankAccount?.find((a) => a.accountId === accountId);

  if (!accountId || !account) {
    return (
      <div className="card">
        <p className="text-muted text-sm mb-4">Bank account not found.</p>
        <Link to={`/app/project/${ventureId}/bank`} className="text-accent text-sm">
          Back to bank accounts
        </Link>
      </div>
    );
  }

  return (
    <section aria-labelledby="account-ledger-heading">
      <Link
        to={`/app/project/${ventureId}/bank`}
        className="inline-flex items-center gap-2 text-muted hover:text-zinc-100 text-sm mb-4"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        All accounts
      </Link>

      <div className="mb-6">
        <h2 id="account-ledger-heading" className="text-xl font-semibold">
          {account.label}
        </h2>
        <p className="text-sm text-muted mt-1">
          {[account.bankName, account.accountHint].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-2 text-accent font-semibold">
          Balance {formatINR(bal?.balance ?? 0)}
          <span className="text-muted font-normal text-sm ml-2">
            (In {formatINR(bal?.totalIn ?? 0)} · Out {formatINR(bal?.totalOut ?? 0)})
          </span>
        </p>
      </div>

      <ProjectTransactionsTab
        ventureId={ventureId}
        mode="all"
        bankAccountId={accountId}
      />
    </section>
  );
}
