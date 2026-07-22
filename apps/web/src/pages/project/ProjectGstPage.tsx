import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import { api, GstSummary } from '../../lib/api';
import { formatINR } from '../../lib/format';

/**
 * Invoice-centric GST summary for the project with period filter + CSV export.
 */
export default function ProjectGstPage() {
  const { ventureId } = useOutletContext<ProjectOutletContext>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<GstSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const summary = await api<GstSummary>(`/ventures/${ventureId}/gst-summary${suffix}`);
      setData(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GST');
    } finally {
      setLoading(false);
    }
  }, [ventureId, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const csv = useMemo(() => {
    if (!data) return '';
    const header = 'Period,Invoices,Taxable,GST,CGST,SGST,IGST,Total';
    const rows = data.byMonth.map(
      (r) =>
        `${r.period},${r.invoiceCount},${r.taxableAmount},${r.gstAmount},${r.cgst},${r.sgst},${r.igst},${r.totalAmount}`
    );
    const total = `TOTAL,${data.totals.invoiceCount},${data.totals.taxableAmount},${data.totals.gstAmount},${data.totals.cgst},${data.totals.sgst},${data.totals.igst},${data.totals.totalAmount}`;
    return [header, ...rows, total].join('\n');
  }, [data]);

  /**
   * Downloads the loaded GST table as CSV.
   */
  const downloadCsv = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gst-summary-${ventureId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6" aria-labelledby="gst-heading">
      <div>
        <h2 id="gst-heading" className="text-xl font-semibold">
          GST summary
        </h2>
        <p className="text-sm text-muted mt-1">
          From issued and paid invoices only (invoice-centric).
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="gst-from" className="block text-xs text-muted mb-1">
            From
          </label>
          <input
            id="gst-from"
            type="date"
            className="input-field"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="gst-to" className="block text-xs text-muted mb-1">
            To
          </label>
          <input
            id="gst-to"
            type="date"
            className="input-field"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary" onClick={() => void load()}>
          Apply
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={downloadCsv}
          disabled={!data || data.byMonth.length === 0}
        >
          Download CSV
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading ? (
        <p className="text-muted animate-pulse">Loading GST...</p>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Invoices" value={String(data.totals.invoiceCount)} />
            <Kpi label="Taxable" value={formatINR(data.totals.taxableAmount)} />
            <Kpi label="GST collected" value={formatINR(data.totals.gstAmount)} />
            <Kpi label="Invoice total" value={formatINR(data.totals.totalAmount)} />
          </div>

          <div className="card overflow-x-auto">
            {data.byMonth.length === 0 ? (
              <p className="text-sm text-muted">No issued/paid invoices in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="py-2 pr-3">Month</th>
                    <th className="py-2 px-3 text-right">Invoices</th>
                    <th className="py-2 px-3 text-right">Taxable</th>
                    <th className="py-2 px-3 text-right">GST</th>
                    <th className="py-2 px-3 text-right">CGST</th>
                    <th className="py-2 px-3 text-right">SGST</th>
                    <th className="py-2 px-3 text-right">IGST</th>
                    <th className="py-2 pl-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byMonth.map((r) => (
                    <tr key={r.period} className="border-b border-border/40">
                      <td className="py-2 pr-3 font-medium">{r.period}</td>
                      <td className="py-2 px-3 text-right">{r.invoiceCount}</td>
                      <td className="py-2 px-3 text-right">{formatINR(r.taxableAmount)}</td>
                      <td className="py-2 px-3 text-right">{formatINR(r.gstAmount)}</td>
                      <td className="py-2 px-3 text-right">{formatINR(r.cgst)}</td>
                      <td className="py-2 px-3 text-right">{formatINR(r.sgst)}</td>
                      <td className="py-2 px-3 text-right">{formatINR(r.igst)}</td>
                      <td className="py-2 pl-3 text-right font-medium">{formatINR(r.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Small KPI card. */
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card py-3 px-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-semibold text-accent mt-1">{value}</p>
    </div>
  );
}
