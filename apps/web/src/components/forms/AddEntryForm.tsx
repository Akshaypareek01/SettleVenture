import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  apiUpload,
  BankAccount,
  Category,
  Transaction,
  Venture,
  VentureEmiSummary,
  VentureSummary,
} from '../../lib/api';
import { formatINR } from '../../lib/format';
import { paidFromLabel } from '../../lib/entryImpact';
import { PARTNER_ENTRY_TYPES, TransactionType } from '../../lib/transactionTypes';
import { useAuth } from '../../contexts/AuthContext';
import EntryImpactPanel from './EntryImpactPanel';
import ProofUploadField, { validateProofFile } from './ProofUploadField';
import AddEntryTypeFields from './AddEntryTypeFields';

interface AddEntryFormProps {
  ventureId: string;
  onSuccess: (txn: Transaction) => void;
  /** Optional initial entry type (e.g. from Earnings / EMI pages) */
  presetType?: TransactionType;
  /** Optional EMI beneficiary preselect for EMI_FROM_BANK */
  presetBeneficiaryId?: string;
  /** When true, form is non-interactive (closed project) */
  readOnly?: boolean;
}

/**
 * Current calendar month as YYYY-MM.
 */
function currentEmiPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Partner entry form — investments, expenses, outflows, earnings, EMI.
 */
