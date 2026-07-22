import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate, formatINR, formatSignedINR, settlementLabel } from '../lib/format';
import {
  transactionTypeBadgeClass,
  transactionTypeLabel,
} from '../lib/transactionTypes';
import AttachmentPreview from '../components/ui/AttachmentPreview';

interface PartnerAnalyticsData {
  venture: { id: string; name: string };
  partner: { id: string; name: string; email: string };
  totals: {
    depositedToPool: number;
    directExpenses: number;
    totalContributed: number;
    pctOfTotal: number;
    entryCount: number;
    investmentCount: number;
    expenseCount: number;
    poolPaymentCount: number;
    earningsTotal?: number;
    earningsCount?: number;
    emiPaidTotal?: number;
    emiCount?: number;
  };
  settlement: {
    fairShare: number;
    netBalance: number;
    status: string;
  } | null;
  byType: { type: string; count: number; total: number }[];
  entries: {
    _id: string;
    type: string;
    amount: number;
    date: string;
    paidFrom?: string;
    paidTo?: string;
    remark?: string;
    attachments: { id: string; fileName: string; fileType: string; downloadUrl: string }[];
  }[];
}

/**
 * Downloads partner CSV report via authenticated fetch.
 * @param ventureId - Project id
 * @param partnerId - Partner id
 * @param fileName - Suggested download name
 */
async function downloadPartnerReport(
  ventureId: string,
  partnerId: string,
  fileName: string
): Promise<void> {
  const res = await fetch(`/api/ventures/${ventureId}/partners/${partnerId}/report.csv`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to download report');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Individual partner analytics for a project — totals, entry log, settlement, CSV export.
 */
export default function PartnerAnalyticsPage() {
  const { id, partnerId } = useParams<{ id: string; partnerId: string }>();
  const [data, setData] = useState<PartnerAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    if (!id || !partnerId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api<PartnerAnalyticsData>(
        `/ventures/${id}/partners/${partnerId}/analytics`
      );
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load partner analytics');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id, partnerId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async () => {
    if (!id || !partnerId || !data) return;
    setDownloading(true);
    setError('');
    try {
      const safePartner = data.partner.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeVenture = data.venture.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadPartnerReport(id, partnerId, `${safePartner}-${safeVenture}-report.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-muted animate-pulse">Loading partner analytics...</div>;
  }

  if (!data) {
    return (
      <div className="p-8 max-w-5xl">
        <Link
          to={`/app/project/${id}/analysis`}
          className="inline-flex items-center gap-2 text-muted hover:text-zinc-100 text-sm mb-6"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to project
        </Link>
        <div className="card text-red-400">{error || 'Partner analytics not found.'}</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <Link
        to={`/app/project/${id}/analysis`}
        className="inline-flex items-center gap-2 text-muted hover:text-zinc-100 text-sm"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Back to {data.venture.name}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-sm text-muted mb-1">{data.venture.name}</p>
          <h1 className="text-3xl font-bold">{data.partner.name}</h1>
          <p className="text-sm text-muted mt-1">{data.partner.email}</p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="btn-primary inline-flex items-center gap-2"
          aria-label="Download partner report CSV"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {downloading ? 'Downloading...' : 'Download Report'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm" role="alert">
          {error}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-muted mb-1">Partner Investment</p>
          <p className="text-2xl font-bold text-accent">{formatINR(data.totals.depositedToPool)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Direct Expenses</p>
          <p className="text-2xl font-bold text-amber-300">{formatINR(data.totals.directExpenses)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Total Contributed</p>
          <p className="text-2xl font-bold">{formatINR(data.totals.totalContributed)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Share of project</p>
          <p className="text-2xl font-bold">{(data.totals.pctOfTotal * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-muted mb-1">Total entries</p>
          <p className="text-xl font-semibold">{data.totals.entryCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Investments</p>
          <p className="text-xl font-semibold text-accent">{data.totals.investmentCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Expenses</p>
          <p className="text-xl font-semibold text-amber-300">{data.totals.expenseCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">Earnings</p>
          <p className="text-xl font-semibold text-emerald-300">
            {formatINR(data.totals.earningsTotal ?? 0)} ({data.totals.earningsCount ?? 0})
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-muted mb-1">EMI paid</p>
          <p className="text-xl font-semibold text-violet-300">
            {formatINR(data.totals.emiPaidTotal ?? 0)} ({data.totals.emiCount ?? 0})
          </p>
        </div>
      </div>

      {data.settlement && (
        <div className="card overflow-x-auto">
          <h2 className="font-semibold mb-4">Settlement for this partner</h2>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted mb-1">Fair share</p>
              <p className="text-lg font-semibold">{formatINR(data.settlement.fairShare)}</p>
            </div>
            <div>
              <p className="text-muted mb-1">Net balance</p>
              <p className={`text-lg font-semibold ${data.settlement.netBalance >= 0 ? 'text-accent' : 'text-red-400'}`}>
                {formatSignedINR(data.settlement.netBalance)}
              </p>
            </div>
            <div>
              <p className="text-muted mb-1">Status</p>
              <p className="text-lg font-semibold">{settlementLabel(data.settlement.status)}</p>
            </div>
          </div>
        </div>
      )}

      {data.byType.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="font-semibold mb-4">Breakdown by entry type</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left py-2 pr-4">Type</th>
                <th className="text-right py-2 px-4">Entries</th>
                <th className="text-right py-2 pl-4">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.byType.map((row) => (
                <tr key={row.type} className="border-b border-border/50">
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${transactionTypeBadgeClass(row.type)}`}>
                      {transactionTypeLabel(row.type)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">{row.count}</td>
                  <td className="py-3 pl-4 text-right font-semibold">{formatINR(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="font-semibold text-lg">Entry log</h2>
        {data.entries.length === 0 ? (
          <div className="card text-center py-8 text-muted">No entries from this partner yet.</div>
        ) : (
          data.entries.map((entry) => (
            <div key={entry._id} className="card">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${transactionTypeBadgeClass(entry.type)}`}>
                      {transactionTypeLabel(entry.type)}
                    </span>
                    <span className="text-xs text-muted">{formatDate(entry.date)}</span>
                  </div>
                  <p className="text-2xl font-bold text-accent">{formatINR(entry.amount)}</p>
                  {entry.paidFrom && <p className="text-sm text-muted mt-2">From: {entry.paidFrom}</p>}
                  {entry.paidTo && <p className="text-sm text-muted mt-1">To: {entry.paidTo}</p>}
                  {entry.remark && <p className="text-sm mt-1">{entry.remark}</p>}
                </div>
                {entry.attachments.length > 0 && (
                  <AttachmentPreview attachments={entry.attachments} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
