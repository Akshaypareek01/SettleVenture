import { useOutletContext } from 'react-router-dom';
import type { ProjectOutletContext } from '../../components/project/ProjectLayout';

interface ProjectComingSoonPageProps {
  title: string;
  phaseHint: string;
}

/**
 * Placeholder module page until a later phase ships.
 * @param title - Section heading
 * @param phaseHint - Short note about when it arrives
 */
export default function ProjectComingSoonPage({ title, phaseHint }: ProjectComingSoonPageProps) {
  useOutletContext<ProjectOutletContext>();

  return (
    <section className="card max-w-lg" aria-labelledby="coming-soon-heading">
      <h2 id="coming-soon-heading" className="text-xl font-semibold mb-2">
        {title}
      </h2>
      <p className="text-muted text-sm">Coming in next phase — {phaseHint}</p>
    </section>
  );
}
