export type BankAccountDraft = {
  _id?: string;
  label: string;
  bankName: string;
  accountHint: string;
  isActive: boolean;
};

interface BankAccountEditorProps {
  accounts: BankAccountDraft[];
  onChange: (accounts: BankAccountDraft[]) => void;
}

/**
 * Creates an empty bank-account draft row.
 */
export function emptyBankAccountDraft(): BankAccountDraft {
  return { label: '', bankName: '', accountHint: '', isActive: true };
}

/**
 * Repeater for admin create/edit project bank accounts.
 */
export default function BankAccountEditor({ accounts, onChange }: BankAccountEditorProps) {
  /**
   * Updates one field on a draft account row.
   * @param index - Row index
   * @param patch - Partial field updates
   */
  const updateRow = (index: number, patch: Partial<BankAccountDraft>) => {
    onChange(accounts.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  /**
   * Removes a bank account row by index.
   * @param index - Row index
   */
  const removeRow = (index: number) => {
    onChange(accounts.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3" aria-label="Project bank accounts">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Bank accounts</p>
        <button
          type="button"
          className="text-xs text-accent hover:underline"
          onClick={() => onChange([...accounts, emptyBankAccountDraft()])}
        >
          + Add account
        </button>
      </div>
      {accounts.length === 0 && (
        <p className="text-xs text-muted">
          Add at least one account so partners can invest and log bank outflows.
        </p>
      )}
      {accounts.map((acct, index) => (
        <div
          key={acct._id ?? `new-${index}`}
          className="rounded-xl border border-border p-3 space-y-2 bg-elevated/40"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Account {index + 1}</span>
            <button
              type="button"
              className="text-xs text-red-400 hover:underline"
              onClick={() => removeRow(index)}
              aria-label={`Remove bank account ${index + 1}`}
            >
              Remove
            </button>
          </div>
          <input
            className="input-field"
            placeholder="Label (e.g. HDFC Ops)"
            value={acct.label}
            onChange={(e) => updateRow(index, { label: e.target.value })}
            required={accounts.length > 0}
            aria-label={`Bank account ${index + 1} label`}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              className="input-field"
              placeholder="Bank name (optional)"
              value={acct.bankName}
              onChange={(e) => updateRow(index, { bankName: e.target.value })}
              aria-label={`Bank account ${index + 1} bank name`}
            />
            <input
              className="input-field"
              placeholder="Hint / last4 (optional)"
              value={acct.accountHint}
              onChange={(e) => updateRow(index, { accountHint: e.target.value })}
              aria-label={`Bank account ${index + 1} hint`}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={acct.isActive}
              onChange={(e) => updateRow(index, { isActive: e.target.checked })}
            />
            Active
          </label>
        </div>
      ))}
    </div>
  );
}
