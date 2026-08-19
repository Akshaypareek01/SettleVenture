import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import ProjectFairShareOverview from '../../components/project/ProjectFairShareOverview';
import ProjectTransactionsTab from '../../components/project/ProjectTransactionsTab';
import AddPartnerTransferForm from '../../components/forms/AddPartnerTransferForm';
import { api, SuggestedPayment, VentureFairShare } from '../../lib/api';

type FairShareSubTab = 'overview' | 'transfer' | 'history';

/**
 * Project fair-share module — investment, expenses, EMI, and partner transfers.
 */
export default function ProjectFairSharePage() {
  const { ventureId, refresh, isClosed } = useOutletContext<ProjectOutletContext>();
  const [subTab, setSubTab] = useState<FairShareSubTab>('overview');
  const [data, setData] = useState<VentureFairShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [transferPreset, setTransferPreset] = useState<{
    fromPartnerId?: string;
    toPartnerId?: string;
    amount?: number;
  } | null>(null);

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
    setTransferPreset(null);
    setRefreshKey((k) => k + 1);
    setSubTab('history');
  };

  /**
   * Opens the transfer form prefilled from a suggested payment.
   * @param pay - Combined suggested A→B payment
   */
  const handleSettle = (pay: SuggestedPayment) => {
    if (isClosed) return;
    setTransferPreset({
      fromPartnerId: pay.fromPartnerId,
      toPartnerId: pay.toPartnerId,
      amount: pay.amount,
    });
    setSubTab('transfer');
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
          Equal share of partner investment, direct expenses, and personal EMI. One transfer
          clears remaining balances between two partners.
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
          {!loading && !error && data && (
            <ProjectFairShareOverview
              data={data}
              onSettle={isClosed ? undefined : handleSettle}
            />
          )}
        </>
      )}

      {subTab === 'transfer' && !isClosed && (
        <AddPartnerTransferForm
          key={`${transferPreset?.fromPartnerId ?? ''}-${transferPreset?.toPartnerId ?? ''}-${transferPreset?.amount ?? ''}`}
          ventureId={ventureId}
          readOnly={isClosed}
          preset={transferPreset ?? undefined}
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
