import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import AddEntryForm from '../../components/forms/AddEntryForm';
import ProjectTransactionsTab from '../../components/project/ProjectTransactionsTab';

type EntriesSubTab = 'add' | 'all' | 'mine';

/**
 * Project entries module — add entry, all entries, my history.
 */
export default function ProjectEntriesPage() {
  const { ventureId, refresh, isClosed } = useOutletContext<ProjectOutletContext>();
  const navigate = useNavigate();
  const [subTab, setSubTab] = useState<EntriesSubTab>(isClosed ? 'all' : 'add');
  const [refreshKey, setRefreshKey] = useState(0);

  /**
   * Reloads venture summary and switches to the all-entries list.
   */
  const handleEntrySuccess = async () => {
    await refresh();
    setRefreshKey((k) => k + 1);
    setSubTab('all');
  };

  const subTabs: { key: EntriesSubTab; label: string }[] = [
    ...(!isClosed ? [{ key: 'add' as const, label: '+ Add Entry' }] : []),
    { key: 'all', label: 'All Entries' },
    { key: 'mine', label: 'My History' },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Entries views">
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

      {subTab === 'add' && !isClosed && (
        <AddEntryForm
          ventureId={ventureId}
          readOnly={isClosed}
          onSuccess={() => {
            void handleEntrySuccess();
            navigate(`/app/project/${ventureId}/entries`);
          }}
        />
      )}

      {subTab === 'all' && (
        <ProjectTransactionsTab
          ventureId={ventureId}
          mode="all"
          refreshKey={refreshKey}
          canVoid={!isClosed}
          onVoided={() => {
            setRefreshKey((k) => k + 1);
            void refresh();
          }}
        />
      )}

      {subTab === 'mine' && (
        <ProjectTransactionsTab
          ventureId={ventureId}
          mode="mine"
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
