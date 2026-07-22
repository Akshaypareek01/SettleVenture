import { FormEvent, useEffect, useState } from 'react';
import { api, Venture } from '../../lib/api';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import ConfirmDialog from '../ui/ConfirmDialog';
import ListToolbar from '../ui/ListToolbar';
import PaginationBar from '../ui/PaginationBar';
import { ModalShell } from '../ui/ConfirmDialog';

interface Partner {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface Assignment {
  _id: string;
  partnerId: { _id: string; name: string; email: string };
  ventureId: { _id: string; name: string };
  loanAmount?: number;
  monthlyEmi?: number;
  emiStartDate?: string;
  tenureMonths?: number;
  isEmiActive?: boolean;
}

interface AssignFormProps {
  partners: Partner[];
  ventures: Venture[];
  onChanged: () => void;
}

/**
 * Admin form to assign partners and configure per-project EMI / loan.
 */
export default function AssignForm({ partners, ventures, onChanged }: AssignFormProps) {
  const list = usePaginatedList<Assignment>('/admin/assignments', {
    initialFilters: { partnerId: 'all', ventureId: 'all' },
  });
  const activePartners = partners.filter((p) => p.isActive);
  const [partnerId, setPartnerId] = useState('');
  const [ventureId, setVentureId] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [monthlyEmi, setMonthlyEmi] = useState('');
  const [emiStartDate, setEmiStartDate] = useState('');
  const [tenureMonths, setTenureMonths] = useState('');
  const [isEmiActive, setIsEmiActive] = useState(false);
  const [error, setError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<Assignment | null>(null);
  const [editTarget, setEditTarget] = useState<Assignment | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  useEffect(() => {
    if (activePartners.length && !partnerId) setPartnerId(activePartners[0]._id);
    if (ventures.length && !ventureId) setVentureId(ventures[0]._id);
  }, [activePartners, ventures, partnerId, ventureId]);

  const handleAssign = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/assignments', {
        method: 'POST',
        body: JSON.stringify({
          partnerId,
          ventureId,
          isEmiActive,
          ...(loanAmount !== '' ? { loanAmount: parseFloat(loanAmount) } : {}),
          ...(monthlyEmi !== '' ? { monthlyEmi: parseFloat(monthlyEmi) } : {}),
          ...(emiStartDate ? { emiStartDate } : {}),
          ...(tenureMonths !== '' ? { tenureMonths: parseInt(tenureMonths, 10) } : {}),
        }),
      });
      setLoanAmount('');
      setMonthlyEmi('');
      setEmiStartDate('');
      setTenureMonths('');
      setIsEmiActive(false);
      onChanged();
      list.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setConfirmLoading(true);
    try {
      await api('/admin/assignments', {
        method: 'DELETE',
        body: JSON.stringify({
          partnerId: removeTarget.partnerId._id,
          ventureId: removeTarget.ventureId._id,
        }),
      });
      setRemoveTarget(null);
      onChanged();
      list.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleAssign} className="card max-w-lg space-y-4" aria-label="Assign partner">
        <h3 className="font-semibold">Assign Partner to Project</h3>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <select
          className="input-field"
          value={partnerId}
          onChange={(e) => setPartnerId(e.target.value)}
          aria-label="Select partner"
          required
        >
          {activePartners.length === 0 ? (
            <option value="">No active partners — create or reactivate a user</option>
          ) : (
            activePartners.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.email})
              </option>
            ))
          )}
        </select>
        {partners.some((p) => !p.isActive) && (
          <p className="text-xs text-muted">Inactive partners are hidden from this list.</p>
        )}
        <select
          className="input-field"
          value={ventureId}
          onChange={(e) => setVentureId(e.target.value)}
          aria-label="Select project"
        >
          {ventures.map((v) => (
            <option key={v._id} value={v._id}>
              {v.name}
            </option>
          ))}
        </select>

        <div className="border-t border-border pt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isEmiActive}
              onChange={(e) => setIsEmiActive(e.target.checked)}
            />
            Enable EMI / loan for this assignment
          </label>
          {isEmiActive && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className="input-field"
                type="number"
                min="0"
                step="1"
                placeholder="Loan amount"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                aria-label="Loan amount"
              />
              <input
                className="input-field"
                type="number"
                min="0"
                step="1"
                placeholder="Monthly EMI"
                value={monthlyEmi}
                onChange={(e) => setMonthlyEmi(e.target.value)}
                aria-label="Monthly EMI"
              />
              <input
                className="input-field"
                type="date"
                value={emiStartDate}
                onChange={(e) => setEmiStartDate(e.target.value)}
                aria-label="EMI start date"
              />
              <input
                className="input-field"
                type="number"
                min="1"
                step="1"
                placeholder="Tenure (months)"
                value={tenureMonths}
                onChange={(e) => setTenureMonths(e.target.value)}
                aria-label="Tenure months"
              />
            </div>
          )}
        </div>
        <button type="submit" className="btn-primary">
          Assign
        </button>
      </form>

      <div className="card">
        <h3 className="font-semibold mb-4">Current Assignments</h3>
        <ListToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchPlaceholder="Search partner or project..."
          filters={[
            {
              key: 'partnerId',
              label: 'Filter by partner',
              value: list.filters.partnerId ?? 'all',
              options: [
                { value: 'all', label: 'All partners' },
                ...partners.map((p) => ({
                  value: p._id,
                  label: p.isActive ? p.name : `${p.name} (inactive)`,
                })),
              ],
            },
            {
              key: 'ventureId',
              label: 'Filter by project',
              value: list.filters.ventureId ?? 'all',
              options: [
                { value: 'all', label: 'All projects' },
                ...ventures.map((v) => ({ value: v._id, label: v.name })),
              ],
            },
          ]}
          onFilterChange={list.setFilter}
        />
        {list.error && <p className="text-red-400 text-sm mb-3">{list.error}</p>}
        {list.loading ? (
          <p className="text-muted text-sm animate-pulse">Loading assignments...</p>
        ) : list.items.length === 0 ? (
          <p className="text-muted text-sm">No assignments found.</p>
        ) : (
          <ul className="space-y-2">
            {list.items.map((a) => (
              <li
                key={a._id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm py-2 border-b border-border/50"
              >
                <div>
                  <span className="font-medium">{a.partnerId.name}</span>
                  <span className="text-muted"> → </span>
                  <span>{a.ventureId.name}</span>
                  {a.isEmiActive && (
                    <p className="text-xs text-muted mt-0.5">
                      EMI active · loan {a.loanAmount ?? 0} · monthly {a.monthlyEmi ?? 0}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditTarget(a)}
                    className="text-xs px-2 py-1 rounded-lg border border-border text-muted hover:text-zinc-100"
                    aria-label={`Edit EMI for ${a.partnerId.name}`}
                  >
                    EMI
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(a)}
                    className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded-lg border border-red-500/30 hover:bg-red-500/10"
                    aria-label={`Remove ${a.partnerId.name} from ${a.ventureId.name}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
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

      {removeTarget && (
        <ConfirmDialog
          title="Remove assignment?"
          message={
            <>
              Remove <strong className="text-zinc-100">{removeTarget.partnerId.name}</strong> from{' '}
              <strong className="text-zinc-100">{removeTarget.ventureId.name}</strong>? They will lose
              access to that project.
            </>
          }
          confirmLabel="Remove"
          variant="danger"
          loading={confirmLoading}
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}

      {editTarget && (
        <EditEmiModal
          assignment={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            onChanged();
            list.refresh();
          }}
        />
      )}
    </div>
  );
}

interface EditEmiModalProps {
  assignment: Assignment;
  onClose: () => void;
  onSaved: () => void;
}

/** Modal to edit EMI fields on an existing assignment. */
function EditEmiModal({ assignment, onClose, onSaved }: EditEmiModalProps) {
  const [loanAmount, setLoanAmount] = useState(String(assignment.loanAmount ?? ''));
  const [monthlyEmi, setMonthlyEmi] = useState(String(assignment.monthlyEmi ?? ''));
  const [emiStartDate, setEmiStartDate] = useState(
    assignment.emiStartDate ? assignment.emiStartDate.slice(0, 10) : ''
  );
  const [tenureMonths, setTenureMonths] = useState(String(assignment.tenureMonths ?? ''));
  const [isEmiActive, setIsEmiActive] = useState(!!assignment.isEmiActive);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/admin/assignments/${assignment._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          isEmiActive,
          loanAmount: loanAmount === '' ? 0 : parseFloat(loanAmount),
          monthlyEmi: monthlyEmi === '' ? 0 : parseFloat(monthlyEmi),
          emiStartDate: emiStartDate || null,
          tenureMonths: tenureMonths === '' ? null : parseInt(tenureMonths, 10),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setSaving(false);
    }
  };

  return (
    <ModalShell
      title={`EMI — ${assignment.partnerId.name} / ${assignment.ventureId.name}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isEmiActive}
            onChange={(e) => setIsEmiActive(e.target.checked)}
          />
          EMI active
        </label>
        <input
          className="input-field"
          type="number"
          min="0"
          placeholder="Loan amount"
          value={loanAmount}
          onChange={(e) => setLoanAmount(e.target.value)}
          aria-label="Loan amount"
        />
        <input
          className="input-field"
          type="number"
          min="0"
          placeholder="Monthly EMI"
          value={monthlyEmi}
          onChange={(e) => setMonthlyEmi(e.target.value)}
          aria-label="Monthly EMI"
        />
        <input
          className="input-field"
          type="date"
          value={emiStartDate}
          onChange={(e) => setEmiStartDate(e.target.value)}
          aria-label="EMI start date"
        />
        <input
          className="input-field"
          type="number"
          min="1"
          placeholder="Tenure months"
          value={tenureMonths}
          onChange={(e) => setTenureMonths(e.target.value)}
          aria-label="Tenure months"
        />
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Saving...' : 'Save EMI'}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
