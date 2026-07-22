import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import AddEntryForm from '../../components/forms/AddEntryForm';
import { api, PartnerEmiSummary, VentureEmiSummary } from '../../lib/api';
import { formatINR } from '../../lib/format';
import { TransactionType } from '../../lib/transactionTypes';
import { useAuth } from '../../contexts/AuthContext';

type EmiFormMode = null | { type: TransactionType; beneficiaryId?: string };

/**
 * Project EMI / loans board with personal and bank payment flows.
 */
export default function ProjectEmiPage() {
  const { ventureId, refresh, isClosed } = useOutletContext<ProjectOutletContext>();
  const { user } = useAuth();
  const [board, setBoard] = useState<VentureEmiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formMode, setFormMode] = useState<EmiFormMode>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<VentureEmiSummary>(`/ventures/${ventureId}/emi`);
      setBoard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load EMI');
    } finally {
      setLoading(false);
    }
  }, [ventureId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * After EMI payment, refresh board + venture summary.
   */
  const handleSuccess = async () => {
    setFormMode(null);
    await Promise.all([load(), refresh()]);
  };

  if (formMode && !isClosed) {
    return (
      <div>
        <button
          type="button"
          className="text-sm text-muted hover:text-zinc-100 mb-4"
          onClick={() => setFormMode(null)}
        >
          ← Back to EMI board
        </button>
        <AddEntryForm
          ventureId={ventureId}
          presetType={formMode.type}
          presetBeneficiaryId={formMode.beneficiaryId}
          onSuccess={() => void handleSuccess()}
        />
      </div>
    );
  }

  const selfHasEmi = board?.partners.some(
    (p) => p.partnerId === user?.id && p.isEmiActive
  );

  return (
    <section aria-labelledby="emi-heading" className="space-y-6">
      <div>
        <h2 id="emi-heading" className="text-xl font-semibold">
          EMI / Loans
        </h2>
        <p className="text-sm text-muted mt-1">
          Remaining = loan − EMI paid. EMI does not affect fair-share settlement.
        </p>
      </div>

      {board && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Total loan" value={formatINR(board.totalLoan)} />
          <Kpi label="Total paid" value={formatINR(board.totalPaid)} />
          <Kpi label="Remaining" value={formatINR(board.totalRemaining)} />
          <Kpi
            label="From bank"
            value={formatINR(board.totalBankPaid)}
            hint={`Personal ${formatINR(board.totalPersonalPaid)}`}
          />
        </div>
      )}

      {!isClosed && (
        <div className="flex flex-wrap gap-2">
          {selfHasEmi && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setFormMode({ type: 'EMI_PERSONAL' })}
            >
              + Pay my EMI (personal)
            </button>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setFormMode({ type: 'EMI_FROM_BANK' })}
          >
            + EMI from bank
          </button>
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading ? (
        <p className="text-muted animate-pulse">Loading EMI board...</p>
      ) : !board || board.partners.length === 0 ? (
        <div className="card text-sm text-muted">
          No partners assigned yet. Admin can set loan + monthly EMI on the Assign Partners tab.
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Partner EMI board">
          {board.partners.map((p) => (
            <EmiPartnerCard
              key={p.partnerId}
              partner={p}
              isSelf={p.partnerId === user?.id}
              readOnly={isClosed}
              onPayPersonal={() => setFormMode({ type: 'EMI_PERSONAL' })}
              onPayFromBank={() =>
                setFormMode({ type: 'EMI_FROM_BANK', beneficiaryId: p.partnerId })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
}

/** Small KPI tile. */
function Kpi({ label, value, hint }: KpiProps) {
  return (
    <div className="card py-3 px-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-semibold text-accent mt-1">{value}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}

interface EmiPartnerCardProps {
  partner: PartnerEmiSummary;
  isSelf: boolean;
  readOnly: boolean;
  onPayPersonal: () => void;
  onPayFromBank: () => void;
}

/** One partner’s loan / EMI status card. */
function EmiPartnerCard({
  partner,
  isSelf,
  readOnly,
  onPayPersonal,
  onPayFromBank,
}: EmiPartnerCardProps) {
  return (
    <li className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {partner.name}
            {isSelf ? ' (you)' : ''}
          </p>
          <p className="text-xs text-muted mt-1">
            {partner.isEmiActive ? (
              <>
                Loan {formatINR(partner.loanAmount)} · Monthly {formatINR(partner.monthlyEmi)}
                {partner.tenureMonths ? ` · ${partner.tenureMonths} mo` : ''}
              </>
            ) : (
              'EMI not active'
            )}
          </p>
        </div>
        {partner.isEmiActive && !readOnly && (
          <div className="flex gap-2">
            {isSelf && (
              <button type="button" className="text-xs btn-secondary py-1.5" onClick={onPayPersonal}>
                My personal EMI
              </button>
            )}
            <button type="button" className="text-xs btn-primary py-1.5" onClick={onPayFromBank}>
              From bank
            </button>
          </div>
        )}
      </div>
      {partner.isEmiActive && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted">Paid</p>
            <p className="font-medium">{formatINR(partner.paidAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Remaining</p>
            <p className="font-medium">{formatINR(partner.remaining)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Months paid</p>
            <p className="font-medium">
              {partner.monthsWithPayment}/{partner.monthsDue || '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted">Overdue</p>
            <p className={`font-medium ${partner.overduePeriods.length ? 'text-red-400' : ''}`}>
              {partner.overduePeriods.length
                ? partner.overduePeriods.slice(0, 3).join(', ') +
                  (partner.overduePeriods.length > 3 ? '…' : '')
                : 'None'}
            </p>
          </div>
        </div>
      )}
    </li>
  );
}
