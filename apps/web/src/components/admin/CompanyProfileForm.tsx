import { FormEvent, useEffect, useState } from 'react';
import { api } from '../../lib/api';

export interface CompanyProfile {
  _id?: string;
  firmName: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  pan?: string;
  phone?: string;
  email?: string;
  bankName?: string;
  bankAccountHint?: string;
  ifsc?: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
}

interface CompanyProfileFormProps {
  onSaved: (message: string) => void;
}

/**
 * Admin form for firm details used on project invoices.
 */
export default function CompanyProfileForm({ onSaved }: CompanyProfileFormProps) {
  const [form, setForm] = useState<CompanyProfile>({
    firmName: '',
    invoicePrefix: 'AL-',
    nextInvoiceNumber: 1,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await api<CompanyProfile>('/admin/company-profile');
        if (!cancelled) setForm(profile);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Updates one profile field in local form state.
   * @param key - Field name
   * @param value - Field value
   */
  const setField = (key: keyof CompanyProfile, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await api<CompanyProfile>('/admin/company-profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          nextInvoiceNumber: Number(form.nextInvoiceNumber) || 1,
        }),
      });
      setForm(saved);
      onSaved('Company profile saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-muted animate-pulse">Loading company profile...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-4" aria-label="Company profile">
      <div>
        <h3 className="font-semibold text-lg">Company Profile</h3>
        <p className="text-sm text-muted mt-1">
          Firm details are snapshotted onto invoices when they are issued.
        </p>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <input
        className="input-field"
        placeholder="Firm name *"
        value={form.firmName}
        onChange={(e) => setField('firmName', e.target.value)}
        required
        aria-label="Firm name"
      />
      <textarea
        className="input-field min-h-[72px] resize-none"
        placeholder="Address"
        value={form.address ?? ''}
        onChange={(e) => setField('address', e.target.value)}
        aria-label="Address"
      />
      <div className="grid sm:grid-cols-3 gap-3">
        <input
          className="input-field"
          placeholder="City"
          value={form.city ?? ''}
          onChange={(e) => setField('city', e.target.value)}
          aria-label="City"
        />
        <input
          className="input-field"
          placeholder="State"
          value={form.state ?? ''}
          onChange={(e) => setField('state', e.target.value)}
          aria-label="State"
        />
        <input
          className="input-field"
          placeholder="Pincode"
          value={form.pincode ?? ''}
          onChange={(e) => setField('pincode', e.target.value)}
          aria-label="Pincode"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          className="input-field"
          placeholder="GSTIN"
          value={form.gstin ?? ''}
          onChange={(e) => setField('gstin', e.target.value)}
          aria-label="GSTIN"
        />
        <input
          className="input-field"
          placeholder="PAN"
          value={form.pan ?? ''}
          onChange={(e) => setField('pan', e.target.value)}
          aria-label="PAN"
        />
        <input
          className="input-field"
          placeholder="Phone"
          value={form.phone ?? ''}
          onChange={(e) => setField('phone', e.target.value)}
          aria-label="Phone"
        />
        <input
          className="input-field"
          type="email"
          placeholder="Email"
          value={form.email ?? ''}
          onChange={(e) => setField('email', e.target.value)}
          aria-label="Email"
        />
      </div>
      <div className="border-t border-border pt-4 space-y-3">
        <p className="text-sm font-medium">Bank details (invoice footer)</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <input
            className="input-field"
            placeholder="Bank name"
            value={form.bankName ?? ''}
            onChange={(e) => setField('bankName', e.target.value)}
            aria-label="Bank name"
          />
          <input
            className="input-field"
            placeholder="Account hint / last4"
            value={form.bankAccountHint ?? ''}
            onChange={(e) => setField('bankAccountHint', e.target.value)}
            aria-label="Bank account hint"
          />
          <input
            className="input-field"
            placeholder="IFSC"
            value={form.ifsc ?? ''}
            onChange={(e) => setField('ifsc', e.target.value)}
            aria-label="IFSC"
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <input
          className="input-field"
          placeholder="Invoice prefix"
          value={form.invoicePrefix}
          onChange={(e) => setField('invoicePrefix', e.target.value)}
          required
          aria-label="Invoice prefix"
        />
        <input
          className="input-field"
          type="number"
          min={1}
          placeholder="Next invoice number"
          value={form.nextInvoiceNumber}
          onChange={(e) => setField('nextInvoiceNumber', parseInt(e.target.value, 10) || 1)}
          required
          aria-label="Next invoice number"
        />
      </div>
      <button type="submit" className="btn-primary" disabled={saving}>
        {saving ? 'Saving...' : 'Save company profile'}
      </button>
    </form>
  );
}
