import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Truck, Car, Map, Landmark, Building2, Plus } from 'lucide-react';
import { api, Venture, VentureType } from '../lib/api';
import { formatINR } from '../lib/format';
import { useAuth } from '../contexts/AuthContext';
import { usePaginatedList } from '../hooks/usePaginatedList';
import ListToolbar from '../components/ui/ListToolbar';
import PaginationBar from '../components/ui/PaginationBar';

const ICON_MAP: Record<string, typeof Truck> = {
  truck: Truck,
  car: Car,
  map: Map,
  landmark: Landmark,
  building: Building2,
};

/**
 * Partner home — paginated grid of assigned projects with search and filters.
 */
export default function HomePage() {
  const { user } = useAuth();
  const [types, setTypes] = useState<VentureType[]>([]);
  const list = usePaginatedList<Venture>('/ventures', {
    initialFilters: { status: 'active', typeId: 'all' },
    limit: 12,
  });

  useEffect(() => {
    api<VentureType[]>('/ventures/types').then(setTypes).catch(() => setTypes([]));
  }, []);

  const getType = (v: Venture): VentureType | null => {
    if (typeof v.ventureTypeId === 'object') return v.ventureTypeId;
    return null;
  };

  const typeFilterOptions = [
    { value: 'all', label: 'All types' },
    ...types.map((t) => ({ value: t._id, label: t.label })),
  ];

  const statusFilterOptions = user?.role === 'admin'
    ? [
        { value: 'active', label: 'Active' },
        { value: 'closed', label: 'Closed' },
        { value: 'all', label: 'All status' },
      ]
    : [{ value: 'active', label: 'Active' }];

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <p className="text-muted text-sm mb-1">Welcome back,</p>
        <h1 className="text-3xl font-bold">{user?.name}</h1>
        {user?.totalInvested !== undefined && user.role === 'partner' && (
          <p className="text-accent mt-2 font-semibold">
            Your total investment: {formatINR(user.totalInvested)}
          </p>
        )}
      </div>

      <h2 className="text-lg font-semibold mb-4">Your Projects</h2>

      <ListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search projects..."
        filters={[
          {
            key: 'typeId',
            label: 'Filter by type',
            value: list.filters.typeId ?? 'all',
            options: typeFilterOptions,
          },
          {
            key: 'status',
            label: 'Filter by status',
            value: list.filters.status ?? 'active',
            options: statusFilterOptions,
          },
        ]}
        onFilterChange={list.setFilter}
      />

      {list.error && <p className="text-red-400 text-sm mb-4">{list.error}</p>}

      {list.loading ? (
        <div className="text-muted animate-pulse">Loading projects...</div>
      ) : list.items.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-muted mb-2">No projects found.</p>
          <p className="text-sm text-muted">
            {list.search || list.filters.typeId !== 'all'
              ? 'Try adjusting search or filters.'
              : 'Contact your admin to get access.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.items.map((v) => {
            const type = getType(v);
            const Icon = ICON_MAP[type?.icon ?? ''] ?? Truck;
            const color = type?.colorHex ?? '#22c55e';
            return (
              <Link
                key={v._id}
                to={`/app/project/${v._id}`}
                className="card hover:border-accent/40 transition-colors group"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${color}20` }}
                >
                  <Icon className="w-6 h-6" style={{ color }} aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-lg group-hover:text-accent transition-colors">
                  {v.name}
                </h3>
                <p className="text-sm text-muted mt-1">{type?.label ?? 'Project'}</p>
                {v.description && (
                  <p className="text-xs text-muted mt-2 line-clamp-2">{v.description}</p>
                )}
              </Link>
            );
          })}
        </div>
      )}

      <PaginationBar
        pagination={list.pagination}
        page={list.page}
        limit={list.limit}
        onPageChange={list.setPage}
        onLimitChange={list.setLimit}
        loading={list.loading}
      />

      {user?.role === 'admin' && (
        <Link to="/app/admin/users" className="inline-flex items-center gap-2 mt-8 btn-secondary">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Manage Projects & Partners
        </Link>
      )}
    </div>
  );
}
