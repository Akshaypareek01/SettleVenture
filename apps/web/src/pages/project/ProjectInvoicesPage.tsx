import { FormEvent, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import { api, Invoice } from '../../lib/api';
import { formatINR } from '../../lib/format';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import ListToolbar from '../../components/ui/ListToolbar';
import PaginationBar from '../../components/ui/PaginationBar';

type LineDraft = { description: string; qty: string; rate: string };

/**
 * Project invoices list + create draft form.
 */
export default function ProjectInvoicesPage() {
  const { ventureId, isClosed } = useOutletContext<ProjectOutletContext>();
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const list = usePaginatedList<Invoice>(`/ventures/${ventureId}/invoices`, {
    enabled: !!ventureId,
    initialFilters: { status: 'all' },
  });

  const [customerName, setCustomerName] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [gstRate, setGstRate] = useState('18');
  const [isInterState, setIsInterState] = useState(false);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([{ description: '', qty: '1', rate: '' }]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const preview = useMemo(() => {
    const taxable = lines.reduce((s, l) => {
      const qty = parseFloat(l.qty) || 0;
      const rate = parseFloat(l.rate) || 0;
      return s + qty * rate;
    }, 0);
    const rate = parseFloat(gstRate) || 0;
    const gst = Math.round(taxable * (rate / 100) * 100) / 100;
    return { taxable, gst, total: Math.round((taxable + gst) * 100) / 100 };
  }, [lines, gstRate]);

  /**
   * Creates a draft invoice then returns to the list.
   * @param e - Form submit event
   */
  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const lineItems = lines
      .map((l) => ({
        description: l.description.trim(),
        qty: parseFloat(l.qty),
        rate: parseFloat(l.rate),
      }))
      .filter((l) => l.description && l.qty > 0 && l.rate >= 0);
    if (!lineItems.length) {
      setError('Add at least one line item');
      return;
    }
    setSubmitting(true);
    try {
      await api(`/ventures/${ventureId}/invoices`, {
        method: 'POST',
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerGstin: customerGstin.trim() || undefined,
          customerAddress: customerAddress.trim() || undefined,
          gstRate: parseFloat(gstRate) || 18,
          isInterState,
          notes: notes.trim() || undefined,
          lineItems,
        }),
      });
      setCustomerName('');
      setCustomerGstin('');
      setCustomerAddress('');
      setNotes('');
      setLines([{ description: '', qty: '1', rate: '' }]);
      setMode('list');
      list.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === 'create' && !isClosed) {
    return (
      <section className="space-y-4" aria-labelledby="create-invoice-heading">
        <button type="button" className="text-sm text-muted hover:text-zinc-100" onClick={() => setMode('list')}>
          ← Back to invoices
        </button>
        <form onSubmit={handleCreate} className="card max-w-2xl space-y-4" aria-label="Create invoice">
          <h2 id="create-invoice-heading" className="text-xl font-semibold">
            New invoice (draft)
          </h2>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <input
            className="input-field"
            placeholder="Customer / vendor name *"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
            aria-label="Customer name"
          />
          <input
            className="input-field"
            placeholder="Customer GSTIN (optional)"
            value={customerGstin}
            onChange={(e) => setCustomerGstin(e.target.value)}
            aria-label="Customer GSTIN"
          />
          <textarea
            className="input-field min-h-[64px] resize-none"
            placeholder="Customer address (optional)"
            value={customerAddress}
            onChange={(e) => setCustomerAddress(e.target.value)}
            aria-label="Customer address"
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              className="input-field"
              type="number"
              min="0"
              step="0.01"
              value={gstRate}
              onChange={(e) => setGstRate(e.target.value)}
              aria-label="GST rate percent"
              placeholder="GST %"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isInterState}
                onChange={(e) => setIsInterState(e.target.checked)}
              />
              Inter-state (IGST)
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Line items</p>
              <button
                type="button"
                className="text-xs text-accent"
                onClick={() => setLines((prev) => [...prev, { description: '', qty: '1', rate: '' }])}
              >
                + Add line
              </button>
            </div>
            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  className="input-field col-span-6"
                  placeholder="Description"
                  value={line.description}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l))
                    )
                  }
                  aria-label={`Line ${idx + 1} description`}
                />
                <input
                  className="input-field col-span-2"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Qty"
                  value={line.qty}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, qty: e.target.value } : l))
                    )
                  }
                  aria-label={`Line ${idx + 1} qty`}
                />
                <input
                  className="input-field col-span-3"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Rate"
                  value={line.rate}
                  onChange={(e) =>
                    setLines((prev) =>
                      prev.map((l, i) => (i === idx ? { ...l, rate: e.target.value } : l))
                    )
                  }
                  aria-label={`Line ${idx + 1} rate`}
                />
                <button
                  type="button"
                  className="col-span-1 text-red-400 text-xs"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label={`Remove line ${idx + 1}`}
                  disabled={lines.length === 1}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <p className="text-sm text-muted">
            Taxable {formatINR(preview.taxable)} · GST {formatINR(preview.gst)} · Total{' '}
            <span className="text-accent font-semibold">{formatINR(preview.total)}</span>
          </p>
          <textarea
            className="input-field min-h-[64px] resize-none"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Notes"
          />
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save draft'}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="invoices-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="invoices-heading" className="text-xl font-semibold">
          Invoices
        </h2>
        {!isClosed && (
          <button type="button" className="btn-primary" onClick={() => setMode('create')}>
            + New invoice
          </button>
        )}
      </div>

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search customer or number..."
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: list.filters.status ?? 'all',
            options: [
              { value: 'all', label: 'All' },
              { value: 'draft', label: 'Draft' },
              { value: 'issued', label: 'Issued' },
              { value: 'paid', label: 'Paid' },
              { value: 'cancelled', label: 'Cancelled' },
            ],
          },
        ]}
        onFilterChange={list.setFilter}
      />

      {list.error && <p className="text-red-400 text-sm">{list.error}</p>}
      {list.loading ? (
        <p className="text-muted animate-pulse">Loading invoices...</p>
      ) : list.items.length === 0 ? (
        <div className="card text-sm text-muted">No invoices yet.</div>
      ) : (
        <ul className="space-y-2" aria-label="Invoice list">
          {list.items.map((inv) => (
            <li key={inv._id}>
              <Link
                to={`/app/project/${ventureId}/invoices/${inv._id}`}
                className="card flex flex-wrap items-center justify-between gap-3 hover:border-accent/40 transition-colors"
              >
                <div>
                  <p className="font-medium">
                    {inv.number ?? 'Draft'} · {inv.customerName}
                  </p>
                  <p className="text-xs text-muted capitalize mt-0.5">{inv.status}</p>
                </div>
                <p className="font-semibold text-accent">{formatINR(inv.totalAmount)}</p>
              </Link>
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
    </section>
  );
}
