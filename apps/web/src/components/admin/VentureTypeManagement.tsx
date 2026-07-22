import { FormEvent, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { api, VentureType } from '../../lib/api';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import { ModalShell } from '../ui/ConfirmDialog';
import ForceDeleteDialog from '../ui/ForceDeleteDialog';
import ListToolbar from '../ui/ListToolbar';
import PaginationBar from '../ui/PaginationBar';

const ICON_OPTIONS = [
  { value: 'truck', label: 'Truck' },
  { value: 'car', label: 'Car' },
  { value: 'map', label: 'Plot / Map' },
  { value: 'landmark', label: 'Landmark / Jamin' },
  { value: 'building', label: 'Building / Company' },
  { value: 'home', label: 'Home' },
  { value: 'folder', label: 'Folder' },
];

const COLOR_PRESETS = ['#22c55e', '#60a5fa', '#a78bfa', '#fb923c', '#f472b6', '#f87171', '#eab308'];

interface VentureTypeManagementProps {
  onChanged: (message: string) => void;
}

/**
 * Slugifies a label for venture type slug field.
 * @param label - Display label
 */
function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Admin UI to create and manage project types (Truck, Car, etc.).
 */
export default function VentureTypeManagement({ onChanged }: VentureTypeManagementProps) {
  const list = usePaginatedList<VentureType>('/admin/venture-types', {
    initialFilters: { status: 'all' },
  });
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [icon, setIcon] = useState('folder');
  const [colorHex, setColorHex] = useState('#22c55e');
  const [error, setError] = useState('');
  const [editType, setEditType] = useState<VentureType | null>(null);
  const [deleteType, setDeleteType] = useState<VentureType | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const handleLabelChange = (value: string) => {
    setLabel(value);
    if (!slugEdited) setSlug(slugify(value));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/venture-types', {
        method: 'POST',
        body: JSON.stringify({ label: label.trim(), slug: slug.trim(), icon, colorHex }),
      });
      setLabel('');
      setSlug('');
      setSlugEdited(false);
      setIcon('folder');
      setColorHex('#22c55e');
      onChanged(`Type "${label.trim()}" created`);
      list.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create type');
    }
  };

  const handleDelete = async () => {
    if (!deleteType) return;
    setConfirmLoading(true);
    try {
      await api(`/admin/venture-types/${deleteType._id}?force=true`, { method: 'DELETE' });
      onChanged(`Type "${deleteType.label}" and all linked projects deleted`);
      setDeleteType(null);
      list.refresh();
    } catch (err) {
      onChanged(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setConfirmLoading(false);
    }
  };

  const activeCount = list.items.filter((t) => t.isActive !== false).length;

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="card max-w-md space-y-4" aria-label="Create project type">
        <h3 className="font-semibold">Create Project Type</h3>
        <p className="text-xs text-muted">Add new categories like Truck, Car, Plot — used when creating projects.</p>
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div>
          <label htmlFor="type-label" className="block text-sm font-medium mb-2">Type name</label>
          <input
            id="type-label"
            className="input-field"
            placeholder="e.g. Warehouse, Bike"
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="type-slug" className="block text-sm font-medium mb-2">Slug (internal ID)</label>
          <input
            id="type-slug"
            className="input-field font-mono text-sm"
            placeholder="warehouse"
            value={slug}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
            }}
            required
          />
        </div>

        <div>
          <label htmlFor="type-icon" className="block text-sm font-medium mb-2">Icon</label>
          <select id="type-icon" className="input-field" value={icon} onChange={(e) => setIcon(e.target.value)}>
            {ICON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Color</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColorHex(c)}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${
                  colorHex === c ? 'border-white scale-110' : 'border-transparent'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Select color ${c}`}
              />
            ))}
          </div>
          <input
            type="color"
            value={colorHex}
            onChange={(e) => setColorHex(e.target.value)}
            className="w-full h-10 rounded-xl cursor-pointer bg-elevated border border-border"
            aria-label="Custom color"
          />
        </div>

        <button type="submit" className="btn-primary">Create Type</button>
      </form>

      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-4">Project Types ({activeCount} active)</h3>
        <ListToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchPlaceholder="Search types..."
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: list.filters.status ?? 'all',
              options: [
                { value: 'all', label: 'All status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
          ]}
          onFilterChange={list.setFilter}
        />
        {list.loading ? (
          <p className="text-muted text-sm py-8 text-center animate-pulse">Loading types...</p>
        ) : list.items.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">No types match your search.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted border-b border-border text-left">
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 px-4">Slug</th>
                <th className="py-2 px-4">Status</th>
                <th className="py-2 pl-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((t) => (
                <tr key={t._id} className="border-b border-border/50">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: t.colorHex }}
                        aria-hidden="true"
                      />
                      <span className="font-medium">{t.label}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted font-mono text-xs">{t.slug}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        t.isActive !== false ? 'bg-accent/10 text-accent' : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {t.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 pl-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditType(t)}
                        className="flex items-center gap-1 text-xs py-1.5 px-2 rounded-xl border border-border text-muted hover:text-zinc-100"
                        aria-label={`Edit ${t.label}`}
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteType(t)}
                        className="flex items-center gap-1 text-xs py-1.5 px-2 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10"
                        aria-label={`Delete ${t.label}`}
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
      </div>

      {deleteType && (
        <ForceDeleteDialog
          title="Force delete project type?"
          itemName={deleteType.label}
          message={
            <>
              This permanently deletes type <strong className="text-zinc-100">{deleteType.label}</strong>,
              all projects of this type, their investments, proofs, and assignments. Cannot be undone.
            </>
          }
          loading={confirmLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteType(null)}
        />
      )}

      {editType && (
        <EditTypeModal
          type={editType}
          onClose={() => setEditType(null)}
          onSaved={(msg) => {
            setEditType(null);
            onChanged(msg);
            list.refresh();
          }}
        />
      )}
    </div>
  );
}

interface EditTypeModalProps {
  type: VentureType;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Modal to edit venture type label, icon, color, active status. */
function EditTypeModal({ type, onClose, onSaved }: EditTypeModalProps) {
  const [label, setLabel] = useState(type.label);
  const [icon, setIcon] = useState(type.icon);
  const [colorHex, setColorHex] = useState(type.colorHex);
  const [isActive, setIsActive] = useState(type.isActive !== false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/admin/venture-types/${type._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: label.trim(), icon, colorHex, isActive }),
      });
      onSaved(`Type "${label.trim()}" updated`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Edit Project Type" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <p className="text-xs text-muted font-mono">Slug: {type.slug} (cannot change)</p>
        <input className="input-field" value={label} onChange={(e) => setLabel(e.target.value)} required aria-label="Type name" />
        <select className="input-field" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Icon">
          {ICON_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="w-full h-10 rounded-xl" aria-label="Color" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active (show in project dropdown)
        </label>
        <div className="flex gap-2 pt-2">
          <button type="submit" className="btn-primary flex-1" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}
