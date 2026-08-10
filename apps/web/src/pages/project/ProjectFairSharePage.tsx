import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import ProjectFairShareOverview from '../../components/project/ProjectFairShareOverview';
import ProjectTransactionsTab from '../../components/project/ProjectTransactionsTab';
import AddPartnerTransferForm from '../../components/forms/AddPartnerTransferForm';
import { api, VentureFairShare } from '../../lib/api';

type FairShareSubTab = 'overview' | 'transfer' | 'history';

/**
 * Project fair-share module — split investment/expense nets + partner transfers.
 */
export default function ProjectFairSharePage() {
  const { ventureId, refresh, isClosed } = useOutletContext<ProjectOutletContext>();
  const [subTab, setSubTab] = useState<FairShareSubTab>('overview');
  const [data, setData] = useState<VentureFairShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * Loads fair-share buckets from the API.
   */
  const loadFairShare = useCallback(async () => {
    if (!ventureId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api<VentureFairShare>(`/ventures/${ventureId}/fair-share`);
      setData(result);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Failed to load fair share');
    } finally {
      setLoading(false);
    }
  }, [ventureId]);

  useEffect(() => {
    void loadFairShare();
  }, [loadFairShare, refreshKey]);

  /**
   * After a transfer, refresh fair-share + project summary and show history.
   */
  const handleTransferSuccess = async () => {
    await refresh();
    setRefreshKey((k) => k + 1);
    setSubTab('history');
  };

  const subTabs: { key: FairShareSubTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    ...(!isClosed ? [{ key: 'transfer' as const, label: '+ Transfer' }] : []),
    { key: 'history', label: 'History' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Fair Share</h2>
        <p className="text-sm text-muted mt-1">
          Equal share for partner investment and direct expenses. Log personal transfers when one
          partner pays another to settle.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Fair share views">
        {subTabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={subTab === key}
            onClick={() => setSubTab(key)}
            className={`nav-pill ${subTab === key ? 'nav-pill-active' : 'nav-pill-inactive'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'overview' && (
        <>
          {loading && (
            <p className="text-muted animate-pulse" role="status">
              Loading fair share...
            </p>
          )}
          {error && (
            <p className="text-red-400" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && data && <ProjectFairShareOverview data={data} />}
        </>
      )}

      {subTab === 'transfer' && !isClosed && (
        <AddPartnerTransferForm
          ventureId={ventureId}
          readOnly={isClosed}
          onSuccess={() => {
            void handleTransferSuccess();
          }}
        />
      )}

      {subTab === 'history' && (
        <ProjectTransactionsTab
          ventureId={ventureId}
          mode="all"
          fixedType="PARTNER_TRANSFER"
          refreshKey={refreshKey}
          canVoid={!isClosed}
          onVoided={() => {
            setRefreshKey((k) => k + 1);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
