import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import AddEntryForm from '../../components/forms/AddEntryForm';
import ProjectTransactionsTab from '../../components/project/ProjectTransactionsTab';
import { formatINR } from '../../lib/format';

/**
 * Project earnings module — KPI + add earning + filtered list.
 */
export default function ProjectEarningsPage() {
  const { ventureId, summary, refresh, isClosed } = useOutletContext<ProjectOutletContext>();
  const [mode, setMode] = useState<'list' | 'add'>('list');
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * Reloads summary and returns to the earnings list.
   */
  const handleSuccess = async () => {
    await refresh();
    setRefreshKey((k) => k + 1);
    setMode('list');
  };

  return (
    <section aria-labelledby="earnings-heading">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 id="earnings-heading" className="text-xl font-semibold">
            Earnings
          </h2>
          <p className="text-sm text-muted mt-1">
            Total earnings:{' '}
            <span className="text-accent font-semibold">
              {formatINR(summary?.earningsTotal ?? 0)}
            </span>
            <span className="text-muted"> (not part of fair-share settlement)</span>
          </p>
        </div>
        {!isClosed && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setMode((m) => (m === 'list' ? 'add' : 'list'))}
          >
            {mode === 'list' ? '+ Log earning' : 'Back to list'}
          </button>
        )}
      </div>

      {mode === 'add' && !isClosed ? (
        <AddEntryForm
          ventureId={ventureId}
          presetType="EARNING_IN"
          onSuccess={() => void handleSuccess()}
        />
      ) : (
        <ProjectTransactionsTab
          ventureId={ventureId}
          mode="all"
          refreshKey={refreshKey}
          fixedType="EARNING_IN"
          canVoid={!isClosed}
          onVoided={() => {
            setRefreshKey((k) => k + 1);
            void refresh();
          }}
        />
      )}
    </section>
  );
}
