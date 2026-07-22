import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface ProjectNavInfo {
  id: string;
  name: string;
  isClosed: boolean;
}

interface ProjectNavContextValue {
  project: ProjectNavInfo | null;
  /** Registers the open project for sidebar navigation */
  setProject: (project: ProjectNavInfo | null) => void;
}

const ProjectNavContext = createContext<ProjectNavContextValue | null>(null);

/**
 * Holds the currently open project so AppShell can show section links in the sidebar.
 */
export function ProjectNavProvider({ children }: { children: ReactNode }) {
  const [project, setProjectState] = useState<ProjectNavInfo | null>(null);

  const setProject = useCallback((next: ProjectNavInfo | null) => {
    setProjectState(next);
  }, []);

  const value = useMemo(() => ({ project, setProject }), [project, setProject]);

  return (
    <ProjectNavContext.Provider value={value}>{children}</ProjectNavContext.Provider>
  );
}

/**
 * Access project sidebar registration.
 */
export function useProjectNav() {
  const ctx = useContext(ProjectNavContext);
  if (!ctx) throw new Error('useProjectNav must be used within ProjectNavProvider');
  return ctx;
}
