import { useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import ProjectAnalysisTab from '../../components/project/ProjectAnalysisTab';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Project analysis / settlement module.
 */
export default function ProjectAnalysisPage() {
  const { ventureId, summary } = useOutletContext<ProjectOutletContext>();
  const { user } = useAuth();

  if (!summary) {
    return (
      <p className="text-muted animate-pulse" role="status">
        Loading analysis...
      </p>
    );
  }

  return (
    <ProjectAnalysisTab
      ventureId={ventureId}
      summary={summary}
      showSettlement={user?.role === 'admin'}
    />
  );
}
