import { FormEvent, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, BankAccount, Venture, VentureType } from '../../lib/api';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { ModalShell } from '../ui/ConfirmDialog';
import ForceDeleteDialog from '../ui/ForceDeleteDialog';
import ListToolbar from '../ui/ListToolbar';
import PaginationBar from '../ui/PaginationBar';
import BankAccountEditor, {
  BankAccountDraft,
  emptyBankAccountDraft,
} from './BankAccountEditor';

interface ProjectManagementTableProps {
  types: VentureType[];
  onChanged: (message: string) => void;
}

/**
 * Maps stored bank accounts into editor draft rows.
 * @param accounts - Venture bank accounts from the API
 */
function toDraftAccounts(accounts?: BankAccount[]): BankAccountDraft[] {
  if (!accounts?.length) return [];
  return accounts.map((a) => ({
    _id: a._id,
    label: a.label,
    bankName: a.bankName ?? '',
    accountHint: a.accountHint ?? '',
    isActive: a.isActive,
  }));
}

/**
 * Admin table to edit, close, and delete projects.
 */
export default function ProjectManagementTable({ types, onChanged }: ProjectManagementTableProps) {
  const list = usePaginatedList<Venture>('/admin/ventures', {
    initialFilters: { status: 'all', typeId: 'all' },
  });
  const [editProject, setEditProject] = useState<Venture | null>(null);
  const [deleteProject, setDeleteProject] = useState<Venture | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const getTypeLabel = (v: Venture): string => {
    if (typeof v.ventureTypeId === 'object') return v.ventureTypeId.label;
    const t = types.find((x) => x._id === v.ventureTypeId);
    return t?.label ?? 'Project';
  };

  const handleDelete = async () => {
    if (!deleteProject) return;
    setConfirmLoading(true);
    try {
      await api(`/admin/ventures/${deleteProject._id}?force=true`, { method: 'DELETE' });
      onChanged(`${deleteProject.name} and all records deleted`);
      setDeleteProject(null);
      list.refresh();
    } catch (err) {
      onChanged(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmLoading(false);
    }
  };

  const typeFilterOptions = [
    { value: 'all', label: 'All types' },
    ...types.map((t) => ({ value: t._id, label: t.label })),
  ];

  return (
    <>
      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-4">All Projects</h3>
        <ListToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchPlaceholder="Search projects..."
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: list.filters.status ?? 'all',
              options: [
                { value: 'all', label: 'All status' },
                { value: 'active', label: 'Active' },
                { value: 'closed', label: 'Closed' },
              ],
            },
            {
              key: 'typeId',
              label: 'Type',
              value: list.filters.typeId ?? 'all',
              options: typeFilterOptions,
            },
          ]}
          onFilterChange={list.setFilter}
        />
        {list.loading ? (
          <p className="text-muted text-sm py-8 text-center animate-pulse">Loading projects...</p>
        ) : list.items.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">No projects match your filters.</p>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted border-b border-border text-left">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 px-4">Type</th>
              <th className="py-2 px-4">Banks</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 pl-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((v) => (
              <tr key={v._id} className="border-b border-border/50">
                <td className="py-3 pr-4">
                  <p className="font-medium">{v.name}</p>
                  {v.description && <p className="text-xs text-muted mt-0.5">{v.description}</p>}
                </td>
                <td className="py-3 px-4 text-muted">{getTypeLabel(v)}</td>
                <td className="py-3 px-4 text-muted">
                  {(v.bankAccounts ?? []).filter((a) => a.isActive).length || 0} active
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                      v.status === 'active' ? 'bg-accent/10 text-accent' : 'bg-orange-500/10 text-orange-400'
                    }`}
                  >
                    {v.status}
                  </span>
                </td>
                <td className="py-3 pl-4">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditProject(v)}
                      className="flex items-center gap-1 text-xs py-1.5 px-2 rounded-xl border border-border text-muted hover:text-zinc-100 hover:bg-elevated"
                      aria-label={`Edit ${v.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteProject(v)}
                      className="flex items-center gap-1 text-xs py-1.5 px-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10"
                      aria-label={`Delete ${v.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
        <PaginationBar
          pagination={list.pagination}
          page={list.page}
          limit={list.limit}
          onPageChange={list.setPage}
          onLimitChange={list.setLimit}
          loading={list.loading}
        />
        <p className="text-xs text-muted mt-4">
          Force delete removes project + all investments, proofs, and assignments. Type DELETE to confirm.
        </p>
      </div>

      {deleteProject && (
        <ForceDeleteDialog
          title="Force delete project?"
          itemName={deleteProject.name}
          message={
            <>
              This permanently deletes <strong className="text-zinc-100">{deleteProject.name}</strong>,
              all partner investments, uploaded documents, and assignments. Cannot be undone.
            </>
          }
          loading={confirmLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteProject(null)}
        />
      )}

      {editProject && (
        <EditProjectModal
          project={editProject}
          onClose={() => setEditProject(null)}
          onSaved={(msg) => {
            setEditProject(null);
            onChanged(msg);
            list.refresh();
          }}
        />
      )}
    </>
  );
}

interface EditProjectModalProps {
  project: Venture;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Modal to edit project name, description, status, and bank accounts. */
function EditProjectModal({ project, onClose, onSaved }: EditProjectModalProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [status, setStatus] = useState(project.status);
  const [bankAccounts, setBankAccounts] = useState<BankAccountDraft[]>(() =>
    toDraftAccounts(project.bankAccounts)
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const cleaned = bankAccounts
      .map((a) => ({
        ...a,
        label: a.label.trim(),
      }))
      .filter((a) => a.label.length > 0);
    if (bankAccounts.some((a) => !a.label.trim())) {
      setError('Every bank account needs a label (or remove empty rows)');
      setSaving(false);
      return;
    }
    if (cleaned.length === 0) {
      setError('Keep at least one bank account on the project');
      setSaving(false);
      return;
    }
    try {
      await api(`/admin/ventures/${project._id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          description,
          status,
          bankAccounts: cleaned.map((a) => ({
            _id: a._id,
            label: a.label,
            bankName: a.bankName || undefined,
            accountHint: a.accountHint || undefined,
            isActive: a.isActive,
          })),
        }),
      });
      onSaved(`${name} updated`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Edit Project" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div>
          <label htmlFor="proj-name" className="block text-sm font-medium mb-2">Name</label>
          <input id="proj-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="proj-desc" className="block text-sm font-medium mb-2">Description</label>
          <input id="proj-desc" className="input-field" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor="proj-status" className="block text-sm font-medium mb-2">Status</label>
          <select id="proj-status" className="input-field" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Project status">
            <option value="active">Active</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <BankAccountEditor accounts={bankAccounts} onChange={setBankAccounts} />
        {bankAccounts.length === 0 && (
          <button
            type="button"
            className="text-sm text-accent"
            onClick={() => setBankAccounts([emptyBankAccountDraft()])}
          >
            + Add first bank account
          </button>
        )}
        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}
