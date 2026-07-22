import { FormEvent, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { api, PaginatedResult, Venture, VentureType } from '../../lib/api';
import UserManagementTable from '../../components/admin/UserManagementTable';
import ProjectManagementTable from '../../components/admin/ProjectManagementTable';
import VentureTypeManagement from '../../components/admin/VentureTypeManagement';
import BankAccountEditor, {
  BankAccountDraft,
  emptyBankAccountDraft,
} from '../../components/admin/BankAccountEditor';
import AssignForm from '../../components/admin/AssignForm';
import CompanyProfileForm from '../../components/admin/CompanyProfileForm';

interface Partner {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

const VALID_TABS = ['users', 'types', 'projects', 'assign', 'company'] as const;
type AdminTab = (typeof VALID_TABS)[number];

const TAB_META: Record<AdminTab, { title: string; blurb: string }> = {
  users: { title: 'Users', blurb: 'Create partners and manage account access.' },
  types: { title: 'Project types', blurb: 'Truck, Car, Plot, and other venture labels.' },
  projects: { title: 'Projects', blurb: 'Create ventures and manage bank accounts.' },
  assign: { title: 'Assign partners', blurb: 'Link partners to projects and configure EMI.' },
  company: { title: 'Company', blurb: 'Firm details used on invoices and GST.' },
};

/**
 * Admin panel — one section at a time via sidebar URL (/app/admin/:tab).
 */
export default function AdminPage() {
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const tab = (tabParam ?? 'users') as string;
  const activeTab = (VALID_TABS.includes(tab as AdminTab) ? tab : 'users') as AdminTab;
  const [partners, setPartners] = useState<Partner[]>([]);
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [types, setTypes] = useState<VentureType[]>([]);
  const [message, setMessage] = useState('');

  /** Loads dropdown options for assign tab and create project form. */
  const loadOptions = async () => {
    const [p, v, t] = await Promise.all([
      api<PaginatedResult<Partner>>('/admin/partners?limit=100'),
      api<PaginatedResult<Venture>>('/admin/ventures?limit=100'),
      api<PaginatedResult<VentureType>>('/admin/venture-types?limit=100'),
    ]);
    setPartners(p.items.filter((x) => x.role === 'partner'));
    setVentures(v.items);
    setTypes(t.items);
  };

  useEffect(() => {
    void loadOptions();
  }, []);

  useEffect(() => {
    setMessage('');
  }, [activeTab]);

  if (!VALID_TABS.includes(tab as AdminTab)) {
    return <Navigate to="/app/admin/users" replace />;
  }

  const meta = TAB_META[activeTab];

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <h1 className="text-2xl sm:text-3xl font-bold mb-1">{meta.title}</h1>
      <p className="text-muted mb-6 text-sm sm:text-base">{meta.blurb}</p>

      {message && (
        <div
          className="bg-accent/10 border border-accent/30 text-accent px-4 py-3 rounded-xl text-sm mb-6"
          role="status"
        >
          {message}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-8">
          <CreateUserForm
            onCreated={(msg) => {
              setMessage(msg);
              void loadOptions();
            }}
          />
          <UserManagementTable
            onChanged={(msg) => {
              setMessage(msg);
              void loadOptions();
            }}
          />
        </div>
      )}

      {activeTab === 'types' && (
        <VentureTypeManagement
          onChanged={(msg) => {
            setMessage(msg);
            void loadOptions();
          }}
        />
      )}

      {activeTab === 'projects' && (
        <div className="space-y-8">
          <CreateProjectForm
            types={types.filter((t) => t.isActive !== false)}
            onCreated={() => {
              setMessage('Project created successfully');
              void loadOptions();
            }}
          />
          <ProjectManagementTable
            types={types}
            onChanged={(msg) => {
              setMessage(msg);
              void loadOptions();
            }}
          />
        </div>
      )}

      {activeTab === 'assign' && (
        <AssignForm
          partners={partners}
          ventures={ventures}
          onChanged={() => {
            setMessage('Assignment updated');
          }}
        />
      )}

      {activeTab === 'company' && (
        <CompanyProfileForm onSaved={(msg) => setMessage(msg)} />
      )}
    </div>
  );
}

interface CreateUserFormProps {
  onCreated: (message: string) => void;
}

const EMAIL_DOMAIN = '@apexledger.local';

/**
 * Form to create a new partner user.
 */
function CreateUserForm({ onCreated }: CreateUserFormProps) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const localPart = username.trim().toLowerCase().replace(/@.*$/, '');
    if (!localPart) {
      setError('Enter a username');
      return;
    }
    const email = `${localPart}${EMAIL_DOMAIN}`;
    try {
      await api('/admin/partners', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role: 'partner' }),
      });
      setName('');
      setUsername('');
      setPassword('');
      onCreated(`User created — ${email} / password: ${password} (copy now, cannot view later)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card max-w-md space-y-4" aria-label="Create user">
      <h3 className="font-semibold">Create Partner User</h3>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <input className="input-field" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Name" />
      <div>
        <label htmlFor="username" className="block text-sm font-medium mb-2">
          Email
        </label>
        <div className="flex items-center gap-0 rounded-xl overflow-hidden border border-border focus-within:ring-2 focus-within:ring-accent/50 focus-within:border-accent">
          <input
            id="username"
            type="text"
            className="flex-1 bg-elevated px-4 py-3 text-zinc-100 placeholder:text-muted focus:outline-none min-w-0"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
            required
            aria-label="Email username"
            autoComplete="off"
          />
          <span className="bg-elevated px-3 py-3 text-muted text-sm shrink-0 border-l border-border select-none">
            {EMAIL_DOMAIN}
          </span>
        </div>
      </div>
      <input
        className="input-field"
        type={showPassword ? 'text' : 'password'}
        placeholder="Password (8+ chars, letter + number)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        pattern="(?=.*[A-Za-z])(?=.*\d).{8,}"
        title="At least 8 characters with a letter and a number"
        aria-label="Password"
      />
      <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
          className="rounded border-border"
        />
        Show password while typing
      </label>
      <button type="submit" className="btn-primary">Create User</button>
    </form>
  );
}

interface CreateProjectFormProps {
  types: VentureType[];
  onCreated: () => void;
}

/**
 * Form to create a new project/venture.
 */
function CreateProjectForm({ types, onCreated }: CreateProjectFormProps) {
  const [name, setName] = useState('');
  const [typeId, setTypeId] = useState('');
  const [description, setDescription] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccountDraft[]>([
    emptyBankAccountDraft(),
  ]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (types.length && !typeId) setTypeId(types[0]._id);
  }, [types, typeId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const cleaned = bankAccounts
      .map((a) => ({ ...a, label: a.label.trim() }))
      .filter((a) => a.label.length > 0);
    if (bankAccounts.some((a) => a.label.trim() === '' && (a.bankName || a.accountHint))) {
      setError('Give every bank account a label, or clear unused rows');
      return;
    }
    if (cleaned.length === 0) {
      setError('Add at least one bank account before creating the project');
      return;
    }
    try {
      await api('/admin/ventures', {
        method: 'POST',
        body: JSON.stringify({
          name,
          ventureTypeId: typeId,
          description,
          bankAccounts: cleaned.map((a) => ({
            label: a.label,
            bankName: a.bankName || undefined,
            accountHint: a.accountHint || undefined,
            isActive: a.isActive,
          })),
        }),
      });
      setName('');
      setDescription('');
      setBankAccounts([emptyBankAccountDraft()]);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card max-w-md space-y-4" aria-label="Create project">
      <h3 className="font-semibold">Create Project</h3>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <input className="input-field" placeholder="Project name (e.g. Truck 1)" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Project name" />
      <select className="input-field" value={typeId} onChange={(e) => setTypeId(e.target.value)} required aria-label="Project type">
        {types.length === 0 ? (
          <option value="">Create a project type first</option>
        ) : (
          types.map((t) => (
            <option key={t._id} value={t._id}>{t.label}</option>
          ))
        )}
      </select>
      <input className="input-field" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" />
      <BankAccountEditor accounts={bankAccounts} onChange={setBankAccounts} />
      <button type="submit" className="btn-primary">Create Project</button>
    </form>
  );
}