export default function AddEntryForm({
  ventureId,
  onSuccess,
  presetType = 'CONTRIBUTION_IN',
  presetBeneficiaryId,
  readOnly = false,
}: AddEntryFormProps) {
  const { user } = useAuth();
  const [entryType, setEntryType] = useState<TransactionType>(presetType);
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidFrom, setPaidFrom] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [remark, setRemark] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [beneficiaryPartnerId, setBeneficiaryPartnerId] = useState(presetBeneficiaryId ?? '');
  const [emiPeriod, setEmiPeriod] = useState(currentEmiPeriod);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [outCategories, setOutCategories] = useState<Category[]>([]);
  const [emiBoard, setEmiBoard] = useState<VentureEmiSummary | null>(null);
  const [bankBalances, setBankBalances] = useState<Record<string, number>>({});
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setEntryType(presetType);
  }, [presetType]);

  useEffect(() => {
    if (presetBeneficiaryId) setBeneficiaryPartnerId(presetBeneficiaryId);
  }, [presetBeneficiaryId]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const selectedType = PARTNER_ENTRY_TYPES.find((t) => t.value === entryType);
  const needsBankAccount =
    entryType === 'CONTRIBUTION_IN' ||
    entryType === 'VENDOR_PAYMENT_OUT' ||
    entryType === 'EARNING_IN' ||
    entryType === 'EMI_FROM_BANK';
  const needsCategory = entryType === 'VENDOR_PAYMENT_OUT';
  const needsPaidTo = entryType === 'VENDOR_PAYMENT_OUT';
  const needsEmi = entryType === 'EMI_PERSONAL' || entryType === 'EMI_FROM_BANK';
  const needsBeneficiary = entryType === 'EMI_FROM_BANK';
  const isBankDebit = entryType === 'VENDOR_PAYMENT_OUT' || entryType === 'EMI_FROM_BANK';

  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);
  const selectableOutCategories = useMemo(
    () => outCategories.filter((c) => c.systemKey !== 'EMI'),
    [outCategories]
  );
  const emiPartners = useMemo(
    () => (emiBoard?.partners ?? []).filter((p) => p.isEmiActive),
    [emiBoard]
  );
  const sourceField = paidFromLabel(entryType);
  const selectedBalance =
    bankAccountId && bankBalances[bankAccountId] !== undefined
      ? bankBalances[bankAccountId]
      : null;
  const amountNum = amount === '' ? NaN : parseFloat(amount);
  const balanceShortfall =
    isBankDebit &&
    selectedBalance !== null &&
    Number.isFinite(amountNum) &&
    amountNum > selectedBalance;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [venture, cats, emi, summary] = await Promise.all([
          api<Venture>(`/ventures/${ventureId}`),
          api<Category[]>(`/ventures/${ventureId}/categories?direction=OUT`),
          api<VentureEmiSummary>(`/ventures/${ventureId}/emi`),
          api<VentureSummary>(`/ventures/${ventureId}/summary`),
        ]);
        if (cancelled) return;
        setAccounts(venture.bankAccounts ?? []);
        setOutCategories(cats);
        setEmiBoard(emi);
        const balances: Record<string, number> = {};
        for (const b of summary.byBankAccount ?? []) {
          balances[b.accountId] = b.balance;
        }
        setBankBalances(balances);
        const active = (venture.bankAccounts ?? []).filter((a) => a.isActive);
        if (active.length === 1) setBankAccountId(active[0]._id);
      } catch {
        if (!cancelled) setError('Failed to load bank accounts / categories');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ventureId]);

  useEffect(() => {
    if (!needsEmi) return;
    const targetId = entryType === 'EMI_FROM_BANK' ? beneficiaryPartnerId : user?.id;
    const row = emiPartners.find((p) => p.partnerId === targetId);
    if (row && row.monthlyEmi > 0) {
      setAmount((prev) => (prev ? prev : String(row.monthlyEmi)));
    }
  }, [entryType, beneficiaryPartnerId, emiPartners, needsEmi, user?.id]);

  /**
   * Converts YYYY-MM-DD date input to ISO datetime for the API.
   * @param dateStr - Local date string from input[type=date]
   */
  const toIsoDate = (dateStr: string): string => {
    const parsed = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) throw new Error('Invalid date');
    return parsed.toISOString();
  };

  /**
   * Sets the uploaded proof file and optional image preview.
   * @param f - Selected file or null to clear
   */
  const handleFile = (f: File | null) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    const validationError = validateProofFile(f);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setFile(f);
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f);
      previewUrlRef.current = url;
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    setError('');
    if (!file) {
      setError('Screenshot / proof is required');
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('Enter a valid amount greater than zero');
      return;
    }
    if (needsPaidTo && !paidTo.trim()) {
      setError('Paid to / destination is required');
      return;
    }
    if (needsBankAccount && activeAccounts.length === 0) {
      setError('This project has no active bank accounts — ask an admin to add one');
      return;
    }
    if (needsBankAccount && !bankAccountId) {
      setError('Select a project bank account');
      return;
    }
    if (needsCategory && selectableOutCategories.length === 0) {
      setError('No outflow categories configured — ask an admin');
      return;
    }
    if (needsCategory && !categoryId) {
      setError('Select an outflow category');
      return;
    }
    if (needsEmi && !/^\d{4}-(0[1-9]|1[0-2])$/.test(emiPeriod)) {
      setError('EMI period must be YYYY-MM');
      return;
    }
    if (needsBeneficiary && !beneficiaryPartnerId) {
      setError('Select whose EMI is being paid');
      return;
    }
    if (needsEmi && emiPartners.length === 0) {
      setError('No partner has EMI active on this project — ask an admin to configure loans');
      return;
    }
    if (entryType === 'EMI_PERSONAL') {
      const self = emiPartners.find((p) => p.partnerId === user?.id);
      if (!self) {
        setError('You do not have EMI active on this project');
        return;
      }
    }
    if (balanceShortfall && selectedBalance !== null) {
      setError(
        `Insufficient balance in this account (available ${formatINR(selectedBalance)})`
      );
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ventureId', ventureId);
      const uploaded = await apiUpload<{ id: string }>('/files/upload', formData);

      const txn = await api<Transaction>(`/ventures/${ventureId}/transactions`, {
        method: 'POST',
        body: JSON.stringify({
          type: entryType,
          amount: amountNum,
          date: toIsoDate(entryDate),
          paidFrom: paidFrom.trim(),
          paidTo: needsPaidTo ? paidTo.trim() : undefined,
          remark: remark.trim(),
          attachmentIds: [uploaded.id],
          bankAccountId: needsBankAccount ? bankAccountId : undefined,
          categoryId: needsCategory ? categoryId : undefined,
          beneficiaryPartnerId: needsBeneficiary ? beneficiaryPartnerId : undefined,
          emiPeriod: needsEmi ? emiPeriod : undefined,
        }),
      });

      setAmount('');
      setEntryDate(new Date().toISOString().slice(0, 10));
      setPaidFrom('');
      setPaidTo('');
      setRemark('');
      setCategoryId('');
      setEmiPeriod(currentEmiPeriod());
      handleFile(null);
      onSuccess(txn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (readOnly) {
    return (
      <div className="card max-w-lg" role="status">
        <h3 className="font-semibold text-lg mb-1">Add Entry</h3>
        <p className="text-sm text-muted">
          This project is closed. New entries cannot be added.
        </p>
      </div>
    );
  }

  const submitLabel = Number.isFinite(amountNum)
    ? `Submit ${formatINR(amountNum)}`
    : `Submit ${selectedType?.label ?? 'Entry'}`;

  return (
    <form onSubmit={handleSubmit} className="card max-w-lg space-y-5" aria-label="Add entry">
      <div>
        <h3 className="font-semibold text-lg mb-1">Add Entry</h3>
        <p className="text-sm text-muted">All fields required — including proof.</p>
      </div>

      {error && (
        <div
          className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="entryType" className="block text-sm font-medium mb-2">
          Entry type <span className="text-red-400">*</span>
        </label>
        <select
          id="entryType"
          value={entryType}
          onChange={(e) => setEntryType(e.target.value as TransactionType)}
          className="input-field"
          required
          aria-label="Entry type"
        >
          <optgroup label="Pocket">
            {PARTNER_ENTRY_TYPES.filter((t) =>
              ['CONTRIBUTION_IN', 'EXPENSE', 'EMI_PERSONAL'].includes(t.value)
            ).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Project bank">
            {PARTNER_ENTRY_TYPES.filter((t) =>
              ['VENDOR_PAYMENT_OUT', 'EARNING_IN', 'EMI_FROM_BANK'].includes(t.value)
            ).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </optgroup>
        </select>
        {selectedType && <p className="text-xs text-muted mt-2">{selectedType.description}</p>}
      </div>

      <EntryImpactPanel type={entryType} />

      <div>
        <label htmlFor="amount" className="block text-sm font-medium mb-2">
          Amount (₹) <span className="text-red-400">*</span>
        </label>
        <input
          id="amount"
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input-field text-2xl font-bold"
          required
          aria-label="Amount in rupees"
        />
      </div>

      <div>
        <label htmlFor="entryDate" className="block text-sm font-medium mb-2">
          Entry date <span className="text-red-400">*</span>
        </label>
        <input
          id="entryDate"
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className="input-field"
          required
          max={new Date().toISOString().slice(0, 10)}
          aria-label="Entry date"
        />
      </div>

      <AddEntryTypeFields
        needsBankAccount={needsBankAccount}
        needsCategory={needsCategory}
        needsBeneficiary={needsBeneficiary}
        needsEmi={needsEmi}
        needsPaidTo={needsPaidTo}
        bankAccountId={bankAccountId}
        setBankAccountId={setBankAccountId}
        activeAccounts={activeAccounts}
        bankBalances={bankBalances}
        balanceShortfall={!!balanceShortfall}
        selectedBalance={selectedBalance}
        categoryId={categoryId}
        setCategoryId={setCategoryId}
        selectableOutCategories={selectableOutCategories}
        beneficiaryPartnerId={beneficiaryPartnerId}
        setBeneficiaryPartnerId={setBeneficiaryPartnerId}
        setAmount={setAmount}
        emiPartners={emiPartners}
        emiPeriod={emiPeriod}
        setEmiPeriod={setEmiPeriod}
        sourceField={sourceField}
        paidFrom={paidFrom}
        setPaidFrom={setPaidFrom}
        paidTo={paidTo}
        setPaidTo={setPaidTo}
      />

      <div>
        <label htmlFor="remark" className="block text-sm font-medium mb-2">
          Reason / note <span className="text-red-400">*</span>
        </label>
        <textarea
          id="remark"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          className="input-field min-h-[80px] resize-none"
          required
        />
      </div>

      <ProofUploadField file={file} preview={preview} onFileChange={handleFile} />

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={submitting || !file || !!balanceShortfall}
      >
        {submitting ? 'Submitting...' : submitLabel}
      </button>
    </form>
  );
}
