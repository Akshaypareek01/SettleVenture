import { FormEvent, useState } from 'react';
import { KeyRound, Pencil, Trash2, UserX, UserCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { usePaginatedList } from '../../hooks/usePaginatedList';
import ConfirmDialog, { ModalShell } from '../ui/ConfirmDialog';
import ForceDeleteDialog from '../ui/ForceDeleteDialog';
import ListToolbar from '../ui/ListToolbar';
import PaginationBar from '../ui/PaginationBar';

export interface AdminPartner {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

type ConfirmAction =
  | { type: 'deactivate'; partner: AdminPartner }
  | { type: 'activate'; partner: AdminPartner };

interface UserManagementTableProps {
  onChanged: (message: string) => void;
}

/**
 * Admin table to list, edit, reset password, activate/deactivate, and delete partners.
 */
export default function UserManagementTable({ onChanged }: UserManagementTableProps) {
  const list = usePaginatedList<AdminPartner>('/admin/partners', {
    initialFilters: { status: 'all' },
  });
  const [editUser, setEditUser] = useState<AdminPartner | null>(null);
  const [resetUser, setResetUser] = useState<AdminPartner | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminPartner | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const runConfirm = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      const active = confirmAction.type === 'activate';
      await api(`/admin/partners/${confirmAction.partner._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: active }),
      });
      onChanged(`${confirmAction.partner.name} ${active ? 'activated' : 'deactivated'}`);
      setConfirmAction(null);
      list.refresh();
    } catch (err) {
      onChanged(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setConfirmLoading(false);
    }
  };

  const runForceDelete = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);
    try {
      await api(`/admin/partners/${deleteUser._id}?force=true`, { method: 'DELETE' });
      onChanged(`${deleteUser.name} and all their records deleted`);
      setDeleteUser(null);
      list.refresh();
    } catch (err) {
      onChanged(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!list.loading && list.items.length === 0 && !list.search && list.filters.status === 'all') {
    return (
      <div className="card text-center py-8 text-muted text-sm">
        No partner users yet. Create one above.
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-4">All Partner Users</h3>
        <ListToolbar
          search={list.search}
          onSearchChange={list.setSearch}
          searchPlaceholder="Search name or email..."
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
          <p className="text-muted text-sm py-8 text-center animate-pulse">Loading users...</p>
        ) : list.items.length === 0 ? (
          <p className="text-muted text-sm py-8 text-center">No users match your search.</p>
        ) : (
          <table className="w-full text-sm">
          <thead>
            <tr className="text-muted border-b border-border text-left">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 px-4">Email</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 pl-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((p) => (
              <tr key={p._id} className="border-b border-border/50">
                <td className="py-3 pr-4 font-medium">{p.name}</td>
                <td className="py-3 px-4 text-muted">{p.email}</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      p.isActive ? 'bg-accent/10 text-accent' : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-3 pl-4">
                  <div className="flex items-center justify-end gap-1 flex-wrap">
                    <ActionBtn icon={Pencil} label="Edit" onClick={() => setEditUser(p)} />
                    <ActionBtn icon={KeyRound} label="Password" onClick={() => setResetUser(p)} />
                    <ActionBtn
                      icon={p.isActive ? UserX : UserCheck}
                      label={p.isActive ? 'Deactivate' : 'Activate'}
                      onClick={() =>
                        setConfirmAction({
                          type: p.isActive ? 'deactivate' : 'activate',
                          partner: p,
                        })
                      }
                      danger={p.isActive}
                    />
                    <ActionBtn
                      icon={Trash2}
                      label="Delete"
                      onClick={() => setDeleteUser(p)}
                      danger
                    />
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
          Force delete removes user + all their investments and files. Type DELETE to confirm.
        </p>
      </div>

      {deleteUser && (
        <ForceDeleteDialog
          title="Force delete user?"
          itemName={deleteUser.name}
          message={
            <>
              This permanently deletes <strong className="text-zinc-100">{deleteUser.name}</strong>, all
              their investment records, uploaded proofs, and project assignments. Cannot be undone.
            </>
          }
          loading={deleteLoading}
          onConfirm={runForceDelete}
          onCancel={() => setDeleteUser(null)}
        />
      )}

      {confirmAction && (
        <ConfirmDialog
          title={
            confirmAction.type === 'deactivate' ? 'Deactivate user?' : 'Activate user?'
          }
          message={
            confirmAction.type === 'deactivate' ? (
              <>
                Deactivate <strong className="text-zinc-100">{confirmAction.partner.name}</strong>?
                They won&apos;t be able to log in.
              </>
            ) : (
              <>Reactivate <strong className="text-zinc-100">{confirmAction.partner.name}</strong>?</>
            )
          }
          confirmLabel={confirmAction.type === 'deactivate' ? 'Deactivate' : 'Activate'}
          variant={confirmAction.type === 'deactivate' ? 'danger' : 'default'}
          loading={confirmLoading}
          onConfirm={runConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {editUser && (
        <EditUserModal
          partner={editUser}
          onClose={() => setEditUser(null)}
          onSaved={(msg) => {
            setEditUser(null);
            onChanged(msg);
            list.refresh();
          }}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          partner={resetUser}
          onClose={() => setResetUser(null)}
          onSaved={(msg) => {
            setResetUser(null);
            onChanged(msg);
          }}
        />
      )}
    </>
  );
}

interface ActionBtnProps {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/** Small icon action button for table rows. */
function ActionBtn({ icon: Icon, label, onClick, danger }: ActionBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 text-xs py-1.5 px-2 rounded-xl border transition-colors ${
        danger
          ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
          : 'border-border text-muted hover:text-zinc-100 hover:bg-elevated'
      }`}
      aria-label={label}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

interface EditUserModalProps {
  partner: AdminPartner;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Modal to edit partner name. */
function EditUserModal({ partner, onClose, onSaved }: EditUserModalProps) {
  const [name, setName] = useState(partner.name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/admin/partners/${partner._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      onSaved(`${name} updated`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Edit User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div>
          <label htmlFor="edit-name" className="block text-sm font-medium mb-2">Name</label>
          <input id="edit-name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <p className="text-sm text-muted">Email: {partner.email}</p>
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

interface ResetPasswordModalProps {
  partner: AdminPartner;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Modal for admin to set a new password and view/copy it once. */
function ResetPasswordModal({ partner, onClose, onSaved }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Password must be at least 8 characters with a letter and a number');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api(`/admin/partners/${partner._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Reset Password" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-accent text-sm">Password updated for {partner.name}</p>
          <input type={showPassword ? 'text' : 'password'} className="input-field font-mono" value={password} readOnly aria-label="New password" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(password);
                onSaved(`Password reset for ${partner.name} — copied to clipboard`);
              }}
              className="btn-primary flex-1"
            >
              Copy & Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <p className="text-sm text-muted">Set new password for {partner.email}</p>
          <input
            type={showPassword ? 'text' : 'password'}
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8+ chars, letter + number"
            required
            minLength={8}
            pattern="(?=.*[A-Za-z])(?=.*\d).{8,}"
            title="At least 8 characters with a letter and a number"
            aria-label="New password"
          />
          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Updating...' : 'Update Password'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
