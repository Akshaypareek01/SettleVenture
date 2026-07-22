import { useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { api, Transaction } from '../../lib/api';
import { formatDate, formatINR } from '../../lib/format';
import { transactionTypeBadgeClass, transactionTypeLabel } from '../../lib/transactionTypes';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { useAuth } from '../../contexts/AuthContext';
import ListToolbar from '../ui/ListToolbar';
import PaginationBar from '../ui/PaginationBar';
import AttachmentPreview from '../ui/AttachmentPreview';
import ConfirmDialog from '../ui/ConfirmDialog';

interface PartnerOption {
  _id: string;
  name: string;
  email: string;
}

interface ProjectTransactionsTabProps {
  ventureId: string;
  /** Show all partners' entries or only the current user's */
  mode: 'all' | 'mine';
  refreshKey?: number;
  /** Optional cashbook filter for a single project bank account */
  bankAccountId?: string;
  /** Lock list to a single transaction type (hides type filter) */
  fixedType?: string;
  /** Allow voiding entries (hidden when project closed) */
  canVoid?: boolean;
  /** Called after a successful void */
  onVoided?: () => void;
}

const TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'CONTRIBUTION_IN', label: 'Partner Investment' },
  { value: 'EXPENSE', label: 'Direct Expense' },
  { value: 'VENDOR_PAYMENT_OUT', label: 'Bank outflow' },
  { value: 'EARNING_IN', label: 'Earning' },
  { value: 'EMI_PERSONAL', label: 'EMI (personal)' },
  { value: 'EMI_FROM_BANK', label: 'EMI from bank' },
];

/**
 * Paginated transaction list for a project (all entries or personal history).
 */
