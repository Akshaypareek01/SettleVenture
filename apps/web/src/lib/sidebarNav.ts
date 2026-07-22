import {
  LayoutDashboard,
  Shield,
  BookOpen,
  Landmark,
  TrendingUp,
  CreditCard,
  FileText,
  Receipt,
  FolderOpen,
  PieChart,
  Users,
  Tags,
  FolderKanban,
  UserPlus,
  Building2,
  type LucideIcon,
} from 'lucide-react';

export interface SidebarLink {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Top-level app links always available. */
export const GLOBAL_NAV: SidebarLink[] = [
  { to: '/app', label: 'My Projects', icon: LayoutDashboard, end: true },
];

/** Admin section links (admin role only). */
export const ADMIN_NAV: SidebarLink[] = [
  { to: '/app/admin/users', label: 'Users', icon: Users },
  { to: '/app/admin/types', label: 'Types', icon: Tags },
  { to: '/app/admin/projects', label: 'Projects', icon: FolderKanban },
  { to: '/app/admin/assign', label: 'Assign', icon: UserPlus },
  { to: '/app/admin/company', label: 'Company', icon: Building2 },
];

/**
 * Builds project section links for the sidebar.
 * @param projectId - Open venture id
 */
export function projectNavLinks(projectId: string): SidebarLink[] {
  const base = `/app/project/${projectId}`;
  return [
    { to: `${base}/entries`, label: 'Entries', icon: BookOpen },
    { to: `${base}/bank`, label: 'Bank', icon: Landmark },
    { to: `${base}/earnings`, label: 'Earnings', icon: TrendingUp },
    { to: `${base}/emi`, label: 'EMI', icon: CreditCard },
    { to: `${base}/invoices`, label: 'Invoices', icon: FileText },
    { to: `${base}/gst`, label: 'GST', icon: Receipt },
    { to: `${base}/documents`, label: 'Documents', icon: FolderOpen },
    { to: `${base}/analysis`, label: 'Analysis', icon: PieChart },
  ];
}

export const ADMIN_HUB: SidebarLink = {
  to: '/app/admin/users',
  label: 'Admin',
  icon: Shield,
};
