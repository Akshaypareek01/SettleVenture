import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api, BankAccountSummary, Venture, VentureSummary } from '../../lib/api';
import { formatINR } from '../../lib/format';
import { useProjectNav } from '../../contexts/ProjectNavContext';

interface ProjectOutletContext {
  ventureId: string;
  venture: Venture;
  summary: VentureSummary | null;
  refresh: () => Promise<void>;
  /** True when project status is closed — disable writes */
  isClosed: boolean;
}

/**
 * Project shell — header + KPIs; section navigation lives in the sidebar.
 */
export default function ProjectLayout() {
  const { id } = useParams<{ id: string }>();
  const { setProject } = useProjectNav();
  const [venture, setVenture] = useState<Venture | null>(null);
  const [summary, setSummary] = useState<VentureSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!id) return;
    const [v, sum] = await Promise.all([
      api<Venture>(`/ventures/${id}`),
      api<VentureSummary>(`/ventures/${id}/summary`),
    ]);
    setVenture(v);
    setSummary(sum);
    setError('');
    setProject({ id, name: v.name, isClosed: v.status === 'closed' });
  }, [id, setProject]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) {
          setVenture(null);
          setSummary(null);
          setProject(null);
          setError(err instanceof Error ? err.message : 'Failed to load project');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      setProject(null);
    };
  }, [id, refresh, setProject]);

  if (loading) {
    return (
      <div className="p-4 sm:p-8 text-muted animate-pulse" role="status">
        Loading project...
      </div>
    );
  }

  if (error || !venture || !id) {
    return (
      <div className="p-4 sm:p-8 max-w-lg space-y-4" role="alert">
        <p className="text-red-400">{error || 'Project not found'}</p>
        <Link to="/app" className="inline-flex items-center gap-2 text-sm text-accent hover:underline">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to projects
        </Link>
      </div>
    );
  }

  const isClosed = venture.status === 'closed';
  const bankTotal = summary?.byBankAccount?.reduce(
    (s: number, a: BankAccountSummary) => s + a.balance,
    0
  );

  const outletContext: ProjectOutletContext = {
    ventureId: id,
    venture,
    summary,
    refresh,
    isClosed,
  };

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold">{venture.name}</h1>
          <span
            className={`text-xs px-2.5 py-1 rounded-full border ${
              isClosed
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {isClosed ? 'Closed' : 'Active'}
          </span>
        </div>
        {isClosed && (
          <p className="mt-2 text-sm text-amber-300/90" role="status">
            This project is closed — viewing only. New entries, EMI, and invoice writes are disabled.
          </p>
        )}
        {summary && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Contributed" value={formatINR(summary.totalContributed)} accent />
            <Kpi label="Pool balance" value={formatINR(summary.poolBalance)} />
            <Kpi label="Earnings" value={formatINR(summary.earningsTotal ?? 0)} />
            <Kpi
              label="Bank cash"
              value={
                bankTotal !== undefined && (summary.byBankAccount?.length ?? 0) > 0
                  ? formatINR(bankTotal)
                  : '—'
              }
            />
          </div>
        )}
        <p className="sr-only lg:not-sr-only lg:block text-xs text-muted mt-3">
          Use the sidebar to switch between Entries, Bank, Earnings, EMI, and more.
        </p>
      </div>

      <Outlet context={outletContext} />
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string;
  accent?: boolean;
}

/** Compact header KPI tile. */
function Kpi({ label, value, accent }: KpiProps) {
  return (
    <div className="rounded-xl border border-border bg-elevated/40 px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 ${accent ? 'text-accent' : 'text-zinc-100'}`}>
        {value}
      </p>
    </div>
  );
}

export type { ProjectOutletContext };