export default function ProjectTransactionsTab({
  ventureId,
  mode,
  refreshKey = 0,
  bankAccountId,
  fixedType,
  canVoid = false,
  onVoided,
}: ProjectTransactionsTabProps) {
  const { user } = useAuth();
  const list = usePaginatedList<Transaction>(`/ventures/${ventureId}/transactions`, {
    enabled: !!ventureId,
    initialFilters:
      mode === 'mine'
        ? {
            mine: 'true',
            type: fixedType ?? 'all',
            ...(bankAccountId ? { bankAccountId } : {}),
          }
        : {
            partnerId: 'all',
            type: fixedType ?? 'all',
            ...(bankAccountId ? { bankAccountId } : {}),
          },
  });
  const [partners, setPartners] = useState<PartnerOption[]>([]);

  useEffect(() => {
    if (mode !== 'all' || !ventureId) return;
    api<PartnerOption[]>(`/ventures/${ventureId}/transactions/partners`)
      .then(setPartners)
      .catch(() => setPartners([]));
  }, [ventureId, mode, refreshKey]);

  useEffect(() => {
    list.refresh();
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = useMemo(() => {
    const typeFilter = {
      key: 'type',
      label: 'Filter by entry type',
      value: list.filters.type ?? 'all',
      options: TYPE_FILTER_OPTIONS,
    };

    if (mode === 'all') {
      const base = fixedType ? [] : [typeFilter];
      return [
        ...base,
        {
          key: 'partnerId',
          label: 'Filter by partner',
          value: list.filters.partnerId ?? 'all',
          options: [
            { value: 'all', label: 'All partners' },
            ...partners.map((p) => ({ value: p._id, label: p.name })),
          ],
        },
      ];
    }

    return fixedType ? [] : [typeFilter];
  }, [mode, list.filters.type, list.filters.partnerId, partners, fixedType]);

  return (
    <div className="space-y-4">
      {mode === 'all' && !bankAccountId && (
        <div className="flex items-center gap-2 text-muted text-sm mb-2">
          <Users className="w-4 h-4" aria-hidden="true" />
          All project entries — investments, expenses, outflows, earnings &amp; EMI
        </div>
      )}

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search bank, reason, category..."
        filters={filters}
        onFilterChange={list.setFilter}
      />

      {list.error && <p className="text-red-400 text-sm">{list.error}</p>}

      {list.loading ? (
        <div className="card text-center py-8 text-muted animate-pulse">Loading...</div>
      ) : list.items.length === 0 ? (
        <div className="card text-center py-8 text-muted">
          {bankAccountId
            ? 'No movements on this account yet.'
            : mode === 'mine'
              ? "You haven't logged any entries yet."
              : 'No entries yet.'}
        </div>
      ) : (
        list.items.map((t) => (
          <EntryCard
            key={t._id}
            transaction={t}
            showPartner={mode === 'all'}
            ventureId={ventureId}
            voidAllowed={
              canVoid &&
              !!user &&
              (user.role === 'admin' || t.partnerId._id === user.id)
            }
            onVoided={() => {
              list.refresh();
              onVoided?.();
            }}
          />
        ))
      )}

      <PaginationBar
        pagination={list.pagination}
        page={list.page}
        limit={list.limit}
        onPageChange={list.setPage}
        onLimitChange={list.setLimit}
        loading={list.loading}
      />
    </div>
  );
}

interface EntryCardProps {
  transaction: Transaction;
  showPartner?: boolean;
  ventureId: string;
  voidAllowed?: boolean;
  onVoided?: () => void;
}

/**
 * Displays a single project entry card with type badge, proof, and optional void.
 */
function EntryCard({
  transaction,
  showPartner = true,
  ventureId,
  voidAllowed = false,
  onVoided,
}: EntryCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState('');

  const beneficiaryName =
    transaction.beneficiaryPartnerId &&
    typeof transaction.beneficiaryPartnerId === 'object'
      ? transaction.beneficiaryPartnerId.name
      : null;

  /**
   * Soft-voids this entry via the API.
   */
  const handleVoid = async () => {
    setVoiding(true);
    setVoidError('');
    try {
      await api(`/ventures/${ventureId}/transactions/${transaction._id}`, {
        method: 'DELETE',
      });
      setConfirmOpen(false);
      onVoided?.();
    } catch (err) {
      setVoidError(err instanceof Error ? err.message : 'Failed to void entry');
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${transactionTypeBadgeClass(transaction.type)}`}
            >
              {transactionTypeLabel(transaction.type)}
            </span>
            {transaction.categoryName && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted">
                {transaction.categoryName}
              </span>
            )}
            {showPartner && (
              <span className="font-semibold">{transaction.partnerId.name}</span>
            )}
          </div>
          <p className="text-2xl font-bold text-accent">{formatINR(transaction.amount)}</p>
          {transaction.bankAccountLabel && (
            <p className="text-sm text-muted mt-2">Account: {transaction.bankAccountLabel}</p>
          )}
          {beneficiaryName && (
            <p className="text-sm text-muted mt-1">EMI for: {beneficiaryName}</p>
          )}
          {transaction.emiPeriod && (
            <p className="text-sm text-muted mt-1">EMI period: {transaction.emiPeriod}</p>
          )}
          {transaction.paidFrom && (
            <p className="text-sm text-muted mt-1">From: {transaction.paidFrom}</p>
          )}
          {transaction.paidTo && (
            <p className="text-sm text-muted mt-1">To: {transaction.paidTo}</p>
          )}
          {transaction.remark && <p className="text-sm mt-1">{transaction.remark}</p>}
          <p className="text-xs text-muted mt-2">{formatDate(transaction.date)}</p>
          {voidAllowed && (
            <button
              type="button"
              className="mt-3 text-xs text-red-400 hover:text-red-300"
              onClick={() => setConfirmOpen(true)}
              aria-label="Void this entry"
            >
              Void entry
            </button>
          )}
          {voidError && (
            <p className="text-xs text-red-400 mt-2" role="alert">
              {voidError}
            </p>
          )}
        </div>
        {transaction.attachments && transaction.attachments.length > 0 && (
          <AttachmentPreview attachments={transaction.attachments} />
        )}
      </div>

      {confirmOpen && (
        <ConfirmDialog
          title="Void this entry?"
          message="This removes it from the ledger, bank balances, and fair-share totals. Proof files stay in Documents."
          confirmLabel="Void entry"
          variant="danger"
          loading={voiding}
          onConfirm={() => void handleVoid()}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
