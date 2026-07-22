import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';
import ProjectDocumentsTab from '../../components/project/ProjectDocumentsTab';

/**
 * Project documents module.
 */
export default function ProjectDocumentsPage() {
  const { ventureId } = useOutletContext<ProjectOutletContext>();
  const [refreshKey] = useState(0);

  return <ProjectDocumentsTab ventureId={ventureId} refreshKey={refreshKey} />;
}
