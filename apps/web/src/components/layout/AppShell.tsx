import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LogOut, Menu, TrendingUp, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ProjectNavProvider, useProjectNav } from '../../contexts/ProjectNavContext';
import { formatINR } from '../../lib/format';
import { ADMIN_NAV, GLOBAL_NAV, projectNavLinks } from '../../lib/sidebarNav';

/**
 * Wraps the shell with project-nav context for sidebar section links.
 */
export default function AppShell() {
  return (
    <ProjectNavProvider>
      <AppShellInner />
    </ProjectNavProvider>
  );
}

/**
 * Main app shell with context-aware sidebar (global / project / admin sections).
 */
function AppShellInner() {
  const { user, logout } = useAuth();
  const { project } = useProjectNav();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdminArea = location.pathname.startsWith('/app/admin');

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  /**
   * NavLink class for primary sidebar items.
   */
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-colors ${
      isActive
        ? 'bg-accent/10 text-accent border border-accent/20'
        : 'text-muted hover:text-zinc-100 hover:bg-elevated'
    }`;

  /**
   * Nested section link (slightly indented).
   */
  const sectionLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 pl-4 pr-3 py-2 rounded-xl text-sm transition-colors ${
      isActive
        ? 'bg-accent/10 text-accent border border-accent/20'
        : 'text-muted hover:text-zinc-100 hover:bg-elevated'
    }`;

  const sidebar = (
    <>
      <div className="p-5 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-black" aria-hidden="true" />
            </div>
            <span className="font-bold text-lg truncate">ApexLedger</span>
          </div>
          <button
            type="button"
            className="lg:hidden p-2 text-muted hover:text-zinc-100"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto" aria-label="Sidebar menu">
        <div className="space-y-1">
          {GLOBAL_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navLinkClass}>
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>

        {project && (
          <div className="space-y-1">
            <div className="px-3 mb-1">
              <p className="text-[11px] uppercase tracking-wide text-muted font-medium">Project</p>
              <p className="text-sm font-semibold text-zinc-100 truncate mt-0.5" title={project.name}>
                {project.name}
              </p>
              {project.isClosed && (
                <p className="text-xs text-amber-300 mt-0.5">Closed · view only</p>
              )}
            </div>
            <NavLink to="/app" end className={sectionLinkClass}>
              <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
              All projects
            </NavLink>
            {projectNavLinks(project.id).map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={sectionLinkClass}>
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </div>
        )}

        {user?.role === 'admin' && (
          <div className="space-y-1">
            <p className="px-3 text-[11px] uppercase tracking-wide text-muted font-medium">Admin</p>
            {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={sectionLinkClass}>
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="px-3 py-2 mb-1">
          <p className="font-medium text-sm truncate">{user?.name}</p>
          <p className="text-xs text-muted truncate">{user?.email}</p>
          {user?.role === 'partner' && user.totalInvested !== undefined && (
            <p className="text-xs text-accent mt-1">Total: {formatINR(user.totalInvested)}</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted hover:text-red-400 transition-colors"
          aria-label="Log out"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          Log out
        </button>
      </div>
    </>
  );

  const mobileTitle = project ? project.name : isAdminArea ? 'Admin' : 'ApexLedger';

  return (
    <div className="min-h-screen bg-base flex">
      <aside
        className="hidden lg:flex w-64 border-r border-border bg-surface flex-col shrink-0"
        aria-label="Main navigation"
      >
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close menu overlay"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="relative z-50 w-72 max-w-[85vw] h-full bg-surface border-r border-border flex flex-col shadow-xl"
            aria-label="Mobile navigation"
          >
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 border-b border-border bg-surface/95 backdrop-blur">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-muted hover:text-zinc-100 hover:bg-elevated"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <span className="font-semibold truncate">{mobileTitle}</span>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
