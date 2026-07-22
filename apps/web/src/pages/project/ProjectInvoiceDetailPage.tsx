import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, Upload, X } from 'lucide-react';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import { api, apiUpload, BankAccount, Invoice, Venture } from '../../lib/api';
import { formatINR } from '../../lib/format';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

/**
 * Invoice detail, print view, issue/cancel/mark-paid actions.
 */
export default function ProjectInvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { ventureId, refresh, isClosed } = useOutletContext<ProjectOutletContext>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showMarkPaid, setShowMarkPaid] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'issue' | 'cancel' | null>(null);

  const load = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError('');
    try {
      const data = await api<Invoice>(`/ventures/${ventureId}/invoices/${invoiceId}`);
      setInvoice(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [ventureId, invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Issues or cancels the current invoice.
   * @param action - issue | cancel
   */
  const runAction = async (action: 'issue' | 'cancel') => {
    if (!invoiceId) return;
    setBusy(true);
    setActionError('');
    try {
      const updated = await api<Invoice>(`/ventures/${ventureId}/invoices/${invoiceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      setInvoice(updated);
      setConfirmAction(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
      setConfirmAction(null);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-muted animate-pulse">Loading invoice...</p>;
  if (error || !invoice) {
    return (
      <div className="card">
        <p className="text-red-400 text-sm mb-3">{error || 'Not found'}</p>
        <Link to={`/app/project/${ventureId}/invoices`} className="text-accent text-sm">
          Back to invoices
        </Link>
      </div>
    );
  }

  const snap = invoice.companySnapshot;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={`/app/project/${ventureId}/invoices`}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-zinc-100"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Invoices
        </Link>
        <div className="flex flex-wrap gap-2">
          {!isClosed && invoice.status === 'draft' && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => setConfirmAction('issue')}
            >
              Issue invoice
            </button>
          )}
          {!isClosed && (invoice.status === 'draft' || invoice.status === 'issued') && (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => setConfirmAction('cancel')}
            >
              Cancel
            </button>
          )}
          {!isClosed && invoice.status === 'issued' && (
            <button type="button" className="btn-primary" onClick={() => setShowMarkPaid(true)}>
              Mark paid
            </button>
          )}
          <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => window.print()}>
            <Printer className="w-4 h-4" aria-hidden="true" />
            Print
          </button>
        </div>
      </div>

      {actionError && (
        <p className="text-red-400 text-sm print:hidden" role="alert">
          {actionError}
        </p>
      )}

      {confirmAction === 'issue' && (
        <ConfirmDialog
          title="Issue this invoice?"
          message="Requires company GSTIN in Admin → Company. A permanent invoice number will be assigned."
          confirmLabel="Issue"
          loading={busy}
          onConfirm={() => void runAction('issue')}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction === 'cancel' && (
        <ConfirmDialog
          title="Cancel this invoice?"
          message="Cancelled invoices cannot be reopened. Create a new draft if needed."
          confirmLabel="Cancel invoice"
          variant="danger"
          loading={busy}
          onConfirm={() => void runAction('cancel')}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {showMarkPaid && (
        <MarkPaidPanel
          ventureId={ventureId}
          invoiceId={invoice._id}
          onClose={() => setShowMarkPaid(false)}
          onDone={async () => {
            setShowMarkPaid(false);
            await load();
            await refresh();
          }}
        />
      )}

      <article className="card space-y-6 print:shadow-none print:border-0" aria-label="Invoice print view">
        <header className="flex flex-wrap justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-2xl font-bold">{snap?.firmName ?? 'Company'}</p>
            {snap?.address && <p className="text-sm text-muted mt-1 whitespace-pre-line">{snap.address}</p>}
            <p className="text-sm text-muted">
              {[snap?.city, snap?.state, snap?.pincode].filter(Boolean).join(', ')}
            </p>
            {snap?.gstin && <p className="text-sm mt-1">GSTIN: {snap.gstin}</p>}
            {snap?.phone && <p className="text-sm">Phone: {snap.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold">{invoice.number ?? 'DRAFT'}</p>
            <p className="text-sm capitalize text-muted">{invoice.status}</p>
            {invoice.issueDate && (
              <p className="text-sm text-muted mt-1">
                Issued {new Date(invoice.issueDate).toLocaleDateString('en-IN')}
              </p>
            )}
          </div>
        </header>

        <div>
          <p className="text-xs text-muted uppercase tracking-wide">Bill to</p>
          <p className="font-semibold mt-1">{invoice.customerName}</p>
          {invoice.customerAddress && (
            <p className="text-sm text-muted whitespace-pre-line">{invoice.customerAddress}</p>
          )}
          {invoice.customerGstin && <p className="text-sm">GSTIN: {invoice.customerGstin}</p>}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b border-border">
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 px-2 text-right">Qty</th>
              <th className="py-2 px-2 text-right">Rate</th>
              <th className="py-2 pl-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li, i) => (
              <tr key={i} className="border-b border-border/40">
                <td className="py-2 pr-2">{li.description}</td>
                <td className="py-2 px-2 text-right">{li.qty}</td>
                <td className="py-2 px-2 text-right">{formatINR(li.rate)}</td>
                <td className="py-2 pl-2 text-right">{formatINR(li.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto max-w-xs space-y-1 text-sm">
          <Row label="Taxable" value={formatINR(invoice.taxableAmount)} />
          {invoice.isInterState ? (
            <Row label={`IGST (${invoice.gstRate}%)`} value={formatINR(invoice.igst)} />
          ) : (
            <>
              <Row label={`CGST (${invoice.gstRate / 2}%)`} value={formatINR(invoice.cgst)} />
              <Row label={`SGST (${invoice.gstRate / 2}%)`} value={formatINR(invoice.sgst)} />
            </>
          )}
          <Row label="Total" value={formatINR(invoice.totalAmount)} bold />
        </div>

        {invoice.notes && (
          <p className="text-sm text-muted">
            <span className="font-medium text-zinc-200">Notes:</span> {invoice.notes}
          </p>
        )}

        {(snap?.bankName || snap?.bankAccountHint || snap?.ifsc) && (
          <footer className="border-t border-border pt-4 text-sm text-muted">
            <p className="font-medium text-zinc-200 mb-1">Bank details</p>
            <p>{[snap.bankName, snap.bankAccountHint, snap.ifsc].filter(Boolean).join(' · ')}</p>
          </footer>
        )}

        {invoice.status === 'paid' && (
          <p className="text-sm text-accent print:hidden">
            Paid into {invoice.linkedBankAccountLabel ?? 'project bank'} (earning recorded)
          </p>
        )}
      </article>
    </div>
  );
}

/** Label/value row for invoice totals. */
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${bold ? 'font-semibold text-base pt-1' : ''}`}>
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

interface MarkPaidPanelProps {
  ventureId: string;
  invoiceId: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}

/**
 * Collects bank account + proof and marks invoice paid (creates EARNING_IN).
 */
function MarkPaidPanel({ ventureId, invoiceId, onClose, onDone }: MarkPaidPanelProps) {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [paidFrom, setPaidFrom] = useState('Customer payment');
  const [remark, setRemark] = useState('Invoice payment received');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Venture>(`/ventures/${ventureId}`)
      .then((v) => {
        const active = (v.bankAccounts ?? []).filter((a) => a.isActive);
        setAccounts(active);
        if (active.length === 1) setBankAccountId(active[0]._id);
      })
      .catch(() => setError('Failed to load bank accounts'));
  }, [ventureId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!file) {
      setError('Proof is required');
      return;
    }
    if (!bankAccountId) {
      setError('Select a bank account');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ventureId', ventureId);
      const uploaded = await apiUpload<{ id: string }>('/files/upload', formData);
      await api(`/ventures/${ventureId}/invoices/${invoiceId}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({
          bankAccountId,
          paidFrom: paidFrom.trim(),
          remark: remark.trim(),
          attachmentIds: [uploaded.id],
          date: new Date().toISOString(),
        }),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mark paid failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="card space-y-3 print:hidden max-w-lg"
      aria-label="Mark invoice paid"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Mark paid → record earning</h3>
        <button type="button" onClick={onClose} aria-label="Close mark paid">
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <select
        className="input-field"
        value={bankAccountId}
        onChange={(e) => setBankAccountId(e.target.value)}
        required
        aria-label="Deposit bank account"
      >
        <option value="">Select project bank account</option>
        {accounts.map((a) => (
          <option key={a._id} value={a._id}>
            {a.label}
          </option>
        ))}
      </select>
      <input
        className="input-field"
        value={paidFrom}
        onChange={(e) => setPaidFrom(e.target.value)}
        required
        aria-label="Payment source"
        placeholder="Payment source"
      />
      <input
        className="input-field"
        value={remark}
        onChange={(e) => setRemark(e.target.value)}
        required
        aria-label="Remark"
        placeholder="Remark"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        aria-label="Upload payment proof"
      />
      <button
        type="button"
        className="w-full border border-dashed border-border rounded-xl py-4 text-sm text-muted"
        onClick={() => fileRef.current?.click()}
      >
        {file ? (
          <span className="inline-flex items-center gap-2">
            <Upload className="w-4 h-4" aria-hidden="true" />
            {file.name}
          </span>
        ) : (
          'Upload payment proof *'
        )}
      </button>
      <button type="submit" className="btn-primary w-full" disabled={submitting || !file}>
        {submitting ? 'Saving...' : 'Confirm paid + create earning'}
      </button>
    </form>
  );
}
