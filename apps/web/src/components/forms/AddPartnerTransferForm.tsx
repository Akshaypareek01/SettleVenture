import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, apiUpload, Transaction, Venture, VenturePartner } from '../../lib/api';
import { formatINR } from '../../lib/format';
import { paidFromLabel } from '../../lib/entryImpact';
import type { TransferBucket } from '../../lib/transactionTypes';
import { useAuth } from '../../contexts/AuthContext';
import ProofUploadField, { validateProofFile } from './ProofUploadField';

interface AddPartnerTransferFormProps {
  ventureId: string;
  onSuccess: (txn: Transaction) => void;
  readOnly?: boolean;
  /** Prefill from a suggested payment */
  preset?: {
    fromPartnerId?: string;
    toPartnerId?: string;
    amount?: number;
    transferBucket?: TransferBucket;
  };
}

/**
 * Form to log a personal partner→partner fair-share settlement transfer.
 */
export default function AddPartnerTransferForm({
  ventureId,
  onSuccess,
  readOnly = false,
  preset,
}: AddPartnerTransferFormProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [partners, setPartners] = useState<VenturePartner[]>([]);
  const [transferBucket, setTransferBucket] = useState<TransferBucket>(
    preset?.transferBucket ?? 'INVESTMENT'
  );
  const [fromPartnerId, setFromPartnerId] = useState(
    preset?.fromPartnerId ?? user?.id ?? ''
  );
  const [toPartnerId, setToPartnerId] = useState(preset?.toPartnerId ?? '');
  const [amount, setAmount] = useState(
    preset?.amount != null ? String(preset.amount) : ''
  );
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidFrom, setPaidFrom] = useState('');
  const [remark, setRemark] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const sourceField = paidFromLabel('PARTNER_TRANSFER');
  const amountNum = amount === '' ? NaN : parseFloat(amount);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const venture = await api<Venture>(`/ventures/${ventureId}`);
        if (cancelled) return;
        setPartners(venture.partners ?? []);
        if (!isAdmin && user?.id) {
          setFromPartnerId(user.id);
        } else if (!fromPartnerId && user?.id) {
          setFromPartnerId(user.id);
        }
      } catch {
        if (!cancelled) setError('Failed to load project partners');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ventureId, isAdmin, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Converts YYYY-MM-DD to ISO datetime for the API.
   * @param dateStr - Date input value
   */
  const toIsoDate = (dateStr: string): string => {
    const parsed = new Date(`${dateStr}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) throw new Error('Invalid date');
    return parsed.toISOString();
  };

  /**
   * Sets proof file and optional image preview.
   * @param f - Selected file or null
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

  /**
   * Uploads proof and creates the PARTNER_TRANSFER entry.
   * @param e - Form submit event
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!file) {
      setError('Screenshot / proof is required');
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError('Enter a valid amount greater than zero');
      return;
    }
    if (!fromPartnerId) {
      setError('Select who paid');
      return;
    }
    if (!toPartnerId) {
      setError('Select who received the money');
      return;
    }
    if (fromPartnerId === toPartnerId) {
      setError('Payer and receiver must be different partners');
      return;
    }
    if (!paidFrom.trim()) {
      setError('Paid from is required');
      return;
    }
    if (!remark.trim()) {
      setError('Reason is required');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('ventureId', ventureId);
      const uploaded = await apiUpload<{ id: string }>('/files/upload', formData);

      const body: Record<string, unknown> = {
        type: 'PARTNER_TRANSFER',
        amount: amountNum,
        date: toIsoDate(entryDate),
        paidFrom: paidFrom.trim(),
        remark: remark.trim(),
        attachmentIds: [uploaded.id],
        beneficiaryPartnerId: toPartnerId,
        transferBucket,
      };
      if (isAdmin) body.partnerId = fromPartnerId;

      const txn = await api<Transaction>(`/ventures/${ventureId}/transactions`, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setAmount('');
      setEntryDate(new Date().toISOString().slice(0, 10));
      setPaidFrom('');
      setRemark('');
      setToPartnerId('');
      handleFile(null);
      onSuccess(txn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit transfer');
    } finally {
      setSubmitting(false);
    }
  };

  if (readOnly) {
    return (
      <div className="card max-w-lg" role="status">
        <h3 className="font-semibold text-lg mb-1">Partner transfer</h3>
        <p className="text-sm text-muted">
          This project is closed. New transfers cannot be added.
        </p>
      </div>
    );
  }

  const receiverOptions = partners.filter((p) => p._id !== fromPartnerId);

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="card max-w-lg space-y-5"
      aria-label="Add partner transfer"
    >
      <div>
        <h3 className="font-semibold text-lg mb-1">Log partner transfer</h3>
        <p className="text-sm text-muted">
          Personal money from one partner to another — adjusts fair share only (no project bank).
        </p>
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
        <label htmlFor="transferBucket" className="block text-sm font-medium mb-2">
          Applies to <span className="text-red-400">*</span>
        </label>
        <select
          id="transferBucket"
          value={transferBucket}
          onChange={(e) => setTransferBucket(e.target.value as TransferBucket)}
          className="input-field"
          required
          aria-label="Fair share bucket"
        >
          <option value="INVESTMENT">Partner Investment</option>
          <option value="EXPENSE">Direct Expense</option>
        </select>
      </div>

      {isAdmin ? (
        <div>
          <label htmlFor="fromPartner" className="block text-sm font-medium mb-2">
            From partner (payer) <span className="text-red-400">*</span>
          </label>
          <select
            id="fromPartner"
            value={fromPartnerId}
            onChange={(e) => {
              setFromPartnerId(e.target.value);
              if (e.target.value === toPartnerId) setToPartnerId('');
            }}
            className="input-field"
            required
            aria-label="Payer partner"
          >
            <option value="">Select payer</option>
            {partners.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium mb-1">From partner (payer)</p>
          <p className="text-sm text-muted">{user?.name ?? 'You'}</p>
        </div>
      )}

      <div>
        <label htmlFor="toPartner" className="block text-sm font-medium mb-2">
          To partner (receiver) <span className="text-red-400">*</span>
        </label>
        <select
          id="toPartner"
          value={toPartnerId}
          onChange={(e) => setToPartnerId(e.target.value)}
          className="input-field"
          required
          aria-label="Receiver partner"
        >
          <option value="">Select receiver</option>
          {receiverOptions.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="transferAmount" className="block text-sm font-medium mb-2">
          Amount <span className="text-red-400">*</span>
        </label>
        <input
          id="transferAmount"
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="input-field"
          required
          aria-label="Transfer amount"
        />
      </div>

      <div>
        <label htmlFor="transferDate" className="block text-sm font-medium mb-2">
          Date <span className="text-red-400">*</span>
        </label>
        <input
          id="transferDate"
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className="input-field"
          required
          aria-label="Transfer date"
        />
      </div>

      <div>
        <label htmlFor="transferPaidFrom" className="block text-sm font-medium mb-2">
          {sourceField.label} <span className="text-red-400">*</span>
        </label>
        <input
          id="transferPaidFrom"
          type="text"
          value={paidFrom}
          onChange={(e) => setPaidFrom(e.target.value)}
          className="input-field"
          placeholder={sourceField.placeholder}
          required
          aria-label={sourceField.label}
        />
      </div>

      <div>
        <label htmlFor="transferRemark" className="block text-sm font-medium mb-2">
          Reason <span className="text-red-400">*</span>
        </label>
        <textarea
          id="transferRemark"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          className="input-field min-h-[88px]"
          placeholder="e.g. Settling investment shortfall for March"
          required
          aria-label="Reason for transfer"
        />
      </div>

      <ProofUploadField file={file} preview={preview} onFileChange={handleFile} />

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={submitting}
        aria-busy={submitting}
      >
        {submitting
          ? 'Submitting...'
          : Number.isFinite(amountNum)
            ? `Submit ${formatINR(amountNum)}`
            : 'Submit transfer'}
      </button>
    </form>
  );
}
